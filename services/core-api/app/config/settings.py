import os
from functools import lru_cache
from pydantic import BaseModel


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


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
    # Session expiry in seconds (default: 7 days = 604800 seconds)
    # Common values: 24h=86400, 7d=604800, 30d=2592000
    session_cookie_max_age: int = int(os.getenv("SESSION_COOKIE_MAX_AGE", "604800"))
    # Cookie domain for cross-subdomain auth (e.g., ".mosaiclife.me")
    # None means current domain only (for local dev)
    session_cookie_domain: str | None = os.getenv("SESSION_COOKIE_DOMAIN")

    # Database
    db_url: str | None = os.getenv("DB_URL")

    # AWS S3 Configuration (for media uploads)
    s3_media_bucket: str | None = os.getenv("S3_MEDIA_BUCKET")
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")

    # SES Configuration (for email)
    ses_from_email: str | None = os.getenv("SES_FROM_EMAIL")
    ses_region: str = os.getenv("SES_REGION", "us-east-1")
    support_email_to: str = os.getenv("SUPPORT_EMAIL_TO", "support@mosaiclife.me")

    # Bedrock Guardrails (optional - disabled if not set)
    bedrock_guardrail_id: str | None = os.getenv("BEDROCK_GUARDRAIL_ID")
    bedrock_guardrail_version: str | None = os.getenv("BEDROCK_GUARDRAIL_VERSION")

    # AI provider selection (Feature 3 abstraction)
    ai_llm_provider: str = os.getenv("AI_LLM_PROVIDER", "bedrock").lower()
    ai_embedding_provider: str = os.getenv("AI_EMBEDDING_PROVIDER", "bedrock").lower()

    # OpenAI provider configuration (optional)
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    openai_chat_model: str = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
    openai_embedding_model: str = os.getenv(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )

    # Storage Configuration
    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")
    local_media_path: str = os.getenv("LOCAL_MEDIA_PATH", "/app/media")

    # Upload limits
    max_upload_size_bytes: int = 10 * 1024 * 1024  # 10 MB
    upload_url_expiry_seconds: int = 300  # 5 minutes
    download_url_expiry_seconds: int = 900  # 15 minutes

    # Allowed content types
    allowed_content_types: list[str] = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
    ]

    # Observability
    otel_exporter_otlp_endpoint: str | None = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")

    # Debug SSE probe (disabled by default)
    debug_sse_enabled: bool = _as_bool(os.getenv("DEBUG_SSE_ENABLED"), False)
    debug_sse_token: str | None = os.getenv("DEBUG_SSE_TOKEN")
    debug_sse_interval_ms: int = int(os.getenv("DEBUG_SSE_INTERVAL_MS", "250"))
    debug_sse_max_seconds: int = int(os.getenv("DEBUG_SSE_MAX_SECONDS", "60"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
