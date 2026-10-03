#!/usr/bin/env bash
# Set the staging services' desiredCount and optionally wait for stability.
# Usage: ecs-scale.sh <desired-count> [--wait]
# Env: DRY_RUN=1, ECS_CLUSTER (mosaic).
set -euo pipefail

COUNT="${1:?usage: ecs-scale.sh <desired-count> [--wait]}"
WAIT="${2:-}"
CLUSTER="${ECS_CLUSTER:-mosaic}"
DRY_RUN="${DRY_RUN:-0}"
SERVICES=(mosaic-staging-core-api mosaic-staging-web)

run() {
  if [[ "$DRY_RUN" == "1" ]]; then echo "[dry-run] $*"; else "$@"; fi
}

for svc in "${SERVICES[@]}"; do
  run aws ecs update-service --cluster "$CLUSTER" --service "$svc" \
    --desired-count "$COUNT" --query 'service.serviceName' --output text
done
if [[ "$WAIT" == "--wait" ]]; then
  run aws ecs wait services-stable --cluster "$CLUSTER" --services "${SERVICES[@]}"
fi
