from fastapi import FastAPI

import app.models  # noqa: F401  register ORM models
from app.auth.router import router as auth_router
from app.brief.router import router as brief_router
from app.common.errors import install_error_handlers
from app.ingestion.router import router as ingest_router
from app.sites.router import router as sites_router

app = FastAPI(title="Constructo API", version="0.1.0", openapi_url="/openapi.json")
install_error_handlers(app)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(sites_router)
app.include_router(brief_router)
