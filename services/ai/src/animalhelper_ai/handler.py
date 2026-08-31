from datetime import UTC, datetime
from typing import Any

from .candidate_ranker import CandidateEvidence, rank_candidates
from .contracts import IdentifyCandidate, IdentifyRequest, IdentifyResult


def handle_identify(payload: dict[str, Any]) -> dict[str, Any]:
    request = IdentifyRequest.model_validate(payload)
    evidence = [
        CandidateEvidence(
            animal_id=candidate.animal_id,
            visual_similarity=candidate.visual_similarity,
            trait_similarity=candidate.trait_similarity,
            same_public_cell=candidate.same_public_cell,
            time_similarity=candidate.time_similarity,
        )
        for candidate in request.candidates
    ]
    result = rank_candidates(evidence)
    public_result = IdentifyResult(
        contractVersion="identify.v1",
        jobId=request.job_id,
        newCatRecommended=result.new_cat_recommended,
        generatedAt=datetime.now(UTC),
        candidates=[
            IdentifyCandidate(
                animalId=candidate.animal_id,
                confidenceBand=candidate.confidence_band,
                reasons=list(candidate.reasons),
            )
            for candidate in result.candidates
        ],
    )
    return public_result.model_dump(by_alias=True)
