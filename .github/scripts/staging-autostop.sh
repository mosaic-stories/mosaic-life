#!/usr/bin/env bash
# Manage the one-time staging auto-stop schedules (EventBridge Scheduler).
# Usage: staging-autostop.sh upsert|delete
# Two schedules (one per service) because a universal target makes one API call.
# Env: DRY_RUN=1 (print mutating calls only), AUTOSTOP_HOURS (default 2),
#      ECS_CLUSTER (mosaic), SCHEDULE_GROUP (mosaic-staging), SCHEDULER_ROLE_ARN.
set -euo pipefail

ACTION="${1:-}"
CLUSTER="${ECS_CLUSTER:-mosaic}"
GROUP="${SCHEDULE_GROUP:-mosaic-staging}"
ROLE_ARN="${SCHEDULER_ROLE_ARN:-arn:aws:iam::033691785857:role/mosaic-staging-ecs-scheduler}"
HOURS="${AUTOSTOP_HOURS:-2}"
DRY_RUN="${DRY_RUN:-0}"
SERVICES=(core-api web)

[[ "$ACTION" == "upsert" || "$ACTION" == "delete" ]] || {
  echo "usage: $0 upsert|delete" >&2
  exit 2
}

run() {
  if [[ "$DRY_RUN" == "1" ]]; then echo "[dry-run] $*"; else "$@"; fi
}

# UTC "now + N hours", GNU date first (GitHub runners), BSD date fallback.
at_time() {
  date -u -d "+${HOURS} hours" +%Y-%m-%dT%H:%M:%S 2>/dev/null ||
    date -u -v+"${HOURS}"H +%Y-%m-%dT%H:%M:%S
}

schedule_exists() {
  local name="$1" err
  if err=$(aws scheduler get-schedule --group-name "$GROUP" --name "$name" 2>&1 >/dev/null); then
    return 0
  fi
  [[ "$err" == *ResourceNotFoundException* ]] && return 1
  echo "get-schedule $name failed: $err" >&2
  exit 1
}

for svc in "${SERVICES[@]}"; do
  name="staging-autostop-${svc}"
  if [[ "$ACTION" == "delete" ]]; then
    if [[ "$DRY_RUN" == "1" ]] || schedule_exists "$name"; then
      run aws scheduler delete-schedule --group-name "$GROUP" --name "$name"
    else
      echo "schedule $name not present; nothing to delete"
    fi
    continue
  fi

  input=$(jq -cn --arg c "$CLUSTER" --arg s "mosaic-staging-${svc}" \
    '{Cluster: $c, Service: $s, DesiredCount: 0}')
  target=$(jq -cn --arg role "$ROLE_ARN" --arg input "$input" \
    '{Arn: "arn:aws:scheduler:::aws-sdk:ecs:updateService", RoleArn: $role, Input: $input}')
  expr="at($(at_time))"

  if [[ "$DRY_RUN" != "1" ]] && schedule_exists "$name"; then
    verb=update-schedule
  else
    verb=create-schedule
  fi
  echo "${verb} ${name}: ${expr}"
  run aws scheduler "$verb" \
    --group-name "$GROUP" --name "$name" \
    --schedule-expression "$expr" \
    --flexible-time-window Mode=OFF \
    --action-after-completion DELETE \
    --target "$target"
done
