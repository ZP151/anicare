import unittest

from pydantic import ValidationError

from animalhelper_ai.handler import handle_identify


class HandlerTests(unittest.TestCase):
    def test_public_response_contains_bands_and_reasons_but_not_internal_scores(self) -> None:
        response = handle_identify(
            {
                "jobId": "job-1",
                "candidates": [
                    {
                        "animalId": "cat-a",
                        "visualSimilarity": 0.93,
                        "traitSimilarity": 1.0,
                        "samePublicCell": True,
                        "timeSimilarity": 0.9,
                    }
                ],
            }
        )

        self.assertEqual(response["jobId"], "job-1")
        self.assertEqual(response["candidates"][0]["confidenceBand"], "likely")
        self.assertNotIn("internalScore", response["candidates"][0])
        self.assertNotIn("percentage", response["candidates"][0])

    def test_legacy_adapter_rejects_forbidden_payload_fields(self) -> None:
        with self.assertRaises(ValidationError):
            handle_identify({"jobId": "job-1", "candidates": [], "imagePath": "secret.jpg"})

    def test_legacy_adapter_deduplicates_candidate_ids_before_public_output(self) -> None:
        response = handle_identify({
            "jobId": "job-1",
            "candidates": [
                {"animalId": "cat-a", "visualSimilarity": 0.9, "traitSimilarity": 0.8, "samePublicCell": True, "timeSimilarity": 0.8},
                {"animalId": "cat-a", "visualSimilarity": 0.7, "traitSimilarity": 0.8, "samePublicCell": True, "timeSimilarity": 0.8},
            ],
        })
        self.assertEqual([item["animalId"] for item in response["candidates"]], ["cat-a"])


if __name__ == "__main__":
    unittest.main()
