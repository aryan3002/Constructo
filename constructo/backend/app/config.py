from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment / .env file.

    Defaults match docker-compose.yml so tests and local dev work out of the box.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://constructo:constructo@localhost:5433/constructo"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "dev-secret-change-me-to-a-real-32byte-key"
    ingest_api_key: str = "dev-ingest-key"

    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    # Browser origins allowed to call the API (CORS). The web dashboard dev
    # server runs on 5173 (Vite); 3000 covered for alternate setups.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # ---- Wave 2 integration ------------------------------------------------

    # Extraction queue. When EXTRACTION_SYNC is true the ingest endpoint runs
    # extraction inline (tests / local without a worker) instead of enqueuing on
    # Redis. The RQ queue name is configurable.
    extraction_sync: bool = False
    extraction_queue: str = "extraction"

    # Shared media folder. The WhatsApp bridge writes downloaded media here and
    # extraction (OCR/STT) reads it back. Both sides must agree on this path.
    # Default is <repo>/media; the bridge defaults to the same (see whatsapp-bridge).
    media_dir: str = "./media"

    # Nightly brief scheduler (APScheduler, in-process). Off by default so tests
    # and CI never spin a background scheduler.
    enable_scheduler: bool = False
    brief_hour: int = 7  # local hour (brief_timezone) to run the nightly brief
    brief_timezone: str = "Asia/Kolkata"

    # SLA escalation sweep (app.approvals.sla.run_sla_sweep). Runs every
    # ``sla_sweep_minutes`` when the scheduler is enabled — frequent so overdue
    # homeowner questions escalate promptly.
    sla_sweep_minutes: int = 20
    # Permit expiry/renewal/staleness sweep (app.permits.alerts.run_permit_sweep).
    # Runs once daily at ``permit_sweep_hour`` (local to brief_timezone).
    permit_sweep_hour: int = 6

    # WhatsApp send transport. One of: "dry_run" | "url" | "cloud_api".
    whatsapp_send_mode: str = "dry_run"
    whatsapp_send_url: str | None = None  # used by "url" mode
    whatsapp_token: str | None = None  # Bearer token for "cloud_api" mode
    whatsapp_phone_number_id: str | None = None  # Cloud API phone number id

    # ---- WhatsApp bot ("Nivaan") -------------------------------------------
    # When true, after extraction the bot reacts/replies to inbound messages
    # (the Guest Rule) and the nightly job delivers the brief over WhatsApp. The
    # bot is best-effort and NEVER fails ingestion. The outbound transport and
    # bridge link are read from the environment by app.bot.sender:
    #   BOT_SEND_VIA = bridge | cloud_api | dry_run  (default dry_run -> no network)
    #   BRIDGE_URL   = http://localhost:8088         (the W1 Node bridge)
    #   BRIDGE_KEY   = shared secret (must match the bridge's BRIDGE_KEY)
    bot_enabled: bool = True


settings = Settings()
