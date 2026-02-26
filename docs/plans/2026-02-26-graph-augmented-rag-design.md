# Graph-Augmented RAG for AI Personas — Design Document

**Date:** 2026-02-26
**Status:** Approved
**Depends on:** [Neptune Graph Database Design](completed/2026-02-26-neptune-graph-database-design.md)

## Overview

Enhance the AI persona context assembly by combining pgvector embedding similarity search with targeted Neptune graph traversals. The result: richer, more connected, and more contextually aware persona conversations — without sacrificing response latency or violating access permissions.

**Architecture approach:** GraphContextService as Orchestrator (Approach A) — a new service sits between the storytelling adapter and data sources, orchestrating intent analysis, embedding search, graph traversal, access filtering, and context assembly.

## Current State

- **2 personas** (biographer, friend) — YAML-configured, base safety rules + per-persona behavioral prompts
- **RAG pipeline** — pgvector with Titan v2 1024-dim embeddings, paragraph chunking (500 tokens), cosine distance search, role-based visibility filtering, cross-legacy retrieval via legacy links
- **Story Evolution** — 7-phase state machine, loads full story + RAG for adjacent context, 5 writing styles, 3 length preferences, SSE streaming
- **No token budgeting** — fixed limits (20 messages, 5 chunks, 1024 max output)
- **Neptune infrastructure deployed** (CDK, Helm, Docker Compose) but zero application code — no GraphAdapter, no Python dependencies, no dual-write
- **Entity extraction** (Place, Object, Event) — designed but not implemented

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | GraphContextService orchestrator | Clean orchestration point, centralized token budgeting, graceful degradation |
| Intent analysis | Lightweight LLM (Haiku via Bedrock) | Handles ambiguity well, ~200-400ms, runs parallel with embedding search |
| Story Evolution suggestions | Proactive | Surfaces connections users wouldn't think to ask about |
| Persona scope | All 4 (biographer, friend, colleague, family) fully implemented | Future-proofs traversal + persona system |
| Entity backfill | Automatic Kubernetes Job on deploy | Idempotent, no manual intervention needed |
| Debug UI | Backend only (debug=true query param) | Sufficient for development, no frontend scope |

---

## Section 1: GraphAdapter Implementation

### Prerequisites

The GraphAdapter is designed in the Neptune design doc but has no application code. This is the first prerequisite.

### New File: `services/core-api/app/adapters/graph_adapter.py`

**Abstract base class** with methods from the Neptune design doc:

```python
class GraphAdapter(ABC):
    """Abstract graph database adapter.
    All label and relationship type parameters use UNPREFIXED logical names.
    Implementations handle environment prefix injection transparently.
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

### Two Implementations

1. **`NeptuneGraphAdapter`** — Production/staging
   - Uses `httpx` async client for openCypher queries to Neptune HTTPS endpoint
   - IAM SigV4 signing via `botocore.auth.SigV4Auth`
   - Connection pooling via httpx's async client
   - Reads: `NEPTUNE_HOST`, `NEPTUNE_PORT`, `NEPTUNE_REGION`, `NEPTUNE_IAM_AUTH`, `NEPTUNE_ENV_PREFIX`

2. **`LocalGraphAdapter`** — Local development
   - Connects to TinkerPop Gremlin Server on port 18182
   - Uses **Gremlin queries** (via `gremlinpython`) since TinkerPop's openCypher support is limited
   - Functionally equivalent to production openCypher queries — callers don't know the difference

### Dependencies

- `gremlinpython` — for LocalGraphAdapter
- `botocore` — already present for SigV4

### Factory and Registration

```python
def create_graph_adapter(settings: Settings) -> GraphAdapter:
    """Factory function — reads config and returns appropriate implementation."""

async def get_graph_adapter() -> GraphAdapter:
    """FastAPI dependency injection."""
