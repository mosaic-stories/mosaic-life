# Core API (MVP Option B)

FastAPI app that combines BFF, Stories, and minimal Media for MVP. Includes adapters for Search (OpenSearch), AI (LiteLLM), and Events (SNS/SQS) to align with architecture while keeping one service.

## Endpoints (initial)
- GET `/healthz` — liveness
- GET `/readyz` — readiness
- GET `/metrics` — Prometheus metrics
- GET `/me` — current user (cookie/session stub for dev)

## Environment
- `PORT` (default 8080)
- `LOG_LEVEL` (default info)
- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET` (via External Secrets in k8s)
- `DB_URL` (e.g., postgresql+psycopg://...)
- `OPENSEARCH_URL`
- `SNS_TOPIC_ARN_EVENTS`
- `SQS_QUEUE_URL_EVENTS`
- `LITELLM_BASE_URL`
- `OTEL_EXPORTER_OTLP_ENDPOINT` (optional)

## Dev
```
uvicorn app.main:app --reload --port 8080
```

## Notes
- Auth endpoints and full OIDC PKCE flow will be added next; `/me` uses a simple stub in dev.
- SearchAdapter/AIAdapter/EventPublisher interfaces are defined but not fully implemented yet.
- Follow docs/adr/0001-mvp-option-b.md and docs/project/EXECUTION-PLAN-OPTION-B.md.

