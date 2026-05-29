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

    # WhatsApp send transport. One of: "dry_run" | "url" | "cloud_api".
    whatsapp_send_mode: str = "dry_run"
    whatsapp_send_url: str | None = None  # used by "url" mode
    whatsapp_token: str | None = None  # Bearer token for "cloud_api" mode
    whatsapp_phone_number_id: str | None = None  # Cloud API phone number id


settings = Settings()
