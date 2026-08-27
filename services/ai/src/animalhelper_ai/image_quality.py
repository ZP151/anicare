"""Deterministic crop quality scaffold; this module is not an object detector."""

from __future__ import annotations

from math import isfinite
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

from .contracts import CropAssessment, CropBox


class CropPolicyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    min_dimension: FiniteFloat = Field(default=0.08, gt=0.0, le=1.0)
    min_quality: FiniteFloat = Field(default=0.55, ge=0.0, le=1.0)
    max_padding: FiniteFloat = Field(default=0.35, ge=0.0, le=1.0)


def assess_identity_crop(
    *,
    width: float | None = None,
    height: float | None = None,
    box: CropBox | None = None,
    face_count: int | None,
    quality: float,
    padding: float,
    exif_present: bool | None = None,
    metadata_present: bool | None = None,
    redaction_confirmed: bool,
    config: CropPolicyConfig | None = None,
) -> CropAssessment:
    """Apply fixed gates to upstream metadata and quality measurements.

    ``face_count`` is an input from a separate detector boundary.  No detector
    exists here; unavailable/unknown count therefore yields ``needs_review``.
    Metadata presence and unconfirmed redaction always reject.
    """
    if type(redaction_confirmed) is not bool:
        raise TypeError("redaction_confirmed must be an explicit boolean")
    if exif_present is not None and type(exif_present) is not bool:
        raise TypeError("exif_present must be an explicit boolean when supplied")
    if metadata_present is not None and type(metadata_present) is not bool:
        raise TypeError("metadata_present must be an explicit boolean when supplied")
    if face_count is not None and (type(face_count) is not int or face_count < 0):
        raise TypeError("face_count must be a non-negative integer or None")
    policy = config or CropPolicyConfig()
    reasons: list[str] = []
    if box is not None:
        width, height = box.width, box.height
    if width is None or height is None:
        reasons.append("out_of_bounds")
        width, height = 0.0, 0.0
    if not redaction_confirmed:
        reasons.append("redaction_unconfirmed")
    if exif_present is not False or metadata_present is not False:
        reasons.append("metadata_present")
    if (
        type(width) is bool
        or type(height) is bool
        or not isinstance(width, (int, float))
        or not isinstance(height, (int, float))
        or not isfinite(width)
        or not isfinite(height)
        or width <= 0
        or height <= 0
        or width > 1
        or height > 1
    ):
        reasons.append("out_of_bounds")
    elif width < policy.min_dimension or height < policy.min_dimension:
        reasons.append("tiny_crop")
    if (
        type(quality) is bool
        or not isinstance(quality, (int, float))
        or not isfinite(quality)
        or quality < policy.min_quality
        or quality > 1
    ):
        reasons.append("low_quality")
    if (
        type(padding) is bool
        or not isinstance(padding, (int, float))
        or not isfinite(padding)
        or padding < 0
        or padding > policy.max_padding
        or padding > 1
    ):
        reasons.append("excess_padding")
    if face_count is None:
        reasons.append("detector_unavailable")
    elif face_count == 0:
        reasons.append("zero_faces")
    elif face_count != 1:
        reasons.append("multiple_faces")

    if reasons:
        status: Literal["needs_review", "rejected"] = (
            "needs_review" if reasons == ["detector_unavailable"] else "rejected"
        )
        return CropAssessment._from_policy(status, reasons, "; ".join(reasons))
    return CropAssessment._from_policy("accepted", ["policy_passed"], "deterministic policy passed")


assess_crop = assess_identity_crop
