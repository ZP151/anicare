"""Pure in-memory identify callback reducer.

The store is intentionally a contract test double, not a queue, database, or
network callback implementation.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic.types import AwareDatetime

from .contracts import ConfidenceBand, IdentifyRequest, StrictModel, _Id, _Reason

CallbackStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
TerminalStatus = ("succeeded", "failed", "cancelled")
_Attempt = Annotated[int, Field(ge=0, le=32)]


class JobResult(StrictModel):
    candidate_ids: list[_Id] = Field(alias="candidateIds", min_length=0, max_length=3)
    confidence_bands: list[ConfidenceBand] = Field(alias="confidenceBands", min_length=0, max_length=3)
    reasons: list[_Reason] = Field(min_length=0, max_length=12)
    new_cat_recommended: bool = Field(alias="newCatRecommended")

    @model_validator(mode="after")
    def matching_lengths_and_unique_ids(self) -> JobResult:
        if len(self.candidate_ids) != len(self.confidence_bands):
            raise ValueError("candidate IDs and confidence bands must have matching lengths")
        if len(self.candidate_ids) != len(set(self.candidate_ids)):
            raise ValueError("candidate IDs must be unique")
        return self

    @field_validator("reasons")
    @classmethod
    def safe_reasons(cls, value: list[str]) -> list[str]:
        forbidden = ("http://", "https://", "file:", "storage", "vector", "score", "location")
        if any(any(marker in reason.lower() for marker in forbidden) for reason in value):
            raise ValueError("public reasons cannot contain sensitive internal fields")
        return value


class FailedError(StrictModel):
    code: Literal["invalid_input", "provider_unavailable", "quality_rejected", "internal_error"]


class CallbackEvent(StrictModel):
    contract_version: Literal["identify-callback.v1"] = Field(
        default="identify-callback.v1", alias="contractVersion"
    )
    job_id: _Id = Field(alias="jobId")
    event_id: _Id = Field(alias="eventId")
    status: CallbackStatus
    attempt: _Attempt
    emitted_at: AwareDatetime = Field(alias="emittedAt")
    result: JobResult | None = None
    error: FailedError | None = None

    @model_validator(mode="after")
    def status_payload(self) -> CallbackEvent:
        if self.status == "succeeded" and self.result is None:
            raise ValueError("succeeded callback requires result")
        if self.status == "failed" and self.error is None:
            raise ValueError("failed callback requires bounded error")
        if self.status != "succeeded" and self.result is not None:
            raise ValueError("result is only valid for succeeded callbacks")
        if self.status != "failed" and self.error is not None:
            raise ValueError("error is only valid for failed callbacks")
        return self


class JobState(StrictModel):
    job_id: _Id = Field(alias="jobId")
    status: CallbackStatus
    attempt: _Attempt
    event_id: _Id = Field(alias="eventId")
    result: JobResult | None = None
    error: FailedError | None = None
    updated_at: AwareDatetime = Field(alias="updatedAt")


class CallbackStore:
    """Small deterministic reducer suitable for unit tests and local adapters."""

    def __init__(self) -> None:
        self._events: dict[tuple[str, str], CallbackEvent] = {}
        self._states: dict[str, JobState] = {}

    def apply(self, event: CallbackEvent) -> JobState:
        key = (event.job_id, event.event_id)
        previous_event = self._events.get(key)
        if previous_event is not None:
            if previous_event.model_dump() != event.model_dump():
                raise ValueError("callback event id was reused with a conflicting payload")
            return self._states[event.job_id]

        current = self._states.get(event.job_id)
        if current is None:
            if event.status != "queued":
                raise ValueError("first callback state must be queued")
        else:
            if event.attempt < current.attempt:
                # Keep an idempotency ledger entry for a stale delivery, but
                # never treat it as an accepted/current state transition.
                self._events[key] = event
                return current
            if event.emitted_at < current.updated_at:
                raise ValueError("state-changing callback timestamp moved backwards")
            if current.status in TerminalStatus:
                raise ValueError("terminal job state is immutable")
            valid = {
                "queued": {"queued", "running", "cancelled"},
                "running": {"running", "succeeded", "failed", "cancelled"},
            }
            if event.status not in valid[current.status]:
                raise ValueError(f"invalid callback transition {current.status}->{event.status}")

        state = JobState(
            jobId=event.job_id,
            status=event.status,
            attempt=event.attempt,
            eventId=event.event_id,
            result=event.result,
            error=event.error,
            updatedAt=event.emitted_at,
        )
        self._events[key] = event
        self._states[event.job_id] = state
        return state

    def get(self, job_id: str) -> JobState | None:
        return self._states.get(job_id)


IdentifyJobRequest = IdentifyRequest
