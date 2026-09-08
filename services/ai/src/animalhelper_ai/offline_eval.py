"""Offline, manifest-gated visual baseline for licensed evaluation images.

This intentionally is not a learned cat-identity model. It only compares a
small, deterministic RGB layout descriptor on local files supplied by an
explicitly permitted manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import numpy as np
from PIL import Image

BASELINE_VERSION = "rgb-16x16-cosine.v1"
MAX_SAMPLES = 10_000
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 16_777_216
REQUIRED_SAMPLE_FIELDS = (
    "sampleId",
    "catId",
    "captureSession",
    "sourceGroup",
    "relativePath",
    "sha256",
    "evaluationPermission",
    "license",
    "source",
    "withdrawal",
)


class ManifestError(ValueError):
    """The local evaluation manifest is malformed, unsafe, or not eligible."""


@dataclass(frozen=True)
class Sample:
    sample_id: str
    cat_id: str
    capture_session: str
    source_group: str
    path: Path
    sha256: str
    descriptor: np.ndarray


def _fail(message: str) -> None:
    raise ManifestError(message)


def _nonempty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(f"invalid_{field}")
    return value.strip()


def _safe_image_path(manifest_root: Path, value: Any) -> Path:
    relative_path = _nonempty_string(value, "relativePath")
    if "://" in relative_path or "\\" in relative_path:
        _fail("unsafe_relativePath")
    parts = PurePosixPath(relative_path)
    if parts.is_absolute() or ".." in parts.parts or any(part in ("", ".") for part in parts.parts):
        _fail("unsafe_relativePath")
    resolved_root = manifest_root.resolve()
    candidate = (resolved_root.joinpath(*parts.parts)).resolve()
    if not candidate.is_relative_to(resolved_root):
        _fail("unsafe_relativePath")
    return candidate


def _sha256(path: Path) -> str:
    if not path.is_file() or path.stat().st_size > MAX_FILE_BYTES:
        _fail("invalid_image_file")
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _descriptor(path: Path) -> np.ndarray:
    try:
        with Image.open(path) as image:
            if image.width < 1 or image.height < 1 or image.width * image.height > MAX_PIXELS:
                _fail("invalid_image_dimensions")
            image.load()
            pixels = np.asarray(
                image.convert("RGB").resize((16, 16), Image.Resampling.BILINEAR), dtype=np.float32
            ).reshape(-1)
    except ManifestError:
        raise
    except Exception as error:
        raise ManifestError("invalid_image_file") from error
    norm = float(np.linalg.norm(pixels))
    if norm == 0:
        _fail("invalid_image_descriptor")
    return pixels / norm


def _parse_sample(manifest_root: Path, value: Any) -> Sample:
    if not isinstance(value, dict) or any(field not in value for field in REQUIRED_SAMPLE_FIELDS):
        _fail("invalid_sample")
    sample_id = _nonempty_string(value["sampleId"], "sampleId")
    cat_id = _nonempty_string(value["catId"], "catId")
    capture_session = _nonempty_string(value["captureSession"], "captureSession")
    source_group = _nonempty_string(value["sourceGroup"], "sourceGroup")
    permission = _nonempty_string(value["evaluationPermission"], "evaluationPermission")
    license_name = _nonempty_string(value["license"], "license")
    source = _nonempty_string(value["source"], "source")
    withdrawal = _nonempty_string(value["withdrawal"], "withdrawal")
    if permission != "granted" or withdrawal != "active" or not license_name or not source:
        _fail("evaluation_metadata_not_eligible")
    expected_hash = _nonempty_string(value["sha256"], "sha256").lower()
    if len(expected_hash) != 64 or any(character not in "0123456789abcdef" for character in expected_hash):
        _fail("invalid_sha256")
    path = _safe_image_path(manifest_root, value["relativePath"])
    if _sha256(path) != expected_hash:
        _fail("sha256_mismatch")
    return Sample(sample_id, cat_id, capture_session, source_group, path, expected_hash, _descriptor(path))


def _sample_list(manifest_root: Path, raw: list[Any]) -> list[Sample]:
    return [_parse_sample(manifest_root, item) for item in raw]


def _validate_leakage(
    gallery: list[Sample], holdout_known: list[Sample], holdout_unknown: list[Sample], train: list[Sample], development: list[Sample]
) -> None:
    all_samples = gallery + holdout_known + holdout_unknown + train + development
    if len(all_samples) > MAX_SAMPLES or len({sample.sample_id for sample in all_samples}) != len(all_samples):
        _fail("duplicate_or_excessive_samples")
    gallery_cat_ids = {sample.cat_id for sample in gallery}
    train_dev_cat_ids = {sample.cat_id for sample in train + development}
    holdout = holdout_known + holdout_unknown
    for query in holdout_known:
        if query.cat_id not in gallery_cat_ids:
            _fail("known_cat_absent_from_gallery")
    for query in holdout_unknown:
        if query.cat_id in gallery_cat_ids:
            _fail("unknown_cat_present_in_gallery")
    if train_dev_cat_ids.intersection(gallery_cat_ids.union(sample.cat_id for sample in holdout)):
        _fail("train_dev_identity_leakage")
    gallery_hashes = {sample.sha256 for sample in gallery}
    gallery_sessions = {sample.capture_session for sample in gallery}
    gallery_sources = {sample.source_group for sample in gallery}
    for query in holdout:
        if query.sha256 in gallery_hashes:
            _fail("image_hash_leakage")
        if query.capture_session in gallery_sessions:
            _fail("capture_session_leakage")
        if query.source_group in gallery_sources:
            _fail("source_group_leakage")


def _rank(query: Sample, gallery: list[Sample]) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for reference in gallery:
        score = float(np.dot(query.descriptor, reference.descriptor))
        scores[reference.cat_id] = max(scores.get(reference.cat_id, -1.0), score)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))[:3]


def _metric(numerator: int, denominator: int) -> dict[str, float | int] | None:
    if denominator == 0:
        return None
    return {"numerator": numerator, "denominator": denominator, "value": numerator / denominator}


def evaluate_manifest(manifest_path: Path, threshold: float) -> dict[str, Any]:
    if not -1.0 <= threshold <= 1.0:
        raise ManifestError("invalid_threshold")
    try:
        manifest_bytes = manifest_path.read_bytes()
        raw = json.loads(manifest_bytes)
    except Exception as error:
        raise ManifestError("invalid_manifest") from error
    if not isinstance(raw, dict) or raw.get("schemaVersion") != "a0-offline-eval.v1":
        _fail("invalid_schemaVersion")
    if raw.get("baselineVersion", BASELINE_VERSION) != BASELINE_VERSION:
        _fail("unsupported_baselineVersion")

    raw_splits: dict[str, list[Any]] = {}
    for key in ("gallery", "holdoutKnown", "holdoutUnknown", "train", "development"):
        split = raw.get(key)
        if not isinstance(split, list):
            _fail(f"invalid_{key}")
        raw_splits[key] = split
    if sum(len(split) for split in raw_splits.values()) > MAX_SAMPLES:
        _fail("excessive_samples")

    gallery = _sample_list(manifest_path.parent, raw_splits["gallery"])
    known = _sample_list(manifest_path.parent, raw_splits["holdoutKnown"])
    unknown = _sample_list(manifest_path.parent, raw_splits["holdoutUnknown"])
    train = _sample_list(manifest_path.parent, raw_splits["train"])
    development = _sample_list(manifest_path.parent, raw_splits["development"])
    _validate_leakage(gallery, known, unknown, train, development)

    outcomes: list[dict[str, Any]] = []
    known_hits = 0
    unknown_rejected = 0
    unknown_likely_match = 0
    can_rank = bool(gallery)
    query_splits = [(query, "holdout_known", True) for query in known]
    query_splits.extend((query, "holdout_unknown", False) for query in unknown)
    for query, split, is_known in query_splits:
        ranked = _rank(query, gallery) if can_rank else []
        ranked_ids = [cat_id for cat_id, _score in ranked]
        top_score = ranked[0][1] if ranked else None
        predicted_cat_id = ranked_ids[0] if ranked_ids else None
        rejected = top_score < threshold if top_score is not None else None
        if is_known:
            known_hits += int(query.cat_id in ranked_ids)
            outcome = "ranked" if can_rank else "incomplete"
        else:
            unknown_rejected += int(rejected is True)
            unknown_likely_match += int(can_rank and rejected is False)
            outcome = "rejected" if rejected is True else "likely_match" if can_rank else "incomplete"
        outcomes.append(
            {
                "sampleId": query.sample_id,
                "catId": query.cat_id,
                "split": split,
                "rankedCatIds": ranked_ids,
                "topScore": top_score,
                "predictedCatId": predicted_cat_id,
                "rejected": rejected,
                "outcome": outcome,
            }
        )

    complete = can_rank and bool(known) and bool(unknown)
    status = "complete" if complete else "incomplete"
    return {
        "schemaVersion": "a0-offline-eval-report.v1",
        "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "baselineVersion": BASELINE_VERSION,
        "threshold": threshold,
        "status": status,
        "sampleCounts": {
            "gallery": len(gallery),
            "holdoutKnown": len(known),
            "holdoutUnknown": len(unknown),
            "train": len(train),
            "development": len(development),
        },
        "catCounts": {
            "gallery": len({sample.cat_id for sample in gallery}),
            "holdoutKnown": len({sample.cat_id for sample in known}),
            "holdoutUnknown": len({sample.cat_id for sample in unknown}),
        },
        "metrics": {
            "knownRecallAt3": _metric(known_hits, len(known)) if complete else None,
            "unknownRejection": _metric(unknown_rejected, len(unknown)) if complete else None,
            "unknownLikelyMatch": _metric(unknown_likely_match, len(unknown)) if complete else None,
        },
        "queryOutcomes": outcomes,
        "passesBetaGate": False,
        "declaration": "No identity-recognition effect is measured until real licensed, permitted data is supplied. This offline RGB color/layout baseline does not authorize AI enablement.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the local A0 RGB color/layout baseline.")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--threshold", required=True, type=float)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args(argv)
    try:
        report = evaluate_manifest(arguments.manifest, arguments.threshold)
    except ManifestError as error:
        parser.error(str(error))
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
