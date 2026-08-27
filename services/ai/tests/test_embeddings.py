import math
import unittest

from pydantic import ValidationError

from animalhelper_ai.embeddings import (
    EmbeddingRequest,
    EmbeddingVector,
    SyntheticEmbeddingProvider,
    ensure_compatible,
)


class EmbeddingTests(unittest.TestCase):
    def test_synthetic_provider_returns_exact_finite_normalized_dimension(self) -> None:
        request = EmbeddingRequest(
            cropId="crop-1", modelVersion="synthetic.v1", preprocessingVersion="crop.v1"
        )
        vector = SyntheticEmbeddingProvider().embed(request)
        self.assertEqual(len(vector.values), 384)
        self.assertTrue(all(math.isfinite(item) for item in vector.values))
        self.assertAlmostEqual(math.sqrt(sum(item * item for item in vector.values)), 1.0, places=5)

    def test_wrong_dimension_or_nonfinite_vectors_are_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            EmbeddingVector(values=[0.0] * 383, modelVersion="m.v1", preprocessingVersion="crop.v1", cropId="c")
        with self.assertRaises(ValidationError):
            EmbeddingVector(values=[float("nan")] * 384, modelVersion="m.v1", preprocessingVersion="crop.v1", cropId="c")

    def test_mixed_model_preprocessing_or_crop_binding_is_incompatible(self) -> None:
        request = EmbeddingRequest(cropId="crop-1", modelVersion="m.v1", preprocessingVersion="crop.v1")
        vector = SyntheticEmbeddingProvider().embed(request)
        ensure_compatible(vector, EmbeddingRequest(cropId="crop-1", modelVersion="m.v1", preprocessingVersion="crop.v1"))
        with self.assertRaises(ValueError):
            ensure_compatible(vector, EmbeddingRequest(cropId="crop-1", modelVersion="m.v2", preprocessingVersion="crop.v1"))


if __name__ == "__main__":
    unittest.main()
