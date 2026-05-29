from fastapi import FastAPI

import app.models  # noqa: F401  register ORM models
from app.common.errors import install_error_handlers

app = FastAPI(title="Constructo API", version="0.1.0", openapi_url="/openapi.json")
install_error_handlers(app)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
