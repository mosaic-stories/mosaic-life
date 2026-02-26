# Graph RAG Configuration & Operations

This page covers environment variables, Neptune setup, persona tuning, and operational tasks for the graph-augmented RAG system. For architecture details, see [Graph-Augmented RAG Architecture](graph-augmented-rag.md).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAPH_AUGMENTATION_ENABLED` | `true` | Master toggle. Set to `false` to disable all graph features and fall back to embedding-only RAG. |
| `NEPTUNE_HOST` | *(none)* | Neptune cluster endpoint. When unset, the system uses a local TinkerPop Gremlin Server. |
| `NEPTUNE_PORT` | `8182` | Neptune/Gremlin Server port. |
| `NEPTUNE_REGION` | `us-east-1` | AWS region for Neptune IAM authentication. |
| `NEPTUNE_IAM_AUTH` | `false` | Enable IAM SigV4 request signing for Neptune. Required in production. |
| `NEPTUNE_ENV_PREFIX` | `local` | Environment prefix for label isolation (e.g., `prod`, `staging`). All graph labels are prefixed: `prod-Person`, `staging-FAMILY_OF`. |
| `INTENT_ANALYSIS_MODEL_ID` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Bedrock model for query intent classification. Use a lightweight model for speed. |
| `ENTITY_EXTRACTION_MODEL_ID` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Bedrock model for entity extraction during story ingestion. |

## Local Development Setup

### Starting Neptune (TinkerPop)

The local development stack uses TinkerPop Gremlin Server as a Neptune stand-in:

```bash
# Start the graph database
docker compose -f infra/compose/docker-compose.yml up -d neptune-local

# Verify it's running
curl http://localhost:18182
```

### Testing Connectivity

```bash
# Submit a basic Gremlin query
curl -X POST http://localhost:18182/gremlin \
  -H "Content-Type: application/json" \
  -d '{"gremlin": "g.V().count()"}'

# Expected response:
# {"requestId":"...","status":{"code":200},"result":{"data":[0]}}
```

### Local Environment Variables

No special configuration is needed for local development. When `NEPTUNE_HOST` is unset, the factory automatically creates a `LocalGraphAdapter` pointing to `localhost:18182` with `env_prefix=local`.

## Production Neptune Setup

### Cluster Requirements

- AWS Neptune with openCypher support
- IAM authentication enabled
- VPC peering or PrivateLink to EKS cluster
- The `neptune-connection` Kubernetes secret must contain: `host`, `port`, `region`, `iam_auth`, `env_prefix`

### IAM Authentication

In production, set `NEPTUNE_IAM_AUTH=true`. The `NeptuneGraphAdapter` signs requests using SigV4 with the pod's IAM role credentials (via IRSA). The service account needs the `neptune-db:*` permission on the cluster resource.

### Environment Prefix Isolation

The `NEPTUNE_ENV_PREFIX` setting prefixes all graph labels and relationship types. This allows multiple environments (prod, staging, dev) to share a single Neptune cluster:

- Production: `prod-Person`, `prod-FAMILY_OF`
- Staging: `staging-Person`, `staging-FAMILY_OF`
- Local: `local-Person`, `local-FAMILY_OF`

!!! warning "Prefix consistency"
    The prefix must be consistent across all services writing to the same graph. Changing the prefix after data has been written will make existing graph data invisible.

## Persona Tuning

Persona traversal behavior is configured in `services/core-api/app/config/personas.yaml` under the `traversal` key for each persona. Changes take effect on the next application restart.

### Traversal Settings

| Setting | Type | Description |
|---------|------|-------------|
| `max_hops` | int | Maximum graph traversal depth. Higher values discover more distant connections but increase latency. |
| `relationship_weights` | dict | Weight multipliers for each relationship type (0.0-1.0). Higher weight = stronger signal for that relationship. |
| `max_graph_results` | int | Maximum number of graph-discovered stories to return before access filtering. |
| `include_cross_legacy` | bool | Whether to traverse across different legacy subjects' story graphs. |
| `temporal_range` | string | Time range filter: `full` (all time), `recent` (last 10 years), `career` (working years). |

### Example: Making the Colleague Persona Broader

To make the Colleague persona discover more distant professional connections:

```yaml
colleague:
  traversal:
    max_hops: 2              # was 1 — now traverses 2 hops
    max_graph_results: 25     # was 15 — returns more results
    relationship_weights:
      FAMILY_OF: 0.2
      KNEW: 0.6
      WORKED_WITH: 1.0
      FRIENDS_WITH: 0.5