```

### Dual-Write Integration

Add graph adapter calls in existing service layer methods for Person/Legacy/Story CRUD. All Neptune writes are wrapped in `try/except` — failures are logged but don't block PostgreSQL operations (best-effort per the Neptune design doc).

| Event | Graph Operation |
|-------|----------------|
| Legacy created/updated | Upsert `:Legacy` node |
| Story created/updated | Upsert `:Story` node + `:BELONGS_TO` relationship |
| Person created | Upsert `:Person` node |
| LegacyMember added | Create social relationship edges |
| LegacyLink created | Create `:LINKED_TO` edge |
| Entity extraction | Create entity nodes + edges (see Section 2) |

---

## Section 2: Entity Extraction Pipeline

Enables Place, Object, and Event nodes in Neptune — graph-native entities that don't exist in PostgreSQL.

### Write-Time Extraction

When a story is created or updated, after PostgreSQL write + embedding indexing, a background task calls Bedrock with the story content and a structured extraction prompt.

**Model:** Claude Haiku (`us.anthropic.claude-haiku-4-5-20251001-v1:0`) via Bedrock — fast, cheap ($0.80/M input tokens), sufficient for structured extraction.

**Extraction prompt output format:**

```json
{
  "people": [{"name": "Uncle Jim", "context": "mother's brother", "confidence": 0.95}],
  "places": [{"name": "Lake Michigan cabin", "type": "residence", "location": "Michigan", "confidence": 0.9}],
  "events": [{"name": "Summer reunion 1985", "type": "family_gathering", "date": "1985", "confidence": 0.85}],
  "objects": [{"name": "grandfather's pocket watch", "type": "heirloom", "confidence": 0.8}],
  "time_references": [{"period": "1980s", "context": "childhood summers"}]
}
```

### Confidence Threshold

Only entities with confidence >= 0.7 are written to Neptune. Precision over recall — better to miss an entity than pollute the graph with noise.

### Person Mention Resolution

Extracted person names are matched against existing Person nodes in the graph (fuzzy name matching against the legacy's Person node and connected Person nodes):
- **Match found:** Create `MENTIONS` relationship from Story to Person
- **No match:** Store as metadata on the Story node's properties (not a standalone Person node) to avoid orphan nodes

### Neptune Writes After Extraction

- Upsert Place/Event/Object nodes with the story's legacy as context
- Create `TOOK_PLACE_AT`, `REFERENCES`, `MENTIONS` relationships from Story to extracted entities
- Create `PARTICIPATED_IN`, `LIVED_IN` relationships from Person nodes to extracted Places/Events when the story's subject is clearly involved

### New Service

**File:** `services/core-api/app/services/entity_extraction.py`

```python
class EntityExtractionService:
    async def extract_entities(self, story_content: str) -> ExtractedEntities: ...
    async def sync_entities_to_graph(self, story_id: UUID, legacy_id: UUID, entities: ExtractedEntities) -> None: ...
```

**Integration point:** Called from `services/core-api/app/services/ingestion.py` after chunk indexing completes (same background task pipeline).

### Backfill

**CLI command:** `uv run python -m app.cli.backfill_entities` — iterates over all existing stories, extracts entities, writes to Neptune. Rate-limited to avoid Bedrock throttling. Idempotent.

**Kubernetes Job:** Deployed as a Job manifest that runs automatically on deploy. Uses the same CLI command. Idempotent so re-runs are safe.

---

## Section 3: Persona Expansion

### New Persona Types

Add `colleague` and `family` personas alongside existing `biographer` and `friend`. Each gets a full definition in `personas.yaml` with system prompt and traversal configuration.

| Persona | Focus | Relationship Priority | Traversal Depth |
|---------|-------|----------------------|-----------------|
| Biographer | Comprehensive life narrative | All relationships equally | 2 hops |
| Friend | Personal stories, shared experiences | FRIENDS_WITH, KNEW | 1 hop |
| Colleague | Professional context, career | WORKED_WITH | 1 hop |
| Family | Family bonds, home life | FAMILY_OF | 2 hops |

### System Prompt Files

New files in `services/core-api/app/config/`:
- `personas/colleague.txt` — professional lens, workplace anecdotes, career milestones
- `personas/family.txt` — family bonds, home life, traditions, generational connections

### Traversal Configuration

Added to `personas.yaml` as a `traversal` block per persona:

```yaml
biographer:
  traversal:
    max_hops: 2
    relationship_weights:
      FAMILY_OF: 1.0
      KNEW: 0.8
      WORKED_WITH: 0.7
      FRIENDS_WITH: 0.8
    max_graph_results: 20
    include_cross_legacy: true
    temporal_range: "full"

