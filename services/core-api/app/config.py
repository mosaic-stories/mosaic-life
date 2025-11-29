import os
from functools import lru_cache
from pydantic import BaseModel


class Settings(BaseModel):
    env: str = os.getenv("ENV", "dev")
    port: int = int(os.getenv("PORT", "8080"))
    log_level: str = os.getenv("LOG_LEVEL", "info")

    # Google OAuth Configuration
    google_client_id: str | None = os.getenv("GOOGLE_CLIENT_ID")
    google_client_secret: str | None = os.getenv("GOOGLE_CLIENT_SECRET")

    # Google OAuth URLs (standard)
    google_auth_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_token_url: str = "https://oauth2.googleapis.com/token"
    google_userinfo_url: str = "https://www.googleapis.com/oauth2/v2/userinfo"

    # Application URLs
    app_url: str = os.getenv("APP_URL", "http://localhost:5173")
    api_url: str = os.getenv("API_URL", "http://localhost:8080")

    # Session Configuration
    session_secret_key: str = os.getenv(
        "SESSION_SECRET_KEY", "dev-secret-change-in-production"
    )
    session_cookie_name: str = "mosaic_session"
    session_cookie_secure: bool = os.getenv("ENV", "dev") != "dev"
    session_cookie_max_age: int = 3600  # 1 hour
    # Cookie domain for cross-subdomain auth (e.g., ".mosaiclife.me")
    # None means current domain only (for local dev)
    session_cookie_domain: str | None = os.getenv("SESSION_COOKIE_DOMAIN")

    # Database
    db_url: str | None = os.getenv("DB_URL")

    # AWS S3 Configuration (for media uploads)
    s3_media_bucket: str | None = os.getenv("S3_MEDIA_BUCKET")
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")

    # Observability
    otel_exporter_otlp_endpoint: str | None = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")


@lru_cache
def get_settings() -> Settings:
    return Settings()
