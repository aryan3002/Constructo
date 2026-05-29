from fastapi import FastAPI

import app.models  # noqa: F401  register ORM models

app = FastAPI(title="Constructo API", version="0.1.0", openapi_url="/openapi.json")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
