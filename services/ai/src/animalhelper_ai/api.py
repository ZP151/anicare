from typing import Any

from fastapi import FastAPI, HTTPException
from mangum import Mangum

from .handler import handle_identify


app = FastAPI(title="AnimalHelper AI", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": "candidate-fusion-contract"}


@app.post("/v1/identify")
def identify(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return handle_identify(payload)
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


lambda_handler = Mangum(app)

