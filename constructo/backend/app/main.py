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
from app.action_items.router import router as action_items_router
from app.admin.router import router as admin_router
from app.agent.router import router as ask_router
from app.approvals.router import router as approvals_router
from app.attendance.router import router as attendance_router
from app.auth.router import me_router, users_router
from app.auth.router import router as auth_router
from app.billing.router import router as billing_router
from app.bot.router import router as bot_router
from app.brief.router import router as brief_router
from app.capture.router import router as capture_router
from app.chat.router import router as chat_router
from app.common.errors import install_error_handlers
from app.config import settings
from app.dashboard.router import router as dashboard_router  # phaseB brief/owner
from app.disputes.router import router as disputes_router
from app.dpr.router import router as dpr_router  # C4 PM Auto-DPR
from app.forecast.router import router as forecast_router
from app.homeowner.router import router as homeowner_router
from app.ingestion.router import router as ingest_router
from app.invites.router import router as invites_router
from app.materials.router import router as materials_router
from app.notifications.router import router as notifications_router
from app.payments.router import router as payments_router
from app.permits.router import router as permits_router
from app.portfolio.router import router as portfolio_router
from app.publish.router import router as publish_router
from app.reconcile.router import router as reconcile_router
from app.scheduler import shutdown_scheduler, start_scheduler
from app.search.router import router as search_router
from app.sentinel.router import router as sentinel_router
from app.sites.router import router as sites_router
from app.vendors.router import router as vendors_router


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
    # Also allow localhost + private-LAN origins on any port so `expo start --web`
    # works when the phone/dev machine hits the backend over its LAN IP. (Native
    # Expo Go / emulator fetches are not subject to CORS at all.)
    allow_origin_regex=(
        r"https?://("
        r"localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(me_router)  # C-F /me/push-token
app.include_router(invites_router)
app.include_router(ingest_router)
app.include_router(sites_router)
app.include_router(vendors_router)
app.include_router(materials_router)
app.include_router(billing_router)
app.include_router(brief_router)
app.include_router(dpr_router)  # C4 PM Auto-DPR
app.include_router(dashboard_router)  # phaseB brief/owner
app.include_router(attendance_router)  # phaseB capture/attendance
app.include_router(reconcile_router)  # phaseB reconcile
app.include_router(approvals_router)  # phaseB approvals
app.include_router(notifications_router)  # phaseB notifications
app.include_router(search_router)  # phaseB search
app.include_router(payments_router)  # phaseB payments
app.include_router(permits_router)  # phaseB permits
app.include_router(admin_router)  # phaseC admin/ops triggers
app.include_router(bot_router)  # W2 WhatsApp bot brain (Nivaan)
app.include_router(homeowner_router)  # H0 homeowner-facing app API
app.include_router(publish_router)  # H0 contractor-side publisher controls
app.include_router(capture_router)  # app-authenticated field capture → extraction
app.include_router(chat_router)  # Phase 1.0 in-app chat (crew site thread)
app.include_router(action_items_router)  # Phase 1.6 action items / to-dos
app.include_router(disputes_router)  # Phase 1.7 contested-truth (disputes)
app.include_router(ask_router)  # Phase 2.2 Ask-the-Project (deterministic aggregation)
app.include_router(forecast_router)  # Phase 3.3 deterministic forecasting
app.include_router(portfolio_router)  # Phase 3.4 portfolio exact-math Q&A
app.include_router(sentinel_router)  # Phase 3.1 Standing Sentinel (absence radar)
