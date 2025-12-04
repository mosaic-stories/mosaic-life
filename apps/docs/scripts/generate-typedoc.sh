#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

echo "[docs] Generating TypeScript documentation..."

cd "$DOCS_DIR"

# Generate TypeDoc for web app
echo "[docs] Generating TypeDoc for apps/web..."
npm run generate:typedoc:web || echo "[docs] Warning: TypeDoc web generation had issues"

# Generate TypeDoc for shared packages
echo "[docs] Generating TypeDoc for packages/shared-types..."
npm run generate:typedoc:shared || echo "[docs] Warning: TypeDoc shared generation had issues"

echo "[docs] TypeDoc generation complete"
