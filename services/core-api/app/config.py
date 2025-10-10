import os
from pydantic import BaseModel


class Settings(BaseModel):
    env: str = os.getenv("ENV", "dev")
    port: int = int(os.getenv("PORT", "8080"))
    log_level: str = os.getenv("LOG_LEVEL", "info")

    oidc_issuer: str | None = os.getenv("OIDC_ISSUER")
    oidc_client_id: str | None = os.getenv("OIDC_CLIENT_ID")
    oidc_client_secret: str | None = os.getenv("OIDC_CLIENT_SECRET")

    db_url: str | None = os.getenv("DB_URL")
    opensearch_url: str | None = os.getenv("OPENSEARCH_URL")
    sns_topic_arn_events: str | None = os.getenv("SNS_TOPIC_ARN_EVENTS")
    sqs_queue_url_events: str | None = os.getenv("SQS_QUEUE_URL_EVENTS")
    litellm_base_url: str | None = os.getenv("LITELLM_BASE_URL")

    otel_exporter_otlp_endpoint: str | None = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")


def get_settings() -> Settings:
    return Settings()
