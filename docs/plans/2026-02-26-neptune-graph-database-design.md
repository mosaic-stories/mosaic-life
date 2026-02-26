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

## CDK Infrastructure

### New Stack: `NeptuneDatabaseStack`

**File:** `infra/cdk/lib/neptune-database-stack.ts`

Structure mirrors the existing Aurora stack pattern:

```
NeptuneDatabaseStack
├── SecurityGroup (port 8182 inbound from VPC CIDR)
├── SubnetGroup (private subnets with egress)
├── ClusterParameterGroup
│   └── neptune_enable_audit_log: 1
│   └── neptune_enforce_ssl: 1
├── ParameterGroup
│   └── neptune_query_timeout: 120000
├── DatabaseCluster
│   ├── Engine: neptune (latest stable)
│   ├── Instance: db.t4g.medium x 1
│   ├── openCypher enabled
│   ├── Encrypted at rest (KMS)
│   ├── Deletion protection (prod)
│   └── CloudWatch log exports (audit)
├── Secret (Secrets Manager)
│   └── mosaic/{env}/neptune/connection
│   └── Fields: host, port (8182), engine (neptune), iam_auth, region
├── IRSA Role
│   └── core-api service account can read the secret
│   └── neptune-db:connect IAM action
└── CfnOutputs (endpoint, port, security group ID)
```

### Stack Registration

In `infra/cdk/bin/mosaic-life.ts`:

```typescript
new NeptuneDatabaseStack(app, 'MosaicNeptuneDatabaseStack', {
  env: { account, region },
  vpc: mainStack.vpc,
  environment: 'prod',
});
```

## Graph Data Model

### Node Types

| Node | Properties | Source |
|------|-----------|--------|
| `:Person` | `id` (UUID), `name`, `legacy_id`, `user_id` | Synced from `persons` table |
| `:Legacy` | `id` (UUID), `name`, `created_at` | Synced from `legacies` table |
| `:Story` | `id` (UUID), `title`, `story_type`, `tags[]`, `created_at` | Synced from `stories` table |
| `:Place` | `id` (UUID), `name`, `location`, `type` | Extracted from stories (AI/NLP) |
| `:Object` | `id` (UUID), `name`, `description`, `type` | Extracted from stories (AI/NLP) |
| `:Event` | `id` (UUID), `name`, `date`, `type` | Extracted from stories (AI/NLP) |

### Social Network Relationships

```cypher
(:Person)-[:FAMILY_OF {relationship: "spouse|child|sibling|parent|..."}]->(:Person)
(:Person)-[:KNEW {since, context}]->(:Person)
(:Person)-[:WORKED_WITH {company, period}]->(:Person)
(:Person)-[:FRIENDS_WITH {since, context}]->(:Person)
```

### Content Connection Relationships

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

## Application Integration

### GraphAdapter Pattern

New adapter in `services/core-api/app/adapters/graph_adapter.py`:

```python
class GraphAdapter(ABC):
    """Abstract graph database adapter."""

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

### Implementations

- `NeptuneGraphAdapter` — production, connects via HTTPS with IAM SigV4 signing
- `LocalGraphAdapter` — local dev, connects to TinkerPop server on port 8182

### Dual-Write Integration Points

| Event | Graph Operation |
|-------|----------------|
| Legacy created/updated | Upsert `:Legacy` node |
| Story created/updated | Upsert `:Story` node + `:ABOUT` relationship |
| Person created | Upsert `:Person` node |
| LegacyMember added | Create relationship edges |
| LegacyLink created | Create `:LINKED_TO` edge |
| Story entity extraction | Create `:Place`/`:Object`/`:Event` nodes + `:MENTIONS_*` edges |

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

Secret name: `mosaic/{env}/neptune/connection`

```json
{
  "host": "mosaic-prod-neptune-cluster.cluster-xxxxx.us-east-1.neptune.amazonaws.com",
  "port": "8182",
  "engine": "neptune",
  "iam_auth": "true",
  "region": "us-east-1"
}
```

### External Secrets

Add to Helm chart's `external-secrets.yaml`:

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
        key: mosaic/prod/neptune/connection
        property: host
    - secretKey: NEPTUNE_PORT
      remoteRef:
        key: mosaic/prod/neptune/connection
        property: port
    - secretKey: NEPTUNE_REGION
      remoteRef:
        key: mosaic/prod/neptune/connection
        property: region
```

### Core API Environment Variables

| Variable | Description | Local | Production |
|----------|-------------|-------|------------|
| `NEPTUNE_HOST` | Cluster endpoint | `localhost` | From Secrets Manager |
| `NEPTUNE_PORT` | Connection port | `18182` | `8182` |
| `NEPTUNE_IAM_AUTH` | Enable IAM auth | `false` | `true` |
| `NEPTUNE_REGION` | AWS region for SigV4 | — | `us-east-1` |

### IRSA

Extend existing core-api service account role with:
- `secretsmanager:GetSecretValue` on `mosaic/*/neptune/connection`
- `neptune-db:connect` on the Neptune cluster ARN

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
- **New dependency:** Neptune cluster + TinkerPop (local dev)
- **New adapter:** `GraphAdapter` in Core API adapters layer
