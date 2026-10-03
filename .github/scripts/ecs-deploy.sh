#!/usr/bin/env bash
# Release to ECS: register task defs, run migrations, roll services, record tag.
# Usage: ecs-deploy.sh [--dry-run] <prod|staging> <image-tag>
# Env: ECR_REGISTRY, ECS_CLUSTER (mosaic), MIGRATE_LOG_PREFIX (migrate/core-api).
# Describe calls always run; mutating calls are skipped on --dry-run.
set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=1; shift; fi
ENV="${1:-}"
TAG="${2:-}"
[[ "$ENV" == "prod" || "$ENV" == "staging" ]] || { echo "usage: $0 [--dry-run] <prod|staging> <image-tag>" >&2; exit 2; }
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "invalid image tag: '${TAG}'" >&2; exit 2; }
export DRY_RUN

CLUSTER="${ECS_CLUSTER:-mosaic}"
export ECS_CLUSTER="$CLUSTER"
REGISTRY="${ECR_REGISTRY:-033691785857.dkr.ecr.us-east-1.amazonaws.com}"
# awslogs-stream-prefix "migrate" + container "core-api" => migrate/core-api/<task-id>
LOG_PREFIX="${MIGRATE_LOG_PREFIX:-migrate/core-api}"
LOG_GROUP="/mosaic/${ENV}/migrate"
CORE_IMAGE="${REGISTRY}/mosaic-life/core-api:${TAG}"
WEB_IMAGE="${REGISTRY}/mosaic-life/web:${TAG}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
run() {
  if [[ "$DRY_RUN" == "1" ]]; then echo "[dry-run] $*" >&2; return 0; fi
  "$@"
}

# register_family <family> <container-name> <image>; prints the new ARN.
register_family() {
  local family="$1" container="$2" image="$3" file="$WORK/$1.json"
  aws ecs describe-task-definition --task-definition "$family" --include TAGS |
    jq --arg name "$container" --arg image "$image" '
      (.taskDefinition | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
        .compatibilities, .registeredAt, .registeredBy, .deregisteredAt))
      + (if (.tags // []) | length > 0 then {tags: .tags} else {} end)
      | if any(.containerDefinitions[]; .name == $name) then
          .containerDefinitions |= map(if .name == $name then .image = $image else . end)
        else error("container \($name) not found in task definition") end' >"$file" ||
    die "could not prepare task definition for ${family}"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] register ${family}: ${container} -> ${image}" >&2
    echo "arn:dry-run:${family}"
    return 0
  fi
  aws ecs register-task-definition --cli-input-json "file://$file" \
    --query 'taskDefinition.taskDefinitionArn' --output text
}

log "Registering task definitions for ${ENV} (${TAG})"
CORE_ARN=$(register_family "mosaic-${ENV}-core-api" core-api "$CORE_IMAGE")
WEB_ARN=$(register_family "mosaic-${ENV}-web" web "$WEB_IMAGE")
MIGRATE_ARN=$(register_family "mosaic-${ENV}-migrate" core-api "$CORE_IMAGE")
echo "core-api: $CORE_ARN"
echo "web:      $WEB_ARN"
echo "migrate:  $MIGRATE_ARN"

log "Running migrations"
NETCFG=$(aws ecs describe-services --cluster "$CLUSTER" --services "mosaic-${ENV}-core-api" |
  jq -ce '.services[0].networkConfiguration // empty') ||
  die "cannot describe service mosaic-${ENV}-core-api in cluster ${CLUSTER}"
[[ -n "$NETCFG" ]] || die "service mosaic-${ENV}-core-api not found or has no networkConfiguration (cluster ${CLUSTER})"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] run-task ${MIGRATE_ARN} network=${NETCFG}; wait; check core-api exitCode" >&2
else
  TASK_ARN=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE \
    --task-definition "$MIGRATE_ARN" --network-configuration "$NETCFG" \
    --query 'tasks[0].taskArn' --output text)
  [[ -n "$TASK_ARN" && "$TASK_ARN" != "None" ]] || die "run-task did not start a migration task"
  TASK_ID="${TASK_ARN##*/}"
  echo "migration task: $TASK_ID"
  aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN" ||
    echo "WARN: wait tasks-stopped returned non-zero; checking task state anyway" >&2
  DESC=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN")
  EXIT_CODE=$(jq -r '[.tasks[0].containers[]? | select(.name == "core-api") | .exitCode][0] // "missing"' <<<"$DESC")
  echo "--- migration logs (${LOG_GROUP} ${LOG_PREFIX}/${TASK_ID}) ---"
  aws logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "${LOG_PREFIX}/${TASK_ID}" \
    --start-from-head --query 'events[].message' --output text 2>&1 || echo "(could not read logs)"
  echo "--- end migration logs ---"
  if [[ "$EXIT_CODE" != "0" ]]; then
    jq -r '.tasks[0] | "stoppedReason: \(.stoppedReason)\n" + ([.containers[]? | "\(.name): exit=\(.exitCode) reason=\(.reason)"] | join("\n"))' <<<"$DESC" >&2
    die "migration failed (exitCode=${EXIT_CODE}); services not updated"
  fi
  echo "migration succeeded"
fi

log "Updating services"
EXTRA=()
if [[ "$ENV" == "staging" ]]; then
  # Bring staging up and schedule the auto-stop before waiting, so a slow or
  # failed rollout never leaves tasks running without a stop scheduled.
  EXTRA=(--desired-count 1)
  "$SCRIPT_DIR/staging-autostop.sh" upsert
fi
run aws ecs update-service --cluster "$CLUSTER" --service "mosaic-${ENV}-core-api" \
  --task-definition "$CORE_ARN" ${EXTRA[@]+"${EXTRA[@]}"} --query 'service.serviceName' --output text
run aws ecs update-service --cluster "$CLUSTER" --service "mosaic-${ENV}-web" \
  --task-definition "$WEB_ARN" ${EXTRA[@]+"${EXTRA[@]}"} --query 'service.serviceName' --output text

log "Waiting for services to stabilise"
if ! run aws ecs wait services-stable --cluster "$CLUSTER" \
  --services "mosaic-${ENV}-core-api" "mosaic-${ENV}-web"; then
  echo "Services did not stabilise; recent events (circuit breaker handles rollback):" >&2
  aws ecs describe-services --cluster "$CLUSTER" \
    --services "mosaic-${ENV}-core-api" "mosaic-${ENV}-web" |
    jq -r '.services[] | .serviceName as $n | .events[:10][] | "\($n): \(.createdAt) \(.message)"' >&2 || true
  exit 1
fi

log "Recording image tag"
run aws ssm put-parameter --overwrite --name "/mosaiclife/${ENV}/image-tag" --type String --value "$TAG"

log "Deploy of ${TAG} to ${ENV} complete"
