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


settings = Settings()
