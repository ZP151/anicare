import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

from PIL import Image


class OfflineEvaluatorCliTests(unittest.TestCase):
    def test_writes_deterministic_open_set_report_without_an_enablement_claim(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()

            gallery_a = self._image(images / "gallery-a.png", (230, 20, 20))
            gallery_b = self._image(images / "gallery-b.png", (20, 20, 230))
            known_a = self._image(images / "known-a.png", (220, 25, 25))
            unknown_c = self._image(images / "unknown-c.png", (20, 220, 20))

            manifest = {
                "schemaVersion": "a0-offline-eval.v1",
                "baselineVersion": "rgb-16x16-cosine.v1",
                "gallery": [
                    self._sample("gallery-a", "cat-a", "gallery-session-a", "source-a", gallery_a),
                    self._sample("gallery-b", "cat-b", "gallery-session-b", "source-b", gallery_b),
                ],
                "holdoutKnown": [
                    self._sample("known-a", "cat-a", "holdout-session-a", "holdout-source-a", known_a),
                ],
                "holdoutUnknown": [
                    self._sample("unknown-c", "cat-c", "holdout-session-c", "holdout-source-c", unknown_c),
                ],
                "train": [],
                "development": [],
            }
            manifest_path = root / "manifest.json"
            output_path = root / "report.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, output_path, threshold="0.80")

            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "complete")
            self.assertEqual(report["baselineVersion"], "rgb-16x16-cosine.v1")
            self.assertEqual(report["metrics"]["knownRecallAt3"], {"numerator": 1, "denominator": 1, "value": 1.0})
            self.assertEqual(report["metrics"]["unknownRejection"], {"numerator": 1, "denominator": 1, "value": 1.0})
            self.assertEqual(report["metrics"]["unknownLikelyMatch"], {"numerator": 0, "denominator": 1, "value": 0.0})
            self.assertFalse(report["passesBetaGate"])
            self.assertIn("No identity-recognition effect is measured", report["declaration"])
            self.assertEqual(report["queryOutcomes"][0]["rankedCatIds"][0], "cat-a")
            self.assertEqual(report["queryOutcomes"][1]["outcome"], "rejected")

    def test_records_threshold_rejection_and_predicted_cat_for_a_known_query(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()
            gallery = self._image(images / "gallery.png", (230, 20, 20))
            known = self._image(images / "known.png", (229, 20, 20))
            unknown = self._image(images / "unknown.png", (20, 220, 20))
            manifest = self._manifest(
                gallery=[self._sample("gallery", "cat-a", "session-a", "source-a", gallery)],
                known=[self._sample("known", "cat-a", "session-k", "source-k", known)],
            )
            manifest["holdoutUnknown"] = [self._sample("unknown", "cat-z", "session-u", "source-u", unknown)]
            manifest_path = root / "manifest.json"
            output_path = root / "report.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, output_path, threshold="1.00")

            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(report["manifestSha256"], hashlib.sha256(manifest_path.read_bytes()).hexdigest())
            self.assertTrue(report["queryOutcomes"][0]["rejected"])
            self.assertEqual(report["queryOutcomes"][0]["predictedCatId"], "cat-a")

    def test_rejects_a_holdout_query_that_shares_a_gallery_capture_session(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()
            gallery = self._image(images / "gallery.png", (230, 20, 20))
            query = self._image(images / "query.png", (220, 25, 25))
            manifest = self._manifest(
                gallery=[self._sample("gallery", "cat-a", "session-a", "source-a", gallery)],
                known=[self._sample("query", "cat-a", "session-a", "source-query", query)],
            )
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, root / "report.json", threshold="0.80")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("capture_session_leakage", result.stderr)

    def test_marks_metrics_incomplete_when_no_unknown_queries_are_supplied(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()
            gallery = self._image(images / "gallery.png", (230, 20, 20))
            query = self._image(images / "query.png", (220, 25, 25))
            manifest_path = root / "manifest.json"
            output_path = root / "report.json"
            manifest_path.write_text(json.dumps(self._manifest(
                gallery=[self._sample("gallery", "cat-a", "session-a", "source-a", gallery)],
                known=[self._sample("query", "cat-a", "session-q", "source-q", query)],
            )), encoding="utf-8")

            result = self._run_cli(manifest_path, output_path, threshold="0.80")

            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "incomplete")
            self.assertIsNone(report["metrics"]["knownRecallAt3"])
            self.assertIsNone(report["metrics"]["unknownRejection"])
            self.assertIsNone(report["metrics"]["unknownLikelyMatch"])
            self.assertFalse(report["passesBetaGate"])

    def test_nulls_all_metrics_when_the_holdout_has_no_known_queries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()
            gallery = self._image(images / "gallery.png", (230, 20, 20))
            unknown = self._image(images / "unknown.png", (20, 220, 20))
            manifest = self._manifest(
                gallery=[self._sample("gallery", "cat-a", "session-a", "source-a", gallery)],
                known=[],
            )
            manifest["holdoutUnknown"] = [self._sample("unknown", "cat-c", "session-u", "source-u", unknown)]
            manifest_path = root / "manifest.json"
            output_path = root / "report.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, output_path, threshold="0.80")

            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "incomplete")
            self.assertEqual(report["metrics"], {
                "knownRecallAt3": None,
                "unknownRejection": None,
                "unknownLikelyMatch": None,
            })

    def test_rejects_train_identity_leakage_into_the_holdout(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()
            gallery = self._image(images / "gallery.png", (230, 20, 20))
            query = self._image(images / "query.png", (220, 25, 25))
            train = self._image(images / "train.png", (225, 30, 30))
            manifest = self._manifest(
                gallery=[self._sample("gallery", "cat-a", "session-a", "source-a", gallery)],
                known=[self._sample("query", "cat-a", "session-q", "source-q", query)],
            )
            manifest["train"] = [self._sample("train", "cat-a", "session-t", "source-t", train)]
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, root / "report.json", threshold="0.80")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("train_dev_identity_leakage", result.stderr)

    def test_rejects_development_identity_that_occurs_only_in_extra_gallery_reference(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()
            gallery_a = self._image(images / "gallery-a.png", (230, 20, 20))
            gallery_b = self._image(images / "gallery-b.png", (20, 20, 230))
            known_b = self._image(images / "known-b.png", (25, 25, 220))
            development_a = self._image(images / "development-a.png", (220, 30, 30))
            manifest = self._manifest(
                gallery=[
                    self._sample("gallery-a", "cat-a", "session-a", "source-a", gallery_a),
                    self._sample("gallery-b", "cat-b", "session-b", "source-b", gallery_b),
                ],
                known=[self._sample("known-b", "cat-b", "session-k", "source-k", known_b)],
            )
            manifest["development"] = [
                self._sample("development-a", "cat-a", "session-d", "source-d", development_a)
            ]
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, root / "report.json", threshold="0.80")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("train_dev_identity_leakage", result.stderr)

    def test_rejects_too_many_raw_manifest_rows_before_opening_any_images(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sample = {
                "sampleId": "unreadable",
                "catId": "cat-a",
                "captureSession": "session-a",
                "sourceGroup": "source-a",
                "relativePath": "missing.png",
                "sha256": "0" * 64,
                "evaluationPermission": "granted",
                "license": "test-only-generated",
                "source": "unit-test",
                "withdrawal": "active",
            }
            manifest = self._manifest(gallery=[sample] * 10_001, known=[])
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, root / "report.json", threshold="0.80")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("excessive_samples", result.stderr)

    def test_rejects_an_oversized_image_before_decoding_pixels(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()
            oversized = images / "oversized.png"
            self._oversized_png_header(oversized, width=5000, height=4000)
            manifest = self._manifest(
                gallery=[self._sample("oversized", "cat-a", "session-a", "source-a", oversized)],
                known=[],
            )
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, root / "report.json", threshold="0.80")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("invalid_image_dimensions", result.stderr)

    def test_returns_only_unique_cat_ids_in_top_three_using_each_cats_best_reference_score(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            images = root / "images"
            images.mkdir()
            image_a_weak = self._image(images / "a-weak.png", (170, 60, 60))
            image_a_best = self._image(images / "a-best.png", (230, 20, 20))
            image_b = self._image(images / "b.png", (150, 70, 70))
            image_c = self._image(images / "c.png", (120, 90, 90))
            image_d = self._image(images / "d.png", (90, 120, 90))
            query = self._image(images / "query.png", (229, 20, 20))
            unknown = self._image(images / "unknown.png", (20, 220, 20))
            manifest = self._manifest(
                gallery=[
                    self._sample("a-weak", "cat-a", "session-a1", "source-a1", image_a_weak),
                    self._sample("a-best", "cat-a", "session-a2", "source-a2", image_a_best),
                    self._sample("b", "cat-b", "session-b", "source-b", image_b),
                    self._sample("c", "cat-c", "session-c", "source-c", image_c),
                    self._sample("d", "cat-d", "session-d", "source-d", image_d),
                ],
                known=[self._sample("query", "cat-a", "session-q", "source-q", query)],
            )
            manifest["holdoutUnknown"] = [self._sample("unknown", "cat-z", "session-u", "source-u", unknown)]
            manifest_path = root / "manifest.json"
            output_path = root / "report.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self._run_cli(manifest_path, output_path, threshold="0.80")

            self.assertEqual(result.returncode, 0, result.stderr)
            ranked = json.loads(output_path.read_text(encoding="utf-8"))["queryOutcomes"][0]["rankedCatIds"]
            self.assertEqual(ranked[0], "cat-a")
            self.assertEqual(len(ranked), 3)
            self.assertEqual(len(set(ranked)), 3)

    @staticmethod
    def _image(path: Path, color: tuple[int, int, int]) -> Path:
        Image.new("RGB", (12, 9), color).save(path)
        return path

    @staticmethod
    def _oversized_png_header(path: Path, width: int, height: int) -> None:
        header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        chunk = b"IHDR" + header
        path.write_bytes(
            b"\x89PNG\r\n\x1a\n"
            + struct.pack(">I", len(header))
            + chunk
            + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)
            + b"\x00\x00\x00\x00IEND\xaeB`\x82"
        )

    @staticmethod
    def _sample(sample_id: str, cat_id: str, capture_session: str, source_group: str, image_path: Path) -> dict[str, str]:
        return {
            "sampleId": sample_id,
            "catId": cat_id,
            "captureSession": capture_session,
            "sourceGroup": source_group,
            "relativePath": f"images/{image_path.name}",
            "sha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
            "evaluationPermission": "granted",
            "license": "test-only-generated",
            "source": "unit-test",
            "withdrawal": "active",
        }

    @staticmethod
    def _manifest(gallery: list[dict[str, str]], known: list[dict[str, str]]) -> dict[str, object]:
        return {
            "schemaVersion": "a0-offline-eval.v1",
            "gallery": gallery,
            "holdoutKnown": known,
            "holdoutUnknown": [],
            "train": [],
            "development": [],
        }

    @staticmethod
    def _run_cli(manifest_path: Path, output_path: Path, threshold: str) -> subprocess.CompletedProcess[str]:
        environment = {**os.environ, "PYTHONPATH": str(Path(__file__).parents[1] / "src")}
        return subprocess.run(
            [sys.executable, "-m", "animalhelper_ai.offline_eval", "--manifest", str(manifest_path), "--threshold", threshold, "--output", str(output_path)],
            cwd=Path(__file__).parents[1],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )


if __name__ == "__main__":
    unittest.main()
