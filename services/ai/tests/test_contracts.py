import unittest
from datetime import UTC, datetime

from pydantic import ValidationError

from animalhelper_ai.contracts import (
    CONTRACT_VERSIONS,
    CropBox,
    IdentifyCandidate,
    IdentifyRequest,
    IdentifyResult,
)


class ContractTests(unittest.TestCase):
    def test_contract_versions_are_exact(self) -> None:
        self.assertEqual(
            CONTRACT_VERSIONS,
            ("crop.v1", "embedding.v1", "identify.v1", "identify-callback.v1"),
        )

    def test_box_is_normalized_finite_positive_and_in_bounds(self) -> None:
        self.assertEqual(CropBox(x=0.1, y=0.2, width=0.4, height=0.3).model_dump(), {
            "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.3
        })
        for values in (
            {"x": -0.1, "y": 0, "width": 0.2, "height": 0.2},
            {"x": 0.9, "y": 0, "width": 0.2, "height": 0.2},
            {"x": 0, "y": 0, "width": 0, "height": 0.2},
            {"x": 0, "y": 0, "width": "NaN", "height": 0.2},
        ):
            with self.assertRaises(ValidationError):
                CropBox(**values)

    def test_strict_models_forbid_unknown_fields_and_naive_timestamps(self) -> None:
        with self.assertRaises(ValidationError):
            IdentifyRequest(jobId="job-1", candidates=[], unexpected=True)
        with self.assertRaises(ValidationError):
            IdentifyResult(
                contractVersion="identify.v1",
                jobId="job-1",
                candidates=[],
                newCatRecommended=True,
                generatedAt=datetime.now(UTC).replace(tzinfo=None),
            )

    def test_public_result_has_only_tentative_allowlisted_fields(self) -> None:
        result = IdentifyResult(
            contractVersion="identify.v1",
            jobId="job-1",
            candidates=[
                IdentifyCandidate(animalId="cat-a", confidenceBand="possible", reasons=["coat"])
            ],
            newCatRecommended=False,
            generatedAt=datetime.now(UTC),
        )
        serialized = result.model_dump(by_alias=True)
        self.assertNotIn("internalScore", serialized)
        self.assertNotIn("vector", serialized)
        self.assertNotIn("location", serialized)
        self.assertNotIn("storagePath", serialized)

    def test_validated_wire_input_cannot_set_accepted_status(self) -> None:
        from animalhelper_ai.contracts import CropAssessment

        with self.assertRaises(ValidationError):
            CropAssessment(
                contractVersion="crop.v1",
                status="accepted",
                reasonCodes=["policy_passed"],
                reasonText="policy passed",
            )


if __name__ == "__main__":
    unittest.main()