friend:
  traversal:
    max_hops: 1
    relationship_weights:
      FAMILY_OF: 0.5
      KNEW: 1.0
      WORKED_WITH: 0.4
      FRIENDS_WITH: 1.0
    max_graph_results: 15
    include_cross_legacy: true
    temporal_range: "recent"

colleague:
  traversal:
    max_hops: 1
    relationship_weights:
      FAMILY_OF: 0.2
      KNEW: 0.6
      WORKED_WITH: 1.0
      FRIENDS_WITH: 0.5
    max_graph_results: 15
    include_cross_legacy: false
    temporal_range: "career"

family:
  traversal:
    max_hops: 2
    relationship_weights:
      FAMILY_OF: 1.0
      KNEW: 0.3
      WORKED_WITH: 0.2
      FRIENDS_WITH: 0.4
    max_graph_results: 20
    include_cross_legacy: true
    temporal_range: "full"
```

The `relationship_weights` are used in the merge/ranking phase — graph results from higher-weighted relationships get a relevance boost for that persona type.

---

## Section 4: GraphContextService Architecture

### New File: `services/core-api/app/services/graph_context.py`

```python
class GraphContextService:
    def __init__(
        self,
        graph_adapter: GraphAdapter,
        retrieval_service: RetrievalService,
        intent_analyzer: IntentAnalyzer,
        ai_adapter: AIAdapter,
    ): ...

    async def assemble_context(
        self,
        query: str,
        legacy_id: UUID,
        user_id: UUID,
        persona_type: str,
        conversation_history: list[Message] | None = None,
        linked_story_id: UUID | None = None,
        token_budget: int = 4000,
    ) -> AssembledContext: ...
```

### AssembledContext

```python
@dataclass
class AssembledContext:
    formatted_context: str          # Ready for LLM prompt insertion
    embedding_results: list[ChunkResult]
    graph_results: list[GraphResult]
    metadata: ContextMetadata       # Debug info: sources, latencies, traversals
```

### Processing Pipeline

```
prepare_turn() → GraphContextService.assemble_context()
                    ├── Intent Analysis (LLM, ~200-400ms) ──────┐ parallel via asyncio.gather()
                    ├── Embedding Search (pgvector, ~100-200ms) ─┤
                    └── wait ────────────────────────────────────┘
                         ↓
                    Graph Traversal (Neptune, ~100-200ms, depends on intent)
                         ↓
                    Access Filtering (~10ms)
                         ↓
                    Merge + Rank + Deduplicate (~5ms)
                         ↓
                    Token Budget + Format (~5ms)
```

**Total added latency:** ~200-600ms over current embedding-only (~200ms).

### Integration Point

`prepare_turn()` in `services/core-api/app/adapters/storytelling.py` currently calls `retrieve_context()` directly. It delegates to `graph_context_service.assemble_context()` instead, which internally calls `retrieve_context()`. The storytelling adapter receives formatted context ready for prompt insertion.

---

## Section 5: Query Intent Analysis

### New File: `services/core-api/app/services/intent_analyzer.py`

```python
class IntentAnalyzer:
    async def analyze(
        self, query: str, conversation_history: list[Message] | None = None
    ) -> QueryIntent: ...
```

### Intent Types

| Intent | Description | Example |
|--------|------------|---------|
| `relational` | About relationships between people | "Tell me about her relationship with Uncle Jim" |
| `temporal` | About a time period or sequence | "What was Dad's life like in the 1970s?" |
| `spatial` | About a place or location | "What are some stories about the lake house?" |
| `entity_focused` | About a specific thing/event | "Tell me about the family reunion" |
| `general` | Open-ended, no specific focus | "Tell me more about her" |
| `cross_legacy` | About another person's perspective | "What do others remember about this?" |

### LLM Prompt

```
Given this user message in a conversation about {legacy_subject_name}'s life,
classify the intent and extract mentioned entities.

User message: {query}
Recent conversation context: {last 2-3 messages for disambiguation}

