from fastapi import FastAPI, HTTPException
from mangum import Mangum

from .contracts import IdentifyRequest
from .handler import handle_identify

app = FastAPI(title="WhiskerCommons AI", version="0.1.0")


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
