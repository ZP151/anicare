"""Versioned, deliberately narrow public AI contracts.

These models are transport contracts only.  They contain no image bytes, paths,
locations, vectors or model scores in public results.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator, model_validator
from pydantic.types import AwareDatetime

CONTRACT_VERSIONS = ("crop.v1", "embedding.v1", "identify.v1", "identify-callback.v1")
ConfidenceBand = Literal["likely", "possible", "weak"]
CropStatus = Literal["accepted", "needs_review", "rejected"]
ReasonCode = Literal[
    "policy_passed", "zero_faces", "multiple_faces", "detector_unavailable",
    "out_of_bounds", "tiny_crop", "low_quality", "excess_padding",
    "metadata_present", "redaction_unconfirmed",
]

_Id = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")]
_Reason = Annotated[str, Field(min_length=1, max_length=160)]
_Ratio = Annotated[FiniteFloat, Field(ge=0.0, le=1.0)]


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", strict=True, populate_by_name=True, validate_assignment=True
    )


class CropBox(StrictModel):
    """A finite normalized rectangle with positive area and no overflow."""

    x: _Ratio
    y: _Ratio
    width: Annotated[FiniteFloat, Field(gt=0.0, le=1.0)]
    height: Annotated[FiniteFloat, Field(gt=0.0, le=1.0)]

    @model_validator(mode="after")
    def stays_in_frame(self) -> CropBox:
        if self.x + self.width > 1.0 or self.y + self.height > 1.0:
            raise ValueError("crop box overflows normalized frame")
        return self


class IdentifyCandidate(StrictModel):
    animal_id: _Id = Field(alias="animalId")
    confidence_band: ConfidenceBand = Field(alias="confidenceBand")
    reasons: list[_Reason] = Field(min_length=1, max_length=4)

    @field_validator("reasons")
    @classmethod
    def safe_reasons(cls, value: list[str]) -> list[str]:
        forbidden = ("http://", "https://", "file:", "storage", "vector", "score", "location")
        if any(any(marker in reason.lower() for marker in forbidden) for reason in value):
            raise ValueError("public reasons cannot contain sensitive internal fields")
        return value


class IdentifyRequestCandidate(StrictModel):
    """Internal evidence accepted by the legacy adapter; never returned publicly."""

    animal_id: _Id = Field(alias="animalId")
    visual_similarity: _Ratio = Field(alias="visualSimilarity")
    trait_similarity: _Ratio = Field(alias="traitSimilarity")
    same_public_cell: bool = Field(alias="samePublicCell")
    time_similarity: _Ratio = Field(alias="timeSimilarity")


class IdentifyRequest(StrictModel):
    contract_version: Literal["identify.v1"] = Field(default="identify.v1", alias="contractVersion")
    job_id: _Id = Field(alias="jobId")
    candidates: list[IdentifyRequestCandidate] = Field(min_length=0, max_length=256)

    @field_validator("job_id")
    @classmethod
    def reject_sensitive_job_ids(cls, value: str) -> str:
        lowered = value.lower()
        if any(token in lowered for token in ("http://", "https://", "file:", "/", "\\", "location", "path")):
            raise ValueError("jobId must be a stable identifier, not a URL/path/location")
        return value


class IdentifyResult(StrictModel):
    contract_version: Literal["identify.v1"] = Field(alias="contractVersion")
    job_id: _Id = Field(alias="jobId")
    candidates: list[IdentifyCandidate] = Field(min_length=0, max_length=3)
    new_cat_recommended: bool = Field(alias="newCatRecommended")
    generated_at: AwareDatetime = Field(alias="generatedAt")

    @field_validator("candidates")
    @classmethod
    def unique_candidate_ids(cls, value: list[IdentifyCandidate]) -> list[IdentifyCandidate]:
        ids = [candidate.animal_id for candidate in value]
        if len(ids) != len(set(ids)):
            raise ValueError("candidate IDs must be unique")
        return value


class CropAssessment(StrictModel):
    contract_version: Literal["crop.v1"] = Field(alias="contractVersion")
    status: CropStatus
    reason_codes: list[ReasonCode] = Field(alias="reasonCodes", min_length=1, max_length=8)
    reason_text: _Reason = Field(alias="reasonText")

    @model_validator(mode="after")
    def forbid_direct_acceptance(self) -> CropAssessment:
        # Policy-created accepted assessments use model_construct through the
        # private factory below.  A caller cannot forge accepted via validation.
        if self.status == "accepted":
            raise ValueError("accepted is issued only by the deterministic crop policy")
        return self

    @classmethod
    def _from_policy(
        cls, status: CropStatus, reason_codes: list[str], reason_text: str
    ) -> CropAssessment:
        return cls.model_construct(
            contract_version="crop.v1", status=status,
            reason_codes=reason_codes[:8], reason_text=reason_text[:160]
        )


def require_aware_datetime(value: datetime) -> datetime:
    """Shared guard for callers that receive a datetime outside a model."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamp must be timezone-aware")
    return value


# Names used by early alpha callers; aliases retain one canonical schema.
NormalizedRect = CropBox
