import unittest
from datetime import datetime, timezone

from pydantic import ValidationError

from animalhelper_ai.jobs import CallbackEvent, CallbackStore, JobResult


class JobTests(unittest.TestCase):
    def _event(self, event_id: str, status: str, attempt: int, **kwargs: object) -> CallbackEvent:
        emitted_at = kwargs.pop("emittedAt", datetime.now(timezone.utc))
        return CallbackEvent(
            jobId="job-1", eventId=event_id, status=status, attempt=attempt,
            emittedAt=emitted_at, **kwargs
        )

    def test_duplicate_event_is_idempotent_and_conflicting_reuse_is_rejected(self) -> None:
        store = CallbackStore()
        event = self._event("evt-1", "running", 1)
        self.assertEqual(store.apply(event), store.apply(event))
        with self.assertRaises(ValueError):
            store.apply(self._event("evt-1", "cancelled", 1))

    def test_stale_attempt_cannot_replace_terminal_state(self) -> None:
        store = CallbackStore()
        store.apply(self._event("evt-1", "running", 1))
        store.apply(self._event("evt-2", "succeeded", 2, result=JobResult(
            candidateIds=["cat-a"], confidenceBands=["likely"], reasons=["visual"], newCatRecommended=False
        )))
        self.assertEqual(store.apply(self._event("evt-3", "running", 1)).status, "succeeded")
        with self.assertRaises(ValueError):
            store.apply(self._event("evt-4", "queued", 3))

    def test_result_is_bounded_and_public_serialization_has_no_scores_or_vectors(self) -> None:
        with self.assertRaises(ValidationError):
            JobResult(candidateIds=["cat-a", "cat-a"], confidenceBands=["weak", "weak"], reasons=["x"], newCatRecommended=False)
        event = self._event("evt-1", "succeeded", 1, result=JobResult(
            candidateIds=["cat-a"], confidenceBands=["possible"], reasons=["tentative"], newCatRecommended=False
        ))
        payload = event.model_dump(by_alias=True)
        self.assertNotIn("score", payload)
        self.assertNotIn("vector", payload)
        self.assertNotIn("path", payload)

    def test_callback_requires_timezone_and_status_specific_payload(self) -> None:
        with self.assertRaises(ValidationError):
            self._event("evt-naive", "running", 1, emittedAt=datetime.now())
        with self.assertRaises(ValidationError):
            self._event("evt-bad", "running", 1, result=JobResult(
                candidateIds=[], confidenceBands=[], reasons=["tentative"], newCatRecommended=True
            ))
        with self.assertRaises(ValidationError):
            self._event("evt-attempt", "running", 33)


if __name__ == "__main__":
    unittest.main()
