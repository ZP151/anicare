"""Model-free embedding protocol and deterministic synthetic provider."""

from __future__ import annotations

import hashlib
import math
import random
from typing import Annotated, Protocol

from pydantic import Field, FiniteFloat, field_validator

from .contracts import StrictModel, _Id


EMBEDDING_DIMENSION = 384
NORMALIZATION_TOLERANCE = 1e-3
_Version = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")]


class EmbeddingRequest(StrictModel):
    dimension: int = Field(default=EMBEDDING_DIMENSION, ge=EMBEDDING_DIMENSION, le=EMBEDDING_DIMENSION)
    crop_id: _Id = Field(alias="cropId")
    model_version: _Version = Field(alias="modelVersion")
    preprocessing_version: _Version = Field(alias="preprocessingVersion")


class EmbeddingVector(StrictModel):
    dimension: int = Field(default=EMBEDDING_DIMENSION, ge=EMBEDDING_DIMENSION, le=EMBEDDING_DIMENSION)
    values: list[FiniteFloat] = Field(min_length=EMBEDDING_DIMENSION, max_length=EMBEDDING_DIMENSION)
    model_version: _Version = Field(alias="modelVersion")
    preprocessing_version: _Version = Field(alias="preprocessingVersion")
    crop_id: _Id = Field(alias="cropId")

    @field_validator("values")
    @classmethod
    def l2_normalized(cls, value: list[float]) -> list[float]:
        norm = math.sqrt(sum(item * item for item in value))
        if not math.isfinite(norm) or abs(norm - 1.0) > NORMALIZATION_TOLERANCE:
            raise ValueError("embedding must be L2 normalized")
        return value


class EmbeddingProvider(Protocol):
    def embed(self, request: EmbeddingRequest) -> EmbeddingVector: ...


class SyntheticEmbeddingProvider:
    """Deterministic test provider; no files, images, network or model weights."""

    def embed(self, request: EmbeddingRequest) -> EmbeddingVector:
        seed = int.from_bytes(hashlib.sha256(request.crop_id.encode("utf-8")).digest()[:8], "big")
        generator = random.Random(seed)
        values = [generator.gauss(0.0, 1.0) for _ in range(EMBEDDING_DIMENSION)]
        norm = math.sqrt(sum(item * item for item in values))
        return EmbeddingVector(
            dimension=EMBEDDING_DIMENSION,
            values=[item / norm for item in values],
            modelVersion=request.model_version,
            preprocessingVersion=request.preprocessing_version,
            cropId=request.crop_id,
        )


class EmbeddingUnavailable(RuntimeError):
    """Raised by an unavailable provider; callers must not continue matching."""


class UnavailableEmbeddingProvider:
    def embed(self, request: EmbeddingRequest) -> EmbeddingVector:
        raise EmbeddingUnavailable("embedding provider unavailable; identity matching is disabled")


def ensure_compatible(vector: EmbeddingVector, request: EmbeddingRequest) -> None:
    if (
        vector.model_version != request.model_version
        or vector.preprocessing_version != request.preprocessing_version
        or vector.crop_id != request.crop_id
    ):
        raise ValueError("mixed model, preprocessing, or crop bindings cannot be compared")


def ensure_vectors_compatible(left: EmbeddingVector, right: EmbeddingVector) -> None:
    if (
        left.dimension != right.dimension
        or left.model_version != right.model_version
        or left.preprocessing_version != right.preprocessing_version
    ):
        raise ValueError("mixed model, preprocessing, or dimensions cannot be compared")
