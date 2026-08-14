import os
from functools import lru_cache
from pydantic import BaseModel, model_validator

# Known-insecure fallback shipped in source; anyone can read it in this public
# repo, so it must never be the active key outside of local dev.
INSECURE_SESSION_SECRET_KEY = "dev-secret-change-in-production"


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


class Settings(BaseModel):
    env: str = os.getenv("ENV", "dev")
    port: int = int(os.getenv("PORT", "8080"))
    log_level: str = os.getenv("LOG_LEVEL", "info")

    # Auth provider: "google" (production) or "keycloak" (local/offline)
    auth_provider: str = os.getenv("AUTH_PROVIDER", "google")

    # Google OAuth Configuration
    google_client_id: str | None = os.getenv("GOOGLE_CLIENT_ID")
    google_client_secret: str | None = os.getenv("GOOGLE_CLIENT_SECRET")

    # Google OAuth URLs (standard)
    google_auth_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_token_url: str = "https://oauth2.googleapis.com/token"
    google_userinfo_url: str = "https://www.googleapis.com/oauth2/v2/userinfo"

    # Keycloak OIDC Configuration
    keycloak_client_id: str | None = os.getenv("KEYCLOAK_CLIENT_ID")
    keycloak_client_secret: str | None = os.getenv("KEYCLOAK_CLIENT_SECRET")
    keycloak_discovery_url: str | None = os.getenv("KEYCLOAK_DISCOVERY_URL")
    # Internal base URL for server-to-server calls (avoids external DNS from inside Docker).
    # When set, token/userinfo calls go to e.g. http://keycloak:8080 instead of the
    # public hostname. X-Forwarded-Host/Proto headers make Keycloak generate correct
    # public URLs in its responses.
    keycloak_internal_base_url: str | None = os.getenv("KEYCLOAK_INTERNAL_BASE_URL")

    # Application URLs
    app_url: str = os.getenv("APP_URL", "http://localhost:5173")
    api_url: str = os.getenv("API_URL", "http://localhost:8080")

    # Session Configuration
    session_secret_key: str = os.getenv(
        "SESSION_SECRET_KEY", INSECURE_SESSION_SECRET_KEY
    )
    session_cookie_name: str = os.getenv("SESSION_COOKIE_NAME", "mosaic_session")
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
    # S3-compatible endpoint overrides — used for local dev with rustfs/MinIO.
    # s3_endpoint_url: public URL embedded in presigned URLs (browser-accessible).
    # s3_internal_endpoint_url: container-to-container URL for boto3 API calls
    #   (head_object, delete_object).  Falls back to s3_endpoint_url when absent.
    # Neither should be set in production; boto3 will use the standard AWS endpoint.
    s3_endpoint_url: str | None = os.getenv("S3_ENDPOINT_URL")
    s3_internal_endpoint_url: str | None = os.getenv("S3_INTERNAL_ENDPOINT_URL")
    # Explicit S3 credentials — set for local S3-compatible storage so they don't
    # shadow the ~/.aws credentials used by Bedrock and other AWS services.
    s3_access_key_id: str | None = os.getenv("S3_ACCESS_KEY_ID")
    s3_secret_access_key: str | None = os.getenv("S3_SECRET_ACCESS_KEY")

    # SES Configuration (for email)
    ses_from_email: str | None = os.getenv("SES_FROM_EMAIL")
    ses_region: str = os.getenv("SES_REGION", "us-east-1")
    support_email_to: str = os.getenv("SUPPORT_EMAIL_TO", "support@mosaiclife.me")

    # Bedrock Guardrails (optional - disabled if not set)
    bedrock_guardrail_id: str | None = os.getenv("BEDROCK_GUARDRAIL_ID")
    bedrock_guardrail_version: str | None = os.getenv("BEDROCK_GUARDRAIL_VERSION")

    # AI provider selection (Feature 3 abstraction)
    ai_llm_provider: str = os.getenv("AI_LLM_PROVIDER", "litellm").lower()
    ai_embedding_provider: str = os.getenv("AI_EMBEDDING_PROVIDER", "litellm").lower()

    # OpenAI provider configuration (optional)
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    openai_chat_model: str = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
    openai_embedding_model: str = os.getenv(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )

    # LiteLLM provider configuration
    litellm_base_url: str = os.getenv("LITELLM_BASE_URL", "http://localhost:14000")
    litellm_api_key: str | None = os.getenv("LITELLM_API_KEY")
    litellm_embedding_model: str = os.getenv(
        "LITELLM_EMBEDDING_MODEL", "titan-embed-text-v2"
    )

    # Default chat model — fallback when no persona-specific model_id is available.
    # Set DEFAULT_CHAT_MODEL_ID in .env to switch providers without touching source code.
    default_chat_model_id: str = os.getenv("DEFAULT_CHAT_MODEL_ID", "claude-sonnet-4-6")

    # Context extraction model (falls back to default_chat_model_id when unset)
    context_extraction_model_id: str | None = os.getenv("CONTEXT_EXTRACTION_MODEL_ID")

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
    otel_debug: bool = _as_bool(os.getenv("OTEL_DEBUG"), False)

    # Debug SSE probe (disabled by default)
    debug_sse_enabled: bool = _as_bool(os.getenv("DEBUG_SSE_ENABLED"), False)
    debug_sse_token: str | None = os.getenv("DEBUG_SSE_TOKEN")
    debug_sse_interval_ms: int = int(os.getenv("DEBUG_SSE_INTERVAL_MS", "250"))
    debug_sse_max_seconds: int = int(os.getenv("DEBUG_SSE_MAX_SECONDS", "60"))

    # Story evolution
    evolution_summarization_model_id: str = os.getenv(
        "EVOLUTION_SUMMARIZATION_MODEL_ID",
        "claude-sonnet-4-6",
    )

    # Story versioning
    story_version_soft_cap: int = int(os.getenv("STORY_VERSION_SOFT_CAP", "50"))
    change_summary_model_id: str = os.getenv(
        "CHANGE_SUMMARY_MODEL_ID",
        "claude-haiku-4-5",
    )
    # How long without a save before an editing session is considered closed.
    story_edit_session_idle_seconds: int = int(
        os.getenv("STORY_EDIT_SESSION_IDLE_SECONDS", "900")
    )
    # Maximum duration of one continuously-active editing session before a
    # version is forced.
    story_edit_session_max_seconds: int = int(
        os.getenv("STORY_EDIT_SESSION_MAX_SECONDS", "1800")
    )
    # Timeout for the background change-summary LLM call.
    change_summary_timeout_seconds: int = int(
        os.getenv("CHANGE_SUMMARY_TIMEOUT_SECONDS", "10")
    )

    # Internal API token for CronJob endpoints (cleanup, etc.)
    internal_api_token: str | None = os.getenv("INTERNAL_API_TOKEN")

    # Neptune / Graph Database
    neptune_host: str | None = os.getenv("NEPTUNE_HOST")
    neptune_port: int = int(os.getenv("NEPTUNE_PORT", "8182"))
    neptune_region: str = os.getenv("NEPTUNE_REGION", "us-east-1")
    neptune_iam_auth: bool = _as_bool(os.getenv("NEPTUNE_IAM_AUTH"), False)
    neptune_env_prefix: str = os.getenv("NEPTUNE_ENV_PREFIX", "local")
    graph_augmentation_enabled: bool = _as_bool(
        os.getenv("GRAPH_AUGMENTATION_ENABLED"), True
    )

    # Local graph database (TinkerPop Gremlin Server) — used when NEPTUNE_HOST
    # is not set.  Inside Docker Compose the service name is "neptune-local"
    # on port 8182; on the host machine use "localhost:18182".
    local_graph_host: str = os.getenv("LOCAL_GRAPH_HOST", "localhost")
    local_graph_port: int = int(os.getenv("LOCAL_GRAPH_PORT", "18182"))

    # Intent analysis model (lightweight, fast)
    intent_analysis_model_id: str = os.getenv(
        "INTENT_ANALYSIS_MODEL_ID",
        "claude-haiku-4-5",
    )

    # Entity extraction model
    entity_extraction_model_id: str = os.getenv(
        "ENTITY_EXTRACTION_MODEL_ID",
        "claude-haiku-4-5",
    )

    @model_validator(mode="after")
    def _require_real_secrets_outside_dev(self) -> "Settings":
        """Fail fast instead of silently booting with an insecure default.

        SESSION_SECRET_KEY signs both session cookies and the OAuth state
        token; INTERNAL_API_TOKEN gates the internal cleanup endpoints. A
        missing or misspelled env var in a non-dev deploy must not fall back
        to a publicly-known secret or an open endpoint. See issue #95.
        """
        if self.env == "dev":
            return self
        if (
            not self.session_secret_key
            or self.session_secret_key == INSECURE_SESSION_SECRET_KEY
        ):
            raise RuntimeError(
                "SESSION_SECRET_KEY must be set to a strong random value "
                "in non-dev environments"
            )
        if not self.internal_api_token:
            raise RuntimeError(
                "INTERNAL_API_TOKEN must be set to a strong random value "
                "in non-dev environments"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
