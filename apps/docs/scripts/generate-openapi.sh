#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

# Support both local dev and Docker build paths
if [ -d "/build/services/core-api" ]; then
    CORE_API_DIR="/build/services/core-api"
else
    CORE_API_DIR="$DOCS_DIR/../../services/core-api"
fi

OUTPUT_DIR="$DOCS_DIR/docs/api"

echo "[docs] Generating OpenAPI specification..."

cd "$CORE_API_DIR"

# Generate OpenAPI JSON using FastAPI's built-in export
uv run python -c "
from app.main import app
import json

openapi_schema = app.openapi()
with open('$OUTPUT_DIR/openapi.json', 'w') as f:
    json.dump(openapi_schema, f, indent=2)

print('[docs] OpenAPI JSON written to $OUTPUT_DIR/openapi.json')
"

echo "[docs] OpenAPI generation complete"
