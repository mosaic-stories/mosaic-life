## ADDED Requirements

### Requirement: Production deploys apply schema migrations before new code serves traffic
A production or staging deploy SHALL run the Alembic migrations to `head` to completion before any task running the new image is registered with the load balancer. If the migration fails, the deploy SHALL stop and the previously deployed version SHALL keep serving traffic.

#### Scenario: Successful deploy with a new migration
- **WHEN** a commit that adds an Alembic revision is merged to `main`
- **THEN** the deploy pipeline runs the migration to completion, and only afterwards do tasks running the new image start receiving requests

#### Scenario: Failed migration halts the deploy
- **WHEN** the migration step exits non-zero during a deploy
- **THEN** no service is updated to the new image, the pipeline reports failure, and the site continues to serve the prior version

### Requirement: Failed deploys roll back automatically
If newly deployed tasks fail health checks, the runtime SHALL roll the service back to the last healthy version without manual intervention.

#### Scenario: New image fails health checks
- **WHEN** a deploy starts tasks whose `/healthz` check never passes
- **THEN** the service returns to the previous version and the deploy pipeline reports failure

### Requirement: Staging is a separate environment that scales to zero
Staging SHALL use separate compute, a separate database (`core_staging`), separate secrets and separate hostnames (`stage.mosaiclife.me`, `stage-api.mosaiclife.me`) from production. When idle, staging SHALL run zero compute tasks. It SHALL be startable on demand and SHALL stop automatically.

#### Scenario: Staging starts on deploy
- **WHEN** a commit is pushed to `develop`
- **THEN** staging is deployed with the new image and becomes reachable at `https://stage.mosaiclife.me` within a few minutes

#### Scenario: Staging starts on demand
- **WHEN** the operator runs the "staging up" workflow
- **THEN** staging becomes reachable within a few minutes using the most recently deployed staging image

#### Scenario: Staging stops automatically
- **WHEN** the configured auto-stop time after the last start passes, or the nightly backstop fires
- **THEN** staging runs zero tasks, and requests to the staging hostnames get an immediate HTTP 503 from the load balancer rather than hanging

#### Scenario: Staging never touches production data
- **WHEN** staging is running
- **THEN** it cannot read or write the production database, production media bucket or production secrets

### Requirement: Long-lived AI streams survive the edge
Server-sent-event responses (AI chat, story evolution) SHALL be able to stay open for at least 10 minutes through the public edge without being cut off by an idle timeout. In-flight streams SHALL be allowed to finish during a deploy, for up to 2 minutes, before the old task stops.

#### Scenario: Slow stream is not cut off
- **WHEN** an AI chat stream produces events intermittently for 10 minutes
- **THEN** the client receives every event and the normal stream terminator, with no connection reset from the load balancer

#### Scenario: Deploy during an active stream
- **WHEN** a deploy replaces the core-api task while a stream is in progress
- **THEN** the stream continues to completion as long as it finishes within 2 minutes of the replacement starting

### Requirement: Production database supports point-in-time recovery
The production database SHALL be restorable to any point within the last 7 days, and a final snapshot SHALL be kept whenever a database instance is retired.

#### Scenario: Restore after accidental data loss
- **WHEN** the operator needs data as it was at a timestamp within the last 7 days
- **THEN** a new database instance can be restored to that timestamp using AWS-managed backups, without any self-managed backup tooling

### Requirement: Operational signals and alerting
The runtime SHALL provide:
- application logs searchable in CloudWatch for at least 30 days (production) and 7 days (staging);
- alarms that send an email when production has no healthy core-api or web target, when load-balancer or target 5xx errors exceed a threshold, when database CPU or free storage crosses a threshold, or when application ERROR logs exceed a threshold;
- a budget alert when monthly spend exceeds the agreed threshold.

#### Scenario: core-api goes down
- **WHEN** production core-api has no healthy targets for 5 consecutive minutes
- **THEN** an alarm email is sent to the configured recipient

#### Scenario: Investigating an error
- **WHEN** an operator needs the logs for one request from the last 30 days, identified by its `trace_id` (present on every core-api log line)
- **THEN** a saved CloudWatch Logs Insights query over the core-api log group returns the structured JSON log lines carrying that `trace_id`

#### Scenario: Spend overrun
- **WHEN** actual or forecast monthly AWS spend exceeds the configured budget threshold
- **THEN** a budget notification email is sent

### Requirement: Application images remain deployable to EKS
The same container images and environment-variable contract used by the lean runtime SHALL remain deployable with the repository's Helm charts, so that returning to EKS needs no application code change.

#### Scenario: Helm charts still render
- **WHEN** CI runs on any pull request
- **THEN** `helm template` succeeds for the `mosaic-life` chart with the production and staging values files

#### Scenario: Same image on both runtimes
- **WHEN** an image tag deployed to ECS is set as the Helm chart's image tag
- **THEN** the chart's pods start using the same environment variables the ECS task definitions use, with no code change
