#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

echo "[docs] Starting documentation build..."

cd "$DOCS_DIR"

# Step 1: Generate OpenAPI specification
echo "[docs] Step 1/4: Generating OpenAPI spec..."
bash "$SCRIPT_DIR/generate-openapi.sh"

# Step 2: Generate TypeScript documentation
echo "[docs] Step 2/4: Generating TypeDoc..."
bash "$SCRIPT_DIR/generate-typedoc.sh"

# Step 3: Install Python dependencies
echo "[docs] Step 3/4: Installing Python dependencies..."
uv sync

# Step 4: Build MkDocs site
echo "[docs] Step 4/4: Building MkDocs site..."
uv run mkdocs build --strict

echo "[docs] Documentation build complete!"
echo "[docs] Output: $DOCS_DIR/site/"
