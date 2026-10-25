from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The public, in-repo dev JWT secret. Convenient for local/CI, but a deploy that
# ships it lets anyone forge tokens — the prod guard below refuses to boot on it.
_DEV_JWT_SECRET = "dev-secret-change-me-to-a-real-32byte-key"
# Same for the in-repo service keys (ingest/bot and the WhatsApp bridge).
_DEV_INGEST_KEY = "dev-ingest-key"
_DEV_BRIDGE_KEY = "dev-bridge-key"
_MIN_SERVICE_KEY_LEN = 24


class Settings(BaseSettings):
    """Application settings, loaded from environment / .env file.

    Defaults match docker-compose.yml so tests and local dev work out of the box.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Deployment posture. "dev"/"test" (default) keep the convenient open defaults
    # for local/CI; set APP_ENV=prod on a real deploy and the validator below
    # REFUSES to boot in an insecure posture (world-open auth / dev JWT secret),
    # so the Phase-0 lock lives in code and can't silently regress on a redeploy.
    app_env: str = "dev"

    database_url: str = "postgresql+asyncpg://constructo:constructo@localhost:5433/constructo"
    redis_url: str = "redis://localhost:6379/0"
    # Chat realtime fan-out: "memory" (single process; tests/dev) or "redis"
    # (multi-worker / multi-replica prod).
    chat_realtime: str = "memory"
    jwt_secret: str = _DEV_JWT_SECRET
    ingest_api_key: str = _DEV_INGEST_KEY

    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    # Short-lived elevation for sensitive/irreversible actions (e.g. Tally export
    # egress). A fresh OTP re-verification mints a step-up token valid this long.
    step_up_expire_minutes: int = 5

    # ---- Auth / OTP (STATE-AND-ROADMAP Phase 0: "close the 000000 hole") ----
    # The dev OTP bypass. Defaults ON so dev / tests / CI sign in with the dev
    # code out of the box. In the pilot/prod deploy set DEV_OTP_ENABLED=false to
    # CLOSE the bypass — with it off and no SMS provider wired, OTP login is
    # refused (no public, guessable auth). The code itself is configurable.
    dev_otp_enabled: bool = True
    dev_otp: str = "000000"
    # Private-pilot lock: when non-empty, ONLY these phone numbers may sign in
    # (matched across equivalent formats). Empty = no allowlist (dev). Pair it
    # with the dev OTP so known pilot users get in while the door stays shut to
    # everyone else — even before a real SMS provider is wired.
    auth_phone_allowlist: list[str] = []

    # ---- Abuse limits (app.common.ratelimit) ----
    # "memory" (default; production runs one replica and no Redis) or "redis"
    # (counters shared across replicas via REDIS_URL).
    rate_limit_backend: str = "memory"
    rate_limit_enabled: bool = True
    # One fixed window for every limit below.
    rate_limit_window_seconds: int = 15 * 60
    rate_limit_otp_per_phone: int = 5  # OTP sends (login + step-up) per phone/user
    rate_limit_otp_per_ip: int = 20
    rate_limit_login_failures: int = 5  # wrong codes per phone before lockout
    rate_limit_login_per_ip: int = 30
    rate_limit_join_per_ip: int = 20
    rate_limit_join_per_code: int = 10
    # Proxies in front of the app that append to X-Forwarded-For (Azure
    # Container Apps' ingress = 1). 0 ignores the header (direct exposure).
    trusted_proxy_hops: int = 0
    # A join code minted without a phone stops working this long after creation.
    join_code_ttl_days: int = 14

    # Browser origins allowed to call the API (CORS). The web dashboard dev
    # server runs on 5173 (Vite); 3000 covered for alternate setups.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "https://constructo-mobile.vercel.app",
        "https://constructo-topaz.vercel.app",
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

    # Labs/post-pilot routes. Set ENABLE_LABS=false in the pilot deploy to hide
    # the dispute-pack and vendor-confirm routes (real features, not no-ops —
    # just not exercised by the interior fit-out pilot). Defaults True so dev,
    # tests, and CI keep the routes registered.
    enable_labs: bool = True

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
    # Mirrors of the env vars app.bot.sender reads, declared here only so the
    # prod guard below can check the bridge key when the bot sends via bridge.
    bot_send_via: str | None = None
    bridge_key: str = ""

    # Design Profiler: Pinterest BOARD-link import (paste a board URL, not just a
    # single pin). Off by default — the parser depends on Pinterest's embedded
    # __PWS_DATA__ JSON blob, a private implementation detail more likely to
    # drift than the public og:image meta tag the single-pin path uses. Flip on
    # per-deploy once verified against live Pinterest markup.
    pinterest_board_import: bool = False

    @property
    def is_prod(self) -> bool:
        return self.app_env.lower() in ("prod", "production")

    @property
    def bot_sends_via_bridge(self) -> bool:
        """The same transport resolution as ``app.bot.sender._mode``."""
        if self.bot_send_via:
            return self.bot_send_via.strip().lower() == "bridge"
        return self.whatsapp_send_mode.strip().lower() == "url"

    @model_validator(mode="after")
    def _enforce_prod_security(self) -> "Settings":
        """Fail-CLOSED in a prod posture: refuse to boot with world-open auth or
        the public dev JWT secret. No-op for dev/test/CI (the default), so local
        runs and the suite keep working untouched."""
        if not self.is_prod:
            return self
        problems: list[str] = []
        if self.dev_otp_enabled and not self.auth_phone_allowlist:
            problems.append(
                "DEV_OTP_ENABLED is true with an empty AUTH_PHONE_ALLOWLIST — auth is "
                "world-open. Set DEV_OTP_ENABLED=false or a non-empty AUTH_PHONE_ALLOWLIST."
            )
        if self.jwt_secret == _DEV_JWT_SECRET or len(self.jwt_secret) < 32:
            problems.append(
                "JWT_SECRET is the public dev default or shorter than 32 chars — set a "
                "real secret."
            )
        if self.ingest_api_key == _DEV_INGEST_KEY or (
            len(self.ingest_api_key) < _MIN_SERVICE_KEY_LEN
        ):
            problems.append(
                "INGEST_API_KEY is the public dev default or shorter than "
                f"{_MIN_SERVICE_KEY_LEN} chars — set a real key."
            )
        if self.bot_sends_via_bridge and (
            self.bridge_key == _DEV_BRIDGE_KEY or len(self.bridge_key) < _MIN_SERVICE_KEY_LEN
        ):
            problems.append(
                "The bot sends via the WhatsApp bridge but BRIDGE_KEY is the dev default "
                f"or shorter than {_MIN_SERVICE_KEY_LEN} chars — set a real key."
            )
        if problems:
            raise ValueError(
                "Insecure production configuration (APP_ENV=prod):\n  - "
                + "\n  - ".join(problems)
            )
        return self


settings = Settings()
