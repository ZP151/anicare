import hmac
import os

from fastapi import FastAPI, Header, HTTPException
from mangum import Mangum

from .contracts import IdentifyRequest
from .handler import handle_identify

app = FastAPI(title="WhiskerCommons AI", version="0.1.0")
INTERNAL_TOKEN_ENV = "WHISKER_INTERNAL_AI_TOKEN"
INTERNAL_TOKEN_HEADER = "X-Whisker-Internal-Token"
MIN_INTERNAL_TOKEN_LENGTH = 32


def require_internal_token(caller_token: str | None, configured_token: str | None = None) -> None:
    """Authorize the private alpha route without exposing credential details."""
    expected = os.environ.get(INTERNAL_TOKEN_ENV) if configured_token is None else configured_token
    if (
        not isinstance(expected, str)
        or len(expected) < MIN_INTERNAL_TOKEN_LENGTH
        or len(expected) > 256
        or not expected.strip()
    ):
        raise HTTPException(status_code=503, detail="AI service unavailable")
    if not isinstance(caller_token, str) or not hmac.compare_digest(caller_token, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": "candidate-fusion-contract"}


@app.post("/v1/identify")
def identify(
    payload: IdentifyRequest,
    internal_token: str | None = Header(default=None, alias=INTERNAL_TOKEN_HEADER),
) -> dict[str, object]:
    try:
        require_internal_token(internal_token)
        return handle_identify(payload.model_dump(by_alias=True))
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


lambda_handler = Mangum(app)