Respond with JSON:
{
  "intent": "relational|temporal|spatial|entity_focused|general|cross_legacy",
  "entities": {
    "people": ["Uncle Jim"],
    "places": ["Chicago"],
    "time_periods": ["1970s"],
    "events": ["retirement"],
    "objects": []
  },
  "confidence": 0.85
}
```

**Model:** Claude Haiku via Bedrock — ~200ms, ~$0.001/call.

### Fallback

If intent analysis fails or confidence < 0.5, defaults to `general` intent with no extracted entities. The graph traversal uses a broad 1-hop neighborhood query from the legacy's Person node.

### Caching

- Intent results: NOT cached (each query is unique)
- Entity-to-graph-node resolution (e.g., "Uncle Jim" → Person UUID): cached per conversation session via in-memory dict

---

## Section 6: Graph Traversal Strategies

### New File: `services/core-api/app/services/graph_traversal.py`

Maps `(QueryIntent, PersonaType)` to parameterized openCypher queries.

### Query Templates

**Relational:**
```cypher
MATCH (p:Person {id: $person_id})-[r:FAMILY_OF|KNEW|WORKED_WITH|FRIENDS_WITH]-(connected:Person)
OPTIONAL MATCH (s:Story)-[:MENTIONS]->(connected)
RETURN connected, r, collect(s) AS stories
ORDER BY CASE type(r)
  WHEN 'FAMILY_OF' THEN 1
  WHEN 'FRIENDS_WITH' THEN 2
  WHEN 'KNEW' THEN 3
  ELSE 4 END
LIMIT $limit
```

With entity filter (when a specific person is mentioned):
```cypher
MATCH (p:Person {id: $person_id})-[r]-(connected:Person)
WHERE connected.name CONTAINS $entity_name
OPTIONAL MATCH (s:Story)-[:MENTIONS]->(connected)
RETURN connected, r, collect(s) AS stories
```

**Temporal:**
```cypher
MATCH (p:Person {id: $person_id})<-[:MENTIONS]-(s:Story)
WHERE s.created_at >= $period_start AND s.created_at <= $period_end
RETURN s
UNION
MATCH (p:Person {id: $person_id})-[:PARTICIPATED_IN]->(e:Event)
WHERE e.date CONTAINS $period_label
OPTIONAL MATCH (s:Story)-[:REFERENCES]->(e)
RETURN s
UNION
MATCH (p:Person {id: $person_id})-[:LIVED_IN {period: $period_label}]->(place:Place)
OPTIONAL MATCH (s:Story)-[:TOOK_PLACE_AT]->(place)
RETURN s
LIMIT $limit
```

**Spatial:**
```cypher
MATCH (place:Place)
WHERE place.name CONTAINS $place_name
OPTIONAL MATCH (s:Story)-[:TOOK_PLACE_AT]->(place)
OPTIONAL MATCH (p:Person)-[:LIVED_IN|WORKED_AT]->(place)
RETURN place, collect(DISTINCT s) AS stories, collect(DISTINCT p) AS people
LIMIT $limit
```

**Entity-focused:**
```cypher
MATCH (entity)
WHERE (entity:Place OR entity:Event OR entity:Object) AND entity.name CONTAINS $entity_name
OPTIONAL MATCH (s:Story)-[:TOOK_PLACE_AT|REFERENCES]->(entity)
RETURN entity, collect(s) AS stories
LIMIT $limit
```

**Cross-legacy:**
```cypher
MATCH (l:Legacy {id: $legacy_id})-[:LINKED_TO]-(linked:Legacy)
OPTIONAL MATCH (s:Story)-[:BELONGS_TO]->(linked)
RETURN linked, collect(s) AS stories
LIMIT $limit
```

**General (1-hop neighborhood):**
```cypher
MATCH (p:Person {id: $person_id})-[r]-(connected)
RETURN connected, type(r) AS rel_type, r
LIMIT $limit
```

### Constraints

- All traversals capped at configured `max_graph_results` and `max_hops`
- No query traverses more than 2 hops
- All label references are prefixed by the GraphAdapter transparently

---

## Section 7: Access Filtering

### Principle

The graph enriches context discovery, but the PostgreSQL-based permission model remains the single source of truth. Graph results are additive suggestions, not access overrides.

### GraphAccessFilter

```python
class GraphAccessFilter:
    async def filter_story_ids(
        self,
        story_ids_with_sources: list[tuple[UUID, UUID, float]],  # (story_id, legacy_id, score)
        user_id: UUID,
        primary_legacy_id: UUID,
        db: AsyncSession,
    ) -> list[tuple[UUID, float]]:
        """Returns filtered (story_id, score) tuples the user can access."""
