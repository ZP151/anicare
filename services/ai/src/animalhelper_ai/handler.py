from typing import Any

from .candidate_ranker import CandidateEvidence, rank_candidates


def handle_identify(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = payload.get("jobId")
    if not isinstance(job_id, str) or not job_id:
        raise ValueError("jobId is required")

    raw_candidates = payload.get("candidates")
    if not isinstance(raw_candidates, list):
        raise ValueError("candidates must be a list")

    evidence = [
        CandidateEvidence(
            animal_id=str(candidate["animalId"]),
            visual_similarity=float(candidate["visualSimilarity"]),
            trait_similarity=float(candidate["traitSimilarity"]),
            same_public_cell=bool(candidate["samePublicCell"]),
            time_similarity=float(candidate["timeSimilarity"]),
        )
        for candidate in raw_candidates
    ]
    result = rank_candidates(evidence)

    return {
        "jobId": job_id,
        "newCatRecommended": result.new_cat_recommended,
        "candidates": [
            {
                "animalId": candidate.animal_id,
                "confidenceBand": candidate.confidence_band,
                "reasons": list(candidate.reasons),
            }
            for candidate in result.candidates
        ],
    }

