import sys
from contextlib import asynccontextmanager

# Load .env into os.environ when running the server (uvicorn), so provider code
# that reads os.environ directly (extraction LLM/STT/OCR, brief send) sees the
# configured credentials without a manual `set -a && . .env`. Skipped under
# pytest so tests keep full control of the environment via monkeypatch.
if "pytest" not in sys.modules:
    from dotenv import load_dotenv

    load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401  register ORM models
from app.approvals.router import router as approvals_router
from app.attendance.router import router as attendance_router
from app.auth.router import router as auth_router
from app.auth.router import users_router
from app.brief.router import router as brief_router
from app.common.errors import install_error_handlers
from app.config import settings
from app.dashboard.router import router as dashboard_router  # phaseB brief/owner
from app.ingestion.router import router as ingest_router
from app.invites.router import router as invites_router
from app.notifications.router import router as notifications_router
from app.reconcile.router import router as reconcile_router
from app.scheduler import shutdown_scheduler, start_scheduler
from app.search.router import router as search_router
from app.sites.router import router as sites_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Nightly brief scheduler (no-op unless ENABLE_SCHEDULER=true).
    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(
    title="Constructo API", version="0.1.0", openapi_url="/openapi.json", lifespan=lifespan
)
install_error_handlers(app)

# CORS: allow the web dashboard (and other configured origins) to call the API
# from the browser. Without this, cross-origin fetches (e.g. localhost:5173 ->
# localhost:8000) are blocked by the browser and login silently fails.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(invites_router)
app.include_router(ingest_router)
app.include_router(sites_router)
app.include_router(brief_router)
app.include_router(dashboard_router)  # phaseB brief/owner
app.include_router(attendance_router)  # phaseB capture/attendance
app.include_router(reconcile_router)  # phaseB reconcile
app.include_router(approvals_router)  # phaseB approvals
app.include_router(notifications_router)  # phaseB notifications
app.include_router(search_router)  # phaseB search
