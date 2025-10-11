import os
from functools import lru_cache
from pydantic import BaseModel


class Settings(BaseModel):
    env: str = os.getenv("ENV", "dev")
    port: int = int(os.getenv("PORT", "8080"))
    log_level: str = os.getenv("LOG_LEVEL", "info")

    # Cognito/OIDC Configuration
    cognito_region: str = os.getenv("COGNITO_REGION", "us-east-1")
    cognito_user_pool_id: str | None = os.getenv("COGNITO_USER_POOL_ID")
    cognito_client_id: str | None = os.getenv("COGNITO_CLIENT_ID")
    cognito_client_secret: str | None = os.getenv("COGNITO_CLIENT_SECRET")
    cognito_domain: str | None = os.getenv("COGNITO_DOMAIN")

    # Derived OIDC URLs (computed from Cognito settings)
    @property
    def oidc_issuer(self) -> str | None:
        if self.cognito_user_pool_id:
            return f"https://cognito-idp.{self.cognito_region}.amazonaws.com/{self.cognito_user_pool_id}"
        return os.getenv("OIDC_ISSUER")

    @property
    def oidc_authorization_endpoint(self) -> str | None:
        if self.cognito_domain:
            return f"https://{self.cognito_domain}.auth.{self.cognito_region}.amazoncognito.com/oauth2/authorize"
        return None

    @property
    def oidc_token_endpoint(self) -> str | None:
        if self.cognito_domain:
            return f"https://{self.cognito_domain}.auth.{self.cognito_region}.amazoncognito.com/oauth2/token"
        return None

    @property
    def oidc_logout_endpoint(self) -> str | None:
        if self.cognito_domain:
            return f"https://{self.cognito_domain}.auth.{self.cognito_region}.amazoncognito.com/logout"
        return None

    @property
    def oidc_jwks_uri(self) -> str | None:
        if self.cognito_user_pool_id:
            return f"https://cognito-idp.{self.cognito_region}.amazonaws.com/{self.cognito_user_pool_id}/.well-known/jwks.json"
        return None

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

    # Feature Flags
    enable_cognito_auth: bool = (
        os.getenv("ENABLE_COGNITO_AUTH", "false").lower() == "true"
    )

    # Database and Services
    db_url: str | None = os.getenv("DB_URL")
    opensearch_url: str | None = os.getenv("OPENSEARCH_URL")
    sns_topic_arn_events: str | None = os.getenv("SNS_TOPIC_ARN_EVENTS")
    sqs_queue_url_events: str | None = os.getenv("SQS_QUEUE_URL_EVENTS")
    litellm_base_url: str | None = os.getenv("LITELLM_BASE_URL")

    otel_exporter_otlp_endpoint: str | None = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")


@lru_cache
def get_settings() -> Settings:
    return Settings()