```

### Filtering Rules

1. **Primary legacy stories:** Apply existing `resolve_visibility_filter()` from `retrieval.py`:
   - Creator/Admin/Advocate: public + private + own personal
   - Admirer: public + own personal

2. **Cross-legacy stories (linked):** Check active `LegacyLink` exists, then:
   - `all` share mode: include public + private stories
   - `selective` share mode: include only `LegacyLinkShare` records
   - Reuse `get_shared_story_ids()` and `get_linked_legacy_filters()`

3. **Unlinked legacy stories:** Story ID is **dropped entirely**. Connection metadata (e.g., "Subject knew this person") can still be used as relationship context, but story content is not surfaced.

---

## Section 8: Context Ranking and Assembly

### Scoring Algorithm

**Embedding results** arrive with `cosine_similarity` (0.0–1.0).

**Graph results** get `graph_relevance_score`:
```
graph_relevance_score = hop_factor * relationship_weight + entity_match_bonus
```
- `hop_factor`: 1-hop = 1.0, 2-hop = 0.6
- `relationship_weight`: from persona traversal config
- `entity_match_bonus`: +0.2 if story was found by matching a query-extracted entity

**Deduplication and combined scoring:**
- Stories in BOTH sets: `combined_score = max(embedding_score, graph_relevance_score) + 0.15`
- Stories in one set only: `combined_score = source_score`

### Token Budgeting

Default total budget: 4000 tokens.

| Category | Allocation | ~Tokens |
|----------|-----------|---------|
| Relationship map | Fixed | ~200 |
| Primary results | 60% of remainder | ~2280 |
| Graph-discovered results | 30% of remainder | ~1140 |
| Metadata/provenance | 10% of remainder | ~380 |

Token counting via `tiktoken` with `cl100k_base` encoding. Results inserted in descending `combined_score` order until each category's budget is exhausted.

### Context Format

```
## Known Connections
[Subject] was married to [Person A]. [Subject] knew [Person B] since college.
[Subject] lived in Chicago (1970-1985) and worked at [Company] (1975-1990).

## Relevant Stories (from [Legacy Name])
### "Summer at the Lake House" (1985)
[Story excerpt — truncated to fit budget]
Source: Primary legacy, matched by: embedding similarity + place connection

### "Meeting Uncle Jim" (1972)
[Story excerpt]
Source: Primary legacy, matched by: relational graph traversal (FAMILY_OF)

## Stories from Connected Legacies
### "Dad's College Years" — from [Person A]'s legacy
[Story excerpt]
Source: Linked legacy ([Person A]), matched by: cross-legacy traversal
Shared via: Legacy link (all stories shared)
```

Provenance markers help the persona reference sources naturally ("As [Person A] remembers in their story...").

---

## Section 9: Story Evolution Integration

Graph context is proactively surfaced at three points in the Story Evolution workflow.

### 1. Opening Message Enhancement

Before generating the opening message, call `GraphContextService` with the story's content as the "query" to discover:
- People mentioned → connected Person nodes → stories about those people?
- Places mentioned → Place nodes → other stories at those locations?
- Time periods → Event nodes

This information is injected into the opening instruction:

> "This story mentions your Uncle Jim visiting the lake house. I noticed there are 3 other stories that involve Uncle Jim and 2 more about the lake house from different time periods. Would you like to explore any of those connections?"

### 2. Inline Elicitation Suggestions

Each user message goes through `prepare_turn()` which now uses `GraphContextService`. The system prompt naturally includes graph-discovered connections.

A **graph suggestion directive** is appended during elicitation mode:

```
When graph context reveals connected stories, people, or places that are relevant
to the current topic, naturally weave a brief mention into your response. For example:
"That reminds me — there's another story about [Place] from [time period].
Would it help to bring in those details?"

