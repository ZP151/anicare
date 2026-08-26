import unittest

from animalhelper_ai.candidate_ranker import CandidateEvidence, rank_candidates


class CandidateRankerTests(unittest.TestCase):
    def test_returns_top_three_with_bands_and_human_readable_reasons(self) -> None:
        candidates = [
            CandidateEvidence("cat-a", 0.93, 1.0, True, 0.9),
            CandidateEvidence("cat-b", 0.84, 0.8, True, 0.7),
            CandidateEvidence("cat-c", 0.72, 0.9, False, 0.5),
            CandidateEvidence("cat-d", 0.61, 1.0, True, 1.0),
        ]

        result = rank_candidates(candidates)

        self.assertEqual([candidate.animal_id for candidate in result.candidates], ["cat-a", "cat-b", "cat-c"])
        self.assertEqual(result.candidates[0].confidence_band, "likely")
        self.assertIn("strong visual match", result.candidates[0].reasons)
        self.assertIn("same community cell", result.candidates[0].reasons)
        self.assertFalse(result.new_cat_recommended)

    def test_recommends_new_cat_when_no_candidate_reaches_the_operating_threshold(self) -> None:
        result = rank_candidates(
            [
                CandidateEvidence("cat-a", 0.51, 0.4, False, 0.2),
                CandidateEvidence("cat-b", 0.48, 0.5, True, 0.3),
            ]
        )

        self.assertTrue(result.new_cat_recommended)
        self.assertTrue(all(candidate.confidence_band == "weak" for candidate in result.candidates))


if __name__ == "__main__":
    unittest.main()

