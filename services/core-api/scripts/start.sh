#!/usr/bin/env bash
set -euo pipefail

# RUN_MIGRATIONS_ON_START (default: true)
#   true  - run `alembic upgrade head`; a failure aborts startup (non-zero exit)
#   false - skip migrations (e.g. when a separate job/task owns them)
RUN_MIGRATIONS_ON_START="${RUN_MIGRATIONS_ON_START:-true}"

if [ "${RUN_MIGRATIONS_ON_START}" = "true" ]; then
  echo "[core-api] Running migrations..."
  if ! alembic upgrade head; then
    echo '{"event":"startup.migrations_failed","component":"core-api","detail":"alembic upgrade head failed"}' >&2
    exit 1
  fi
else
  echo '{"event":"startup.migrations_skipped","component":"core-api","reason":"RUN_MIGRATIONS_ON_START='"${RUN_MIGRATIONS_ON_START}"'"}' >&2
fi

echo "[core-api] Starting uvicorn on :8080"
exec uvicorn app.main:app --host 0.0.0.0 --port 8080
