#!/usr/bin/env bash
set -euo pipefail

echo "[core-api] Running migrations..."
alembic upgrade head || echo "[core-api] Alembic not fully configured yet; continuing."

echo "[core-api] Starting uvicorn on :8080"
exec uvicorn app.main:app --host 0.0.0.0 --port 8080