Only suggest connections that are clearly relevant to what the user is currently
discussing. Don't interrupt the flow with unrelated graph discoveries.
Limit to one suggestion per response at most.
```

### 3. Pre-Summarization Context Enrichment

Before the summary phase, review all entities mentioned during elicitation and do a final graph traversal to find connections not surfaced during chat:

```
## Additional Context from Connected Stories
- Uncle Jim also appears in "The Family Reunion" (1988) — shared memory of the same event
- The lake house location connects to "Moving Away" (1990) — final summer there
```

The story writer agent can incorporate these connections into the evolved draft.

### Implementation Points

- Extend `generate_opening_message()` to accept graph context
- Graph suggestion directive as a config file conditionally appended during elicitation
- Pre-summarization enrichment as a new step in `summarize_conversation()`

---

## Section 10: Performance and Resilience

### Parallel Execution

```
Intent Analysis (200-400ms) ─┐
                              ├─ asyncio.gather() ─→ Graph Traversal (100-200ms) → Merge (5ms) → Format (5ms)
Embedding Search (100-200ms) ─┘
```

Total: ~400-800ms. Current embedding-only: ~200ms. Added latency: ~200-600ms.

### Caching

**Person neighborhood cache** (in-memory, per-process, TTL=5 min):
- Key: `(person_id, legacy_id)`
- Value: 1-hop connections
- Implementation: `cachetools.TTLCache`

**Entity resolution cache** (per-conversation session, in-memory):
- Key: `(entity_name, legacy_id)`
- Value: resolved graph node UUID

### Circuit Breaker

| State | Behavior | Transition |
|-------|---------|------------|
| `closed` | Normal operation | → `open` after 3 consecutive failures |
| `open` | Skip Neptune, return empty results | → `half_open` after 30s cooldown |
| `half_open` | Try one Neptune call | → `closed` on success, → `open` on failure |

When open, `assemble_context()` returns embedding-only results with no user-visible error.

### Feature Flag

`GRAPH_AUGMENTATION_ENABLED` environment variable (default `true`). Setting to `false` skips all graph-related work.

### Timeout Budget

| Operation | Timeout |
|-----------|---------|
| Intent analysis | 500ms |
| Graph traversal | 300ms |
| Embedding search | 500ms |
| Total pipeline | 2000ms hard cap |

Exceeded timeouts return partial/empty results. Implementation: `asyncio.wait_for()`.

---

## Section 11: Observability

### OpenTelemetry Spans

| Span | Key Attributes | Target |
|------|---------------|--------|
| `graph_context.assemble` | `legacy_id`, `persona_type`, `token_budget` | <2000ms |
| `graph_context.intent_analysis` | `intent_type`, `confidence`, `entity_count` | <500ms |
| `graph_context.traversal` | `intent_type`, `query_template`, `result_count`, `hops` | <300ms |
| `graph_context.access_filter` | `input_count`, `filtered_count`, `cross_legacy_count` | <50ms |
| `graph_context.merge_rank` | `embedding_count`, `graph_count`, `deduped_count`, `final_count` | <10ms |
| `entity_extraction.extract` | `story_id`, `entity_count`, `model_id` | <3000ms |
| `entity_extraction.sync_graph` | `story_id`, `nodes_upserted`, `edges_created` | <500ms |
| `graph_adapter.query` | `query_type`, `result_count` | <300ms |

### Structured Logging

```json
{"level": "info", "component": "graph_context", "event": "context_assembled",
 "embedding_results": 5, "graph_results": 8, "final_results": 10,
 "graph_ratio": 0.4, "latency_ms": 650, "circuit_state": "closed"}

{"level": "warn", "component": "graph_context", "event": "neptune_timeout",
 "operation": "traversal", "timeout_ms": 300, "fallback": "embedding_only"}

{"level": "info", "component": "entity_extraction", "event": "entities_extracted",
 "story_id": "...", "people": 3, "places": 1, "events": 2, "objects": 0}
