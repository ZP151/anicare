from dataclasses import dataclass


@dataclass(frozen=True)
class OpenSetMetrics:
    recall_at_3: float
    unknown_rejection_rate: float
    unknown_likely_match_rate: float
    passes_beta_gate: bool


def _rate(matches: list[bool]) -> float:
    return sum(matches) / len(matches) if matches else 0.0


def evaluate_open_set(
    known_results: list[tuple[str, list[str]]],
    unknown_results: list[bool],
    unknown_likely_match: list[bool],
) -> OpenSetMetrics:
    if len(unknown_results) != len(unknown_likely_match):
        raise ValueError("Unknown result arrays must have the same length")

    recall_at_3 = _rate([expected in candidates[:3] for expected, candidates in known_results])
    unknown_rejection_rate = _rate(unknown_results)
    unknown_likely_match_rate = _rate(unknown_likely_match)
    return OpenSetMetrics(
        recall_at_3=recall_at_3,
        unknown_rejection_rate=unknown_rejection_rate,
        unknown_likely_match_rate=unknown_likely_match_rate,
        passes_beta_gate=(
            recall_at_3 >= 0.85
            and unknown_rejection_rate >= 0.80
            and unknown_likely_match_rate <= 0.05
        ),
    )

