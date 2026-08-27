import hmac
import os
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from mangum import Mangum

from .contracts import IdentifyRequest
from .handler import handle_identify

app = FastAPI(title="WhiskerCommons AI", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)
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


@app.middleware("http")
async def authenticate_private_identify(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Authenticate before FastAPI reads or validates the private request body."""
    if request.method == "POST" and request.url.path == "/v1/identify":
        try:
            require_internal_token(request.headers.get(INTERNAL_TOKEN_HEADER))
        except HTTPException as error:
            return JSONResponse(status_code=error.status_code, content={"detail": error.detail})
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": "candidate-fusion-contract"}


@app.post("/v1/identify")
def identify(payload: IdentifyRequest) -> dict[str, object]:
    try:
        return handle_identify(payload.model_dump(by_alias=True))
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


lambda_handler = Mangum(app)