```

### Prometheus Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `graph_context_latency_seconds` | Histogram | `phase` |
| `graph_context_results_total` | Counter | `source` |
| `graph_context_circuit_state` | Gauge | `state` |
| `entity_extraction_entities_total` | Counter | `type` |
| `neptune_query_latency_seconds` | Histogram | `query_type` |

### Debug Mode

`debug=true` query parameter on persona chat endpoints returns metadata:

```json
{
  "message": "...",
  "debug": {
    "intent": {"type": "relational", "entities": {"people": ["Uncle Jim"]}, "confidence": 0.9},
    "context_sources": [
      {"story_id": "...", "title": "...", "source": "embedding", "score": 0.87},
      {"story_id": "...", "title": "...", "source": "graph:FAMILY_OF", "score": 0.82}
    ],
    "graph_traversals": [{"template": "relational", "results": 4, "latency_ms": 120}],
    "circuit_state": "closed"
  }
}
```

Gated behind admin/debug permission.

---

## Section 12: Implementation Sequence

### Phase 1: Foundation (GraphAdapter + Dual Write)

1. Implement GraphAdapter ABC + NeptuneGraphAdapter + LocalGraphAdapter
2. Add Python dependencies + fix Docker Compose config mount
3. Add dual-write calls in Person/Legacy/Story service methods
4. Integration tests against local TinkerPop

### Phase 2: Entity Extraction Pipeline

5. Implement EntityExtractionService with Bedrock Haiku
6. Integrate into story ingestion pipeline
7. Build backfill CLI command + Kubernetes Job manifest
8. Test extraction quality on existing stories

### Phase 3: Persona Expansion

9. Create system prompts for colleague and family personas
10. Add traversal configurations for all 4 persona types

### Phase 4: GraphContextService Core

11. Implement IntentAnalyzer with Bedrock Haiku
12. Implement GraphTraversalService with openCypher query templates
13. Implement GraphAccessFilter reusing existing permissions
14. Implement GraphContextService orchestrator with parallel execution
15. Implement context ranking, token budgeting, formatting
16. Add circuit breaker, caching, feature flag

### Phase 5: Integration

17. Refactor `prepare_turn()` to use GraphContextService
18. Integration tests for full pipeline

### Phase 6: Story Evolution Enhancement

19. Enhance `generate_opening_message()` with graph context
20. Add graph suggestion directive for elicitation mode
21. Add pre-summarization graph enrichment
22. E2E tests

### Phase 7: Observability + Debug

23. Add OTel spans, structured logs, Prometheus metrics
24. Add debug mode endpoint
25. Performance profiling and tuning

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| TinkerPop openCypher support is limited | LocalGraphAdapter uses Gremlin equivalents; verified against real Neptune in staging |
| Entity extraction quality | Confidence threshold (0.7), graph is reconstructable, quality review |
| Added latency (~400-600ms) | Parallel execution, caching, timeouts; feature flag for instant rollback |
| Bedrock Haiku cost for intent analysis | ~$0.001/message — negligible at MVP scale |
| Person name resolution ("Uncle Jim" vs "James Smith") | Fuzzy matching; unresolved names still useful as context |
| Neptune cold starts | Warm-up query on app startup; circuit breaker handles timeouts |
| Cross-legacy permission complexity | Access filter is strict — drops inaccessible stories; graph metadata still usable |

---

## New Files Summary

| File | Purpose |
|------|---------|
| `services/core-api/app/adapters/graph_adapter.py` | GraphAdapter ABC + Neptune + Local implementations |
| `services/core-api/app/services/entity_extraction.py` | EntityExtractionService |
| `services/core-api/app/services/intent_analyzer.py` | IntentAnalyzer |
| `services/core-api/app/services/graph_traversal.py` | GraphTraversalService |
| `services/core-api/app/services/graph_context.py` | GraphContextService + GraphAccessFilter |
| `services/core-api/app/cli/backfill_entities.py` | Backfill CLI command |
| `services/core-api/app/config/personas/colleague.txt` | Colleague persona system prompt |
| `services/core-api/app/config/personas/family.txt` | Family persona system prompt |
| `services/core-api/app/config/graph_suggestions.txt` | Graph suggestion directive for elicitation |

## Modified Files

| File | Change |
|------|--------|
| `services/core-api/app/adapters/storytelling.py` | `prepare_turn()` delegates to GraphContextService |
| `services/core-api/app/services/ingestion.py` | Calls EntityExtractionService after chunk indexing |
| `services/core-api/app/services/story_evolution.py` | Graph context in opening message + pre-summarization |
| `services/core-api/app/config/personas.yaml` | Traversal configs for all 4 personas |
| `services/core-api/app/config/elicitation_mode.txt` | Reference to graph suggestion directive |
| `services/core-api/pyproject.toml` | Add gremlinpython, cachetools, tiktoken dependencies |
| `infra/compose/docker-compose.yml` | Mount TinkerPop config file |
| Various service files | Dual-write calls for Person/Legacy/Story CRUD |
