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
    # Short-lived elevation for sensitive/irreversible actions (e.g. Tally export
    # egress). A fresh OTP re-verification mints a step-up token valid this long.
    step_up_expire_minutes: int = 5

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

    # ---- Object storage (media durability) --------------------------------
    # STORAGE_BACKEND selects where uploaded media lives:
    #   "local" (default) -> the MEDIA_DIR filesystem (dev / tests).
    #   "s3"              -> any S3-compatible store (Cloudflare R2 in prod).
    # With "s3" the app stores only the OBJECT KEY in media_url and resolves it
    # to a short-lived presigned GET URL at read time (private bucket). Extraction
    # (OCR/STT/vision) consumes URLs, so this is a drop-in. Set the S3_* group for
    # R2: endpoint https://<account>.r2.cloudflarestorage.com, region "auto".
    storage_backend: str = "local"
    s3_endpoint_url: str | None = None
    s3_bucket: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_region: str = "auto"
    # TTL (seconds) for presigned GET/PUT URLs. GET is used right before
    # extraction and for app display; PUT for the homeowner direct upload (R1).
    s3_presign_ttl: int = 3600

    # Nightly brief scheduler (APScheduler, in-process). Off by default so tests
    # and CI never spin a background scheduler.
    enable_scheduler: bool = False
    brief_hour: int = 7  # local hour (brief_timezone) to run the nightly brief
    brief_timezone: str = "Asia/Kolkata"
    # Trailing window (days, excluding the brief day) used to auto-learn an
    # expected daily headcount when a site has no explicit SiteBaseline. A site
    # with too little history in this window abstains rather than fabricate one.
    brief_baseline_history_days: int = 14

    # SLA escalation sweep (app.approvals.sla.run_sla_sweep). Runs every
    # ``sla_sweep_minutes`` when the scheduler is enabled — frequent so overdue
    # homeowner questions escalate promptly.
    sla_sweep_minutes: int = 20
    # Permit expiry/renewal/staleness sweep (app.permits.alerts.run_permit_sweep).
    # Runs once daily at ``permit_sweep_hour`` (local to brief_timezone).
    permit_sweep_hour: int = 6
    # Homeowner-request one-nudge sweep (app.homeowner.nudge.run_request_nudge_sweep).
    # Runs every ``request_nudge_sweep_minutes`` when the scheduler is enabled.
    request_nudge_sweep_minutes: int = 30

    # Quiet-period detection (H6 Slice Q). Fields only in H6.1 (no scheduler job
    # — that lands in H6·3). A site with no homeowner-visible signal for
    # ``quiet_threshold_days`` is "quiet"; ``quiet_cooldown_days`` spaces repeat
    # detections; the daily sweep runs at ``quiet_sweep_hour`` (local to
    # brief_timezone), mirroring ``permit_sweep_hour``.
    quiet_threshold_days: int = 3
    quiet_cooldown_days: int = 3
    quiet_sweep_hour: int = 6

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
