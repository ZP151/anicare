import unittest

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


if __name__ == "__main__":
    unittest.main()

