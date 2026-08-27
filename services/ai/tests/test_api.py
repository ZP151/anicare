import asyncio
import json
import os
import unittest
from typing import ClassVar
from unittest.mock import patch

from animalhelper_ai.api import INTERNAL_TOKEN_ENV, INTERNAL_TOKEN_HEADER, app


def invoke_identify(payload: dict[str, object], headers: dict[str, str]) -> tuple[int, str]:
    """Exercise FastAPI's ASGI HTTP boundary without a third-party client."""
    sent: list[dict[str, object]] = []
    body = json.dumps(payload).encode()
    request_headers = {"content-type": "application/json", **headers}
    encoded_headers = [(key.lower().encode(), value.encode()) for key, value in request_headers.items()]
    scope: dict[str, object] = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "path": "/v1/identify", "raw_path": b"/v1/identify",
        "query_string": b"", "headers": encoded_headers, "client": ("test", 0),
        "server": ("test", 80), "scheme": "http",
    }
    messages = [{"type": "http.request", "body": body, "more_body": False}]

    async def receive() -> dict[str, object]:
        return messages.pop(0) if messages else {"type": "http.disconnect"}

    async def send(message: dict[str, object]) -> None:
        sent.append(message)

    asyncio.run(app(scope, receive, send))
    response_body = b"".join(
        message.get("body", b"") for message in sent if message["type"] == "http.response.body"
    )
    return next(message["status"] for message in sent if message["type"] == "http.response.start"), response_body.decode()


class ApiAuthTests(unittest.TestCase):
    payload: ClassVar[dict[str, object]] = {"jobId": "job-1", "candidates": []}
    token: ClassVar[str] = "t" * 32

    def test_missing_or_weak_server_configuration_fails_closed(self) -> None:
        for configured in (None, "short"):
            with self.subTest(configured=configured), patch.dict(os.environ, {}, clear=True):
                if configured is not None:
                    os.environ[INTERNAL_TOKEN_ENV] = configured
                status, body = invoke_identify(self.payload, {})
                self.assertEqual(status, 503)
                self.assertNotIn("short", body)

    def test_missing_or_wrong_caller_token_is_unauthorized(self) -> None:
        with patch.dict(os.environ, {INTERNAL_TOKEN_ENV: self.token}, clear=True):
            for headers in ({}, {INTERNAL_TOKEN_HEADER: "w" * 32}):
                with self.subTest(headers=headers):
                    status, body = invoke_identify(self.payload, headers)
                    self.assertEqual(status, 401)
                    self.assertNotIn(self.token, body)

    def test_correct_internal_token_allows_strict_typed_request_without_leaking_token(self) -> None:
        with patch.dict(os.environ, {INTERNAL_TOKEN_ENV: self.token}, clear=True):
            status, body = invoke_identify(self.payload, {INTERNAL_TOKEN_HEADER: self.token})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["contractVersion"], "identify.v1")
        self.assertNotIn(self.token, body)
        self.assertNotIn("internalScore", body)

    def test_correct_token_does_not_bypass_strict_request_schema(self) -> None:
        with patch.dict(os.environ, {INTERNAL_TOKEN_ENV: self.token}, clear=True):
            status, body = invoke_identify(
                {**self.payload, "imagePath": "secret"},
                {INTERNAL_TOKEN_HEADER: self.token},
            )
        self.assertEqual(status, 422)
        self.assertNotIn(self.token, body)


if __name__ == "__main__":
    unittest.main()