```

!!! note "Latency impact"
    Increasing `max_hops` from 1 to 2 roughly doubles graph traversal time. Monitor the `core_api_graph_context_latency_seconds` metric after changes.

### Example: Adding a New Relationship Type

To add support for a new relationship type (e.g., `MENTORED_BY`):

1. Add the weight to each persona's traversal config in `personas.yaml`
2. Ensure the entity extraction prompt in `app/services/entity_extraction.py` recognizes mentorship relationships
3. The graph traversal service will automatically include the new relationship type in queries

## Entity Backfill

When deploying graph augmentation for the first time, existing stories need entity extraction and graph population.

### Running Locally

```bash
cd services/core-api

# Preview what would be processed
uv run python scripts/backfill_entities.py --dry-run

# Process a small batch for testing
uv run python scripts/backfill_entities.py --limit 10

# Full backfill
uv run python scripts/backfill_entities.py
```

The script processes stories sequentially with a 0.5-second delay between each to avoid Bedrock throttling.

### Running in Production (Kubernetes Job)

Enable the backfill job in Helm values:

```yaml
# infra/helm/mosaic-life/values.yaml
entityBackfill:
  enabled: true
```

The job runs as a Helm post-install/post-upgrade hook. It uses the same container image as the core API service. Set `enabled: false` after the initial backfill completes.

## Circuit Breaker Behavior

The circuit breaker protects the system when Neptune is unavailable.

### States

| State | Behavior | Transition |
|-------|----------|------------|
| **Closed** | Normal operation — graph queries execute | Opens after 3 consecutive failures |
| **Open** | All graph queries skipped — embedding-only fallback | Transitions to half-open after 30 seconds |
| **Half-Open** | One trial request allowed | Success closes the circuit; failure reopens it |

### Monitoring

Use the Prometheus metric `core_api_graph_context_circuit_state` to monitor circuit breaker state:

- `0` = closed (healthy)
- `1` = open (Neptune unavailable, falling back)
- `2` = half-open (recovery attempt in progress)

Set up alerts for state `1` persisting beyond a few minutes — this indicates a Neptune connectivity issue that needs attention.

## Disabling Graph Augmentation

To disable all graph features and revert to embedding-only RAG:

```bash
GRAPH_AUGMENTATION_ENABLED=false
```

This is a clean toggle — the system behaves exactly as it did before graph augmentation was added. No other configuration changes are needed. Entity extraction during ingestion is also skipped.

## Troubleshooting

### Neptune Connectivity Failures

**Symptom:** Circuit breaker opens frequently, logs show `circuit_breaker.opened`.

**Check:**
```bash
# Local
curl http://localhost:18182

# Production — from a pod in the same VPC
curl https://<neptune-host>:8182/status
```

**Common causes:**
- Neptune cluster not running or unreachable
- Security group / VPC peering misconfigured
- IAM role missing `neptune-db:*` permissions

### High Graph Latency

**Symptom:** `core_api_graph_context_latency_seconds{phase="graph"}` consistently above 500ms.

**Check:**
- Reduce `max_hops` in persona traversal configs
- Reduce `max_graph_results`
- Check Neptune cluster instance size and CPU utilization

### Entity Extraction Returning Empty Results

**Symptom:** Stories are ingested but no entities appear in the graph.

**Check:**
- Verify `GRAPH_AUGMENTATION_ENABLED=true`
- Check Bedrock model access — the extraction model must be enabled in your AWS account
- Review logs for `entity_extraction.parse_failed` — the LLM response may not be valid JSON
- Try extracting manually: check the entity extraction service logs for the raw LLM response

### Circuit Breaker Stuck Open

**Symptom:** `core_api_graph_context_circuit_state{state="1"}` persists after Neptune is confirmed healthy.

**Resolution:** The circuit breaker automatically transitions to half-open after 30 seconds. If Neptune is healthy but the circuit remains open, the half-open trial request may be failing. Check Neptune logs for the specific query that fails. Restarting the core API pod resets the circuit breaker.

### Debug Mode

Add `?debug=true` to persona chat API calls to see the full context assembly metadata in the response, including:

- Intent classification and confidence
- Number of embedding vs. graph results
- Latency breakdown by phase
- Circuit breaker state
- Source types for each result
