import json
import unittest
from pathlib import Path

from animalhelper_ai.evaluation import evaluate_open_set


class EvaluationTests(unittest.TestCase):
    def test_synthetic_open_set_fixture_passes_beta_gate(self) -> None:
        fixture = json.loads((Path(__file__).parent / "fixtures" / "open_set_cases.json").read_text())
        metrics = evaluate_open_set(
            [(item["expected"], item["candidates"]) for item in fixture["known"]],
            fixture["unknown_rejected"],
            fixture["unknown_likely_match"],
        )
        self.assertGreaterEqual(metrics.recall_at_3, 0.85)
        self.assertGreaterEqual(metrics.unknown_rejection_rate, 0.80)
        self.assertLessEqual(metrics.unknown_likely_match_rate, 0.05)
        self.assertTrue(metrics.passes_beta_gate)

    def test_reports_recall_at_three_and_unknown_rejection_without_cross_identity_leakage(self) -> None:
        metrics = evaluate_open_set(
            known_results=[
                ("cat-a", ["cat-b", "cat-a", "cat-c"]),
                ("cat-b", ["cat-b", "cat-c", "cat-a"]),
                ("cat-c", ["cat-a", "cat-b", "cat-d"]),
            ],
            unknown_results=[True, True, False, True, True],
            unknown_likely_match=[False, False, True, False, False],
        )

        self.assertAlmostEqual(metrics.recall_at_3, 2 / 3)
        self.assertEqual(metrics.unknown_rejection_rate, 0.8)
        self.assertEqual(metrics.unknown_likely_match_rate, 0.2)
        self.assertFalse(metrics.passes_beta_gate)


if __name__ == "__main__":
    unittest.main()
