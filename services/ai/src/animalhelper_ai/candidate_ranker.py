from dataclasses import dataclass
from typing import Literal


ConfidenceBand = Literal["likely", "possible", "weak"]


@dataclass(frozen=True)
class CandidateEvidence:
    animal_id: str
    visual_similarity: float
    trait_similarity: float
    same_public_cell: bool
    time_similarity: float


@dataclass(frozen=True)
class RankedCandidate:
    animal_id: str
    confidence_band: ConfidenceBand
    reasons: tuple[str, ...]
    internal_score: float


@dataclass(frozen=True)
class RankingResult:
    candidates: tuple[RankedCandidate, ...]
    new_cat_recommended: bool


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _score(evidence: CandidateEvidence) -> float:
    return (
        0.85 * _clamp(evidence.visual_similarity)
        + 0.10 * _clamp(evidence.trait_similarity)
        + 0.03 * float(evidence.same_public_cell)
        + 0.02 * _clamp(evidence.time_similarity)
    )


def _band(score: float) -> ConfidenceBand:
    if score >= 0.82:
        return "likely"
    if score >= 0.65:
        return "possible"
    return "weak"


def _reasons(evidence: CandidateEvidence) -> tuple[str, ...]:
    reasons: list[str] = []
    if evidence.visual_similarity >= 0.85:
        reasons.append("strong visual match")
    elif evidence.visual_similarity >= 0.65:
        reasons.append("similar face and coat")
    if evidence.trait_similarity >= 0.8:
        reasons.append("matching reported traits")
    if evidence.same_public_cell:
        reasons.append("same community cell")
    return tuple(reasons or ["limited supporting evidence"])


def rank_candidates(evidence: list[CandidateEvidence]) -> RankingResult:
    ranked = sorted(
        (
            RankedCandidate(
                animal_id=item.animal_id,
                confidence_band=_band(_score(item)),
                reasons=_reasons(item),
                internal_score=_score(item),
            )
            for item in evidence
        ),
        key=lambda candidate: candidate.internal_score,
        reverse=True,
    )[:3]
    top_score = ranked[0].internal_score if ranked else 0.0
    return RankingResult(candidates=tuple(ranked), new_cat_recommended=top_score < 0.65)

