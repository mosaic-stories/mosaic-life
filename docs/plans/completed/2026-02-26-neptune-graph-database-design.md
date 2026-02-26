# Neptune Graph Database Design

**Date:** 2026-02-26
**Status:** Approved
**Approach:** AWS Neptune with `@aws-cdk/aws-neptune-alpha` CDK constructs

## Overview

Add AWS Neptune as a dedicated graph database for modeling social networks around legacies and connections between information extracted from stories. Neptune replaces the previously planned Apache AGE approach entirely.

**Key decisions:**
- **Query language:** openCypher
- **Instance type:** db.t4g.medium (~$70/mo)
- **Data sync:** Application-level dual write (PostgreSQL + Neptune)
- **Authentication:** IAM auth (SigV4 signing, no username/password)
- **Local dev:** Apache TinkerPop Gremlin Server in Docker Compose
- **Multi-environment:** Single shared cluster with prefix-label isolation (prod + staging)

## Multi-Environment Isolation

### Why a Shared Cluster

Neptune does not support multiple databases within a single cluster (unlike PostgreSQL's `CREATE DATABASE`). All data lives in one shared graph on one storage volume. To avoid doubling cost (~$140/mo for two clusters), we use a single Neptune cluster shared by production and staging, with application-level isolation.

### Prefix-Label Strategy (AWS Recommended)

AWS prescriptive guidance recommends the **prefix-label strategy** for logical isolation in labeled property graphs. Every node label and relationship type is prefixed with the environment name:

```cypher
-- Production data
CREATE (n:`prod-Person` {id: '...', name: 'John'})
CREATE (s:`prod-Story` {id: '...', title: 'A Life Well Lived'})
CREATE (n)-[:`prod-AUTHORED`]->(s)

-- Staging data
CREATE (n:`staging-Person` {id: '...', name: 'Test User'})
CREATE (s:`staging-Story` {id: '...', title: 'Test Story'})
CREATE (n)-[:`staging-AUTHORED`]->(s)
```

Queries naturally scope to one environment via label-based index lookups:

```cypher
-- Only returns production persons (single index hit, no scanning)
MATCH (n:`prod-Person`) RETURN n

-- Only returns staging stories
MATCH (s:`staging-Story`) RETURN s
```

### Why Prefix-Label Over Alternatives

| Strategy | Performance | Isolation | Complexity |
|----------|-------------|-----------|------------|
| **Prefix-label** (chosen) | Best — single index lookup per label | Application-enforced | Moderate — adapter handles prefixing |
| Property-based (`env` property) | Worst — scans all nodes then filters (noisy neighbor) | Application-enforced | Low |
| Named graphs | N/A — openCypher does not support named graphs | N/A | N/A |
| Separate clusters | Best — complete physical isolation | Database-level | Low — but ~$140/mo |

### Isolation Guarantees and Risks

- **Enforcement is application-layer only.** Neptune IAM policies operate at the cluster level (connect/disconnect), not at the node/edge level. All isolation is enforced by the `GraphAdapter`.
- **A bug in the adapter could leak or corrupt data across environments.** This is accepted for cost savings.
- **The `GraphAdapter` is the single enforcement point.** The `NeptuneGraphAdapter` receives the environment prefix at initialization and applies it to all labels and relationship types transparently. Callers never construct prefixed labels directly.
- **The raw `query()` method is the escape hatch.** Direct openCypher queries bypass prefix enforcement. Use only for admin/migration tasks.

### Migration Path to Separate Clusters

When budget allows, migrate to separate clusters by:
1. Deploy a second Neptune cluster for staging
2. Change the staging Secrets Manager entry to point to the new cluster
3. Run a one-time migration to copy `staging-*` prefixed data to the new cluster as unprefixed data
4. Update the staging `GraphAdapter` to use an empty prefix
5. Delete `staging-*` data from the production cluster

No application code changes required beyond updating the `NEPTUNE_ENV_PREFIX` environment variable.

## CDK Infrastructure

### New Stack: `NeptuneDatabaseStack`

**File:** `infra/cdk/lib/neptune-database-stack.ts`

A **single shared cluster** serves both production and staging environments. Data isolation is handled at the application layer via the prefix-label strategy. The CDK stack creates one cluster and provisions Secrets Manager entries and IRSA roles for each environment that needs access.

```
NeptuneDatabaseStack
├── SecurityGroup (port 8182 inbound from VPC CIDR)
├── SubnetGroup (private subnets with egress)
├── ClusterParameterGroup
│   └── neptune_enable_audit_log: 1
│   └── neptune_enforce_ssl: 1
├── ParameterGroup
│   └── neptune_query_timeout: 120000
├── DatabaseCluster (SINGLE shared instance)
│   ├── Engine: neptune (latest stable)
│   ├── Instance: db.t4g.medium x 1
│   ├── openCypher enabled
│   ├── Encrypted at rest (KMS)
│   ├── Deletion protection (enabled)
│   └── CloudWatch log exports (audit)
├── Secrets (Secrets Manager) — one per environment
│   ├── mosaic/prod/neptune/connection
│   │   └── Fields: host, port (8182), engine, iam_auth, region, env_prefix (prod)
│   └── mosaic/staging/neptune/connection
│       └── Fields: host, port (8182), engine, iam_auth, region, env_prefix (staging)
├── IRSA Roles — one per environment
│   ├── prod: mosaic-prod:core-api-secrets-sa → secret read + neptune-db:connect
│   └── staging: mosaic-staging:core-api-secrets-sa → secret read + neptune-db:connect
└── CfnOutputs (endpoint, port, security group ID)
```

**Note:** Both environment secrets contain the **same host/port** (same cluster endpoint). The `env_prefix` field in each secret tells the application which label prefix to use.

### Stack Registration

In `infra/cdk/bin/mosaic-life.ts`:

```typescript
// Single shared Neptune cluster for all environments
new NeptuneDatabaseStack(app, 'MosaicNeptuneDatabaseStack', {
  env: { account, region },
  vpc: mainStack.vpc,
  environments: ['prod', 'staging'],  // IRSA + secrets for each
});
```

## Graph Data Model

### Node Types (Logical)

The table below shows **logical** node types. In the actual graph, all labels are prefixed with the environment (e.g., `prod-Person`, `staging-Story`). The `GraphAdapter` handles this transparently — callers always use unprefixed labels.

| Logical Label | Stored As (prod) | Properties | Source |
|---------------|-------------------|-----------|--------|
| `:Person` | `` :`prod-Person` `` | `id` (UUID), `name`, `legacy_id`, `user_id` | Synced from `persons` table |
| `:Legacy` | `` :`prod-Legacy` `` | `id` (UUID), `name`, `created_at` | Synced from `legacies` table |
| `:Story` | `` :`prod-Story` `` | `id` (UUID), `title`, `story_type`, `tags[]`, `created_at` | Synced from `stories` table |
| `:Place` | `` :`prod-Place` `` | `id` (UUID), `name`, `location`, `type` | Extracted from stories (AI/NLP) |
| `:Object` | `` :`prod-Object` `` | `id` (UUID), `name`, `description`, `type` | Extracted from stories (AI/NLP) |
| `:Event` | `` :`prod-Event` `` | `id` (UUID), `name`, `date`, `type` | Extracted from stories (AI/NLP) |

### Social Network Relationships

Logical relationship types (the adapter prefixes these as `prod-FAMILY_OF`, etc.):

```cypher
(:Person)-[:FAMILY_OF {relationship: "spouse|child|sibling|parent|..."}]->(:Person)
(:Person)-[:KNEW {since, context}]->(:Person)
(:Person)-[:WORKED_WITH {company, period}]->(:Person)
(:Person)-[:FRIENDS_WITH {since, context}]->(:Person)
```

As stored in the graph (production example):

```cypher
(:`prod-Person`)-[:`prod-FAMILY_OF` {relationship: "spouse"}]->(:`prod-Person`)
(:`prod-Person`)-[:`prod-KNEW` {since: "1985", context: "college"}]->(:`prod-Person`)
```

### Content Connection Relationships

Logical types:

```cypher
(:Person)-[:AUTHORED]->(:Story)
(:Story)-[:ABOUT]->(:Legacy)
(:Story)-[:MENTIONS]->(:Person)
(:Story)-[:MENTIONS_PLACE]->(:Place)
(:Story)-[:MENTIONS_OBJECT]->(:Object)
(:Story)-[:MENTIONS_EVENT]->(:Event)
(:Story)-[:RELATED_TO {similarity_score}]->(:Story)
(:Legacy)-[:LINKED_TO {link_type, status}]->(:Legacy)
```

### Design Notes

- `:Place`, `:Object`, `:Event` are graph-native entities (not in PostgreSQL)
- Person/Legacy/Story IDs match PostgreSQL UUIDs for dual-write consistency
- Relationships are directional but queried bidirectionally
- Social relationships enable "six degrees" style discovery between legacies
- **All labels and relationship types are prefixed with the environment** (e.g., `prod-Person`, `staging-AUTHORED`). The `GraphAdapter` handles prefixing transparently — application code uses unprefixed labels.
- **Node IDs are globally unique (UUIDs)**, so there is no risk of ID collision between environments even though they share the same graph storage

## Application Integration

### GraphAdapter Pattern

New adapter in `services/core-api/app/adapters/graph_adapter.py`:

```python
class GraphAdapter(ABC):
    """Abstract graph database adapter.

    All label and relationship type parameters use UNPREFIXED logical names
    (e.g., "Person", "AUTHORED"). Implementations handle environment prefix
    injection transparently based on their configured env_prefix.
    """

    @abstractmethod
    async def upsert_node(self, label: str, id: str, properties: dict) -> None: ...

    @abstractmethod
    async def delete_node(self, label: str, id: str) -> None: ...

    @abstractmethod
    async def create_relationship(
        self, from_label: str, from_id: str,
        rel_type: str, to_label: str, to_id: str,
        properties: dict | None = None,
    ) -> None: ...

    @abstractmethod
    async def delete_relationship(
        self, from_label: str, from_id: str,
        rel_type: str, to_label: str, to_id: str,
    ) -> None: ...

    @abstractmethod
    async def get_connections(
        self, label: str, id: str,
        rel_types: list[str] | None = None,
        depth: int = 1,
    ) -> list[dict]: ...

    @abstractmethod
    async def find_path(
        self, from_id: str, to_id: str,
        max_depth: int = 6,
    ) -> list[dict]: ...

    @abstractmethod
    async def get_related_stories(
        self, story_id: str, limit: int = 10,
    ) -> list[dict]: ...

    @abstractmethod
    async def query(self, cypher: str, params: dict | None = None) -> list[dict]: ...
```

### Prefix-Label Handling in Implementations

Each adapter implementation receives `env_prefix` at initialization and applies it to all labels and relationship types before constructing queries:

```python
class NeptuneGraphAdapter(GraphAdapter):
    def __init__(self, host: str, port: int, region: str, env_prefix: str):
        self._env_prefix = env_prefix  # e.g., "prod" or "staging"
        # ...

    def _label(self, logical_label: str) -> str:
        """Prefix a logical label: 'Person' -> 'prod-Person'"""
        return f"{self._env_prefix}-{logical_label}"

    def _rel_type(self, logical_type: str) -> str:
        """Prefix a relationship type: 'AUTHORED' -> 'prod-AUTHORED'"""
        return f"{self._env_prefix}-{logical_type}"

    async def upsert_node(self, label: str, id: str, properties: dict) -> None:
        prefixed = self._label(label)  # "Person" -> "prod-Person"
        cypher = f"MERGE (n:`{prefixed}` {{id: $id}}) SET n += $props"
        await self._execute(cypher, {"id": id, "props": properties})
```

**Callers never see or construct prefixed labels.** For example:

```python
# Application code — always uses logical (unprefixed) labels
await graph.upsert_node("Person", person_id, {"name": "John"})
await graph.create_relationship("Person", person_id, "AUTHORED", "Story", story_id)

# The adapter internally translates to:
# MERGE (n:`prod-Person` {id: $id}) SET n += $props
# MATCH (a:`prod-Person` {id: $from_id}), (b:`prod-Story` {id: $to_id})
# MERGE (a)-[:`prod-AUTHORED`]->(b)
```

### Implementations

- `NeptuneGraphAdapter` — production, connects via HTTPS with IAM SigV4 signing, prefixes with `NEPTUNE_ENV_PREFIX`
- `LocalGraphAdapter` — local dev, connects to TinkerPop server on port 8182, prefixes with `NEPTUNE_ENV_PREFIX` (defaults to `local`)

### Dual-Write Integration Points

All graph operations go through the `GraphAdapter`, which automatically applies the environment prefix. Callers use unprefixed logical labels.

| Event | Graph Operation (logical) | Stored As (prod example) |
|-------|--------------------------|--------------------------|
| Legacy created/updated | Upsert `:Legacy` node | `` :`prod-Legacy` `` |
| Story created/updated | Upsert `:Story` + `:ABOUT` rel | `` :`prod-Story` `` + `` :`prod-ABOUT` `` |
| Person created | Upsert `:Person` node | `` :`prod-Person` `` |
| LegacyMember added | Create relationship edges | `` :`prod-FAMILY_OF` `` etc. |
| LegacyLink created | Create `:LINKED_TO` edge | `` :`prod-LINKED_TO` `` |
| Story entity extraction | Create entity nodes + edges | `` :`prod-Place` `` + `` :`prod-MENTIONS_PLACE` `` etc. |

### Error Handling

Neptune writes are best-effort in MVP:
- If Neptune write fails, PostgreSQL write still succeeds
- Errors are logged with structured logging (request_id, operation, error)
- Graph is eventually reconstructable from PostgreSQL data

### Python Dependencies

- `amazon-neptune-python-utils` or `gremlinpython` with SigV4 auth
- `httpx` for openCypher HTTP endpoint queries
- `boto3` for SigV4 signing

## Local Development

### Docker Compose Addition

```yaml
neptune-local:
  image: tinkerpop/gremlin-server:3.7.3
  container_name: mosaic-neptune-local
  ports:
    - "18182:8182"
  volumes:
    - ./neptune-local/gremlin-server.yaml:/opt/gremlin-server/conf/gremlin-server.yaml
    - neptune-data:/opt/gremlin-server/data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8182/gremlin"]
    interval: 10s
    timeout: 5s
    retries: 5
```

- Port `18182` externally (consistent with `15432` PostgreSQL pattern)
- Config file at `infra/compose/neptune-local/gremlin-server.yaml`
- Data persisted via named volume

### Limitations vs Real Neptune

- No IAM auth locally (direct connection)
- openCypher support varies in TinkerPop
- Sufficient for development and basic testing

## Secrets & Kubernetes Integration

### Secrets Manager Structure

Both environments share the same cluster endpoint. Each environment gets its own secret with an `env_prefix` field that determines which label prefix the `GraphAdapter` uses.

**Production** — `mosaic/prod/neptune/connection`:

```json
{
  "host": "mosaic-neptune-cluster.cluster-xxxxx.us-east-1.neptune.amazonaws.com",
  "port": "8182",
  "engine": "neptune",
  "iam_auth": "true",
  "region": "us-east-1",
  "env_prefix": "prod"
}
```

**Staging** — `mosaic/staging/neptune/connection`:

```json
{
  "host": "mosaic-neptune-cluster.cluster-xxxxx.us-east-1.neptune.amazonaws.com",
  "port": "8182",
  "engine": "neptune",
  "iam_auth": "true",
  "region": "us-east-1",
  "env_prefix": "staging"
}
```

**Note:** The `host` is identical in both secrets — both point to the same shared cluster. The `env_prefix` is the only differentiator.

### External Secrets

Add to Helm chart's `external-secrets.yaml` (the secret key path is templated per environment):

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: neptune-connection
spec:
  secretStoreRef:
    name: aws-secrets-manager
  target:
    name: neptune-connection
  data:
    - secretKey: NEPTUNE_HOST
      remoteRef:
        key: mosaic/{environment}/neptune/connection
        property: host
    - secretKey: NEPTUNE_PORT
      remoteRef:
        key: mosaic/{environment}/neptune/connection
        property: port
    - secretKey: NEPTUNE_REGION
      remoteRef:
        key: mosaic/{environment}/neptune/connection
        property: region
    - secretKey: NEPTUNE_ENV_PREFIX
      remoteRef:
        key: mosaic/{environment}/neptune/connection
        property: env_prefix
```

### Core API Environment Variables

| Variable | Description | Local | Production | Staging |
|----------|-------------|-------|------------|---------|
| `NEPTUNE_HOST` | Cluster endpoint | `localhost` | From Secrets Manager | From Secrets Manager (same host) |
| `NEPTUNE_PORT` | Connection port | `18182` | `8182` | `8182` |
| `NEPTUNE_IAM_AUTH` | Enable IAM auth | `false` | `true` | `true` |
| `NEPTUNE_REGION` | AWS region for SigV4 | — | `us-east-1` | `us-east-1` |
| `NEPTUNE_ENV_PREFIX` | Label prefix for isolation | `local` | `prod` | `staging` |

### IRSA

The CDK stack creates IRSA roles for **both** environments, each scoped to its own namespace:

**Production** (`mosaic-prod` namespace):
- `secretsmanager:GetSecretValue` on `mosaic/prod/neptune/connection`
- `neptune-db:connect` on the Neptune cluster ARN

**Staging** (`mosaic-staging` namespace):
- `secretsmanager:GetSecretValue` on `mosaic/staging/neptune/connection`
- `neptune-db:connect` on the Neptune cluster ARN (same cluster)

## Cost Estimate

| Resource | Monthly Cost |
|----------|-------------|
| db.t4g.medium (single instance) | ~$70 |
| Storage (10GB initial) | ~$1 |
| I/O requests | ~$5-10 |
| **Total** | **~$76-81/mo** |

## Architecture Impact

- **Replaces:** Apache AGE graph extension plan for Aurora
- **Does not replace:** PostgreSQL as primary data store
- **New dependency:** Neptune cluster (single shared instance) + TinkerPop (local dev)
- **New adapter:** `GraphAdapter` in Core API adapters layer (with prefix-label isolation)
- **Shared resource:** Single Neptune cluster serves both prod and staging (prefix-label isolation)
- **Future migration:** Can split to separate clusters per environment when budget allows (see Migration Path above)
