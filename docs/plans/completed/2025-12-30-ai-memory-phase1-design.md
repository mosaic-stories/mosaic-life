# AI Memory Phase 1: Vector Store Foundation

**Date:** 2025-12-30
**Status:** Draft
**Author:** Brainstorming session with Claude

## Overview

Phase 1 establishes the foundation for AI-powered knowledge retrieval in Mosaic Life. The primary goal is enabling AI chat to answer questions about stories by retrieving relevant content from the legacy's story corpus.

### Primary Use Case

User asks: "What did grandma do in the 1960s?"
AI retrieves relevant story chunks and answers with that context.

### Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Vector storage | pgvector in existing PostgreSQL | No new infrastructure, ACID compliance, same-transaction deletes |
| Embedding model | Amazon Titan Embeddings v2 | Native Bedrock integration, 1024 dimensions, good cost |
| Permission model | Visibility-based filtering | Uses existing schema, extends to tribes later |
| Ingestion approach | FastAPI BackgroundTasks | Simple for MVP, add SQS later if needed |
| Delete behavior | Synchronous (CASCADE), async audit | Immediate deletion for trust, audit in background |
| Chunking strategy | Paragraph-aware, ~500 tokens | Respects content structure, good retrieval granularity |

---

## Architecture

### Data Flow

```
Story Created/Updated
        │
        ▼
  Save to PostgreSQL (stories table)
        │
        ▼
  BackgroundTask: chunk → embed via Titan v2 → store in pgvector
        │
        ▼
  Vectors ready for retrieval

User asks question in AI chat
        │
        ▼
  Resolve user's access (legacy membership + role)
        │
        ▼
  Embed question → vector search with filters (legacy_id, visibility)
        │
        ▼
  Retrieve top-k story chunks user is authorized to see
        │
        ▼
  Inject chunks into system prompt as context
        │
        ▼
  Claude generates answer citing the retrieved content
```

### Key Components

- **pgvector extension** in existing PostgreSQL (RDS)
- **New table:** `story_chunks` with vector column + metadata
- **Bedrock adapter extension:** Add Titan embedding calls alongside existing Claude calls
- **Retrieval service:** Permission-aware vector search
- **Modified AI chat flow:** Retrieve context before calling Claude

### What Stays the Same

- Existing story CRUD operations (we hook into them)
- Existing permission model (we query it)
- Existing Bedrock adapter pattern (we extend it)
- Existing personas (Biographer, Friend)

---

## Database Schema

### pgvector Setup

```sql
-- Enable extension (one-time, requires RDS support)
CREATE EXTENSION IF NOT EXISTS vector;
```

### Story Chunks Table

```sql
CREATE TABLE story_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source reference
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,  -- 0, 1, 2... for ordering

    -- Content
    content TEXT NOT NULL,  -- The actual text chunk

    -- Vector embedding (Titan v2 = 1024 dimensions)
    embedding vector(1024) NOT NULL,

    -- Denormalized for efficient filtering (avoids joins during search)
    legacy_id UUID NOT NULL,  -- Which legacy this belongs to
    visibility VARCHAR(20) NOT NULL,  -- 'public', 'private', 'personal'
    author_id UUID NOT NULL,  -- For 'personal' visibility filtering

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(story_id, chunk_index)
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX story_chunks_embedding_idx
    ON story_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Filter indexes (used in WHERE clause during vector search)
CREATE INDEX story_chunks_legacy_id_idx ON story_chunks(legacy_id);
CREATE INDEX story_chunks_visibility_idx ON story_chunks(legacy_id, visibility);
```

### Audit Log Table

```sql
CREATE TABLE knowledge_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(50) NOT NULL,  -- 'story_indexed', 'story_reindexed', 'story_deleted'
    story_id UUID,  -- NULL if story no longer exists
    legacy_id UUID NOT NULL,
    user_id UUID NOT NULL,
    chunk_count INTEGER,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX knowledge_audit_log_legacy_idx ON knowledge_audit_log(legacy_id);
CREATE INDEX knowledge_audit_log_created_idx ON knowledge_audit_log(created_at);
```

### Why Denormalize?

Vector search with filters is: `ORDER BY embedding <=> query_vector WHERE legacy_id = X AND visibility IN (...)`. Denormalizing `legacy_id`, `visibility`, and `author_id` avoids joining to `stories` and `story_legacies` tables during every search - critical for performance.

---

## Chunking Strategy

### Approach: Paragraph-aware chunking with size limits

```
Story Content
     │
     ▼
Split by paragraphs (double newline)
     │
     ▼
Merge small paragraphs until ~500 tokens
     │
     ▼
Split large paragraphs at ~500 tokens with 50 token overlap
     │
     ▼
Store each chunk with index (0, 1, 2...)
```

### Token Targets

- **Chunk size:** ~500 tokens (roughly 375 words)
- **Overlap:** 50 tokens when splitting mid-paragraph
- **Max:** 600 tokens hard limit

### Rationale

- Titan v2 handles up to 8,192 tokens, but smaller chunks = more precise retrieval
- 500 tokens is enough context to be meaningful, small enough to retrieve 5-10 without blowing context window
- Most short stories (under 500 words) become a single chunk - no splitting needed

### Implementation

```python
def chunk_story(content: str) -> list[str]:
    """Split story into chunks for embedding."""
    paragraphs = content.split("\n\n")
    chunks = []
    current_chunk = ""

    for para in paragraphs:
        if token_count(current_chunk + para) < 500:
            current_chunk += "\n\n" + para if current_chunk else para
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para

    if current_chunk:
        chunks.append(current_chunk.strip())

    # Handle oversized chunks (split with overlap)
    return flatten([split_oversized(c) for c in chunks])
```

---

## Embedding & Ingestion Pipeline

### Titan v2 Integration

Extend existing Bedrock adapter:

```python
# app/adapters/bedrock.py (new method)

async def embed_texts(self, texts: list[str]) -> list[list[float]]:
    """Generate embeddings via Amazon Titan Embeddings v2."""
    embeddings = []

    for text in texts:
        response = await self.bedrock_runtime.invoke_model(
            modelId="amazon.titan-embed-text-v2:0",
            body=json.dumps({
                "inputText": text,
                "dimensions": 1024,  # Titan v2 supports 256, 512, 1024
                "normalize": True    # Unit vectors for cosine similarity
            })
        )
        result = json.loads(response["body"].read())
        embeddings.append(result["embedding"])

    return embeddings
```

### Ingestion Flow (BackgroundTask)

```python
# app/services/story.py

async def create_story(...) -> Story:
    story = await save_story_to_db(...)

    # Trigger async embedding after response returns
    background_tasks.add_task(
        index_story_chunks,
        story_id=story.id,
        content=story.content,
        legacy_id=legacy_id,
        visibility=story.visibility,
        author_id=story.author_id
    )

    return story

async def index_story_chunks(story_id, content, legacy_id, visibility, author_id):
    """Background task: chunk, embed, store."""
    # 1. Delete existing chunks (for updates)
    await delete_chunks_for_story(story_id)

    # 2. Chunk the content
    chunks = chunk_story(content)

    # 3. Embed all chunks (batch for efficiency)
    embeddings = await bedrock.embed_texts(chunks)

    # 4. Store in pgvector
    await store_chunks(
        story_id=story_id,
        chunks=zip(chunks, embeddings),
        legacy_id=legacy_id,
        visibility=visibility,
        author_id=author_id
    )
```

### Update and Delete Handling

- **Update:** Delete existing chunks, re-chunk, re-embed, store new
- **Delete:** CASCADE handles it automatically (same transaction)

---

## Permission-Filtered Retrieval

### Access Resolution

```python
async def resolve_visible_content(user_id: UUID, legacy_id: UUID) -> VisibilityFilter:
    """Determine what visibility levels user can access."""

    # Get user's role in this legacy
    membership = await get_legacy_membership(user_id, legacy_id)

    if not membership or membership.role == "pending":
        raise PermissionDenied("Not a member of this legacy")

    # Map role to visible content
    role = membership.role

    if role in ("creator", "admin", "advocate"):
        # Can see public + private + their own personal
        return VisibilityFilter(
            allowed_visibilities=["public", "private", "personal"],
            personal_author_id=user_id  # Only their personal stories
        )
    else:  # admirer
        # Can see public + their own personal only
        return VisibilityFilter(
            allowed_visibilities=["public", "personal"],
            personal_author_id=user_id
        )
```

### Vector Search Query

```sql
SELECT
    content,
    story_id,
    1 - (embedding <=> $1) AS similarity
FROM story_chunks
WHERE
    legacy_id = $2
    AND (
        visibility IN ('public', 'private')  -- Based on role
        OR (visibility = 'personal' AND author_id = $3)  -- User's own
    )
ORDER BY embedding <=> $1  -- Cosine distance
LIMIT $4;  -- top_k, e.g., 5
```

### Retrieval Service

```python
async def retrieve_context(
    query: str,
    legacy_id: UUID,
    user_id: UUID,
    top_k: int = 5
) -> list[ChunkResult]:
    """Retrieve relevant, authorized story chunks."""

    # 1. Check permissions
    visibility_filter = await resolve_visible_content(user_id, legacy_id)

    # 2. Embed the query
    [query_embedding] = await bedrock.embed_texts([query])

    # 3. Search with filters
    chunks = await vector_search(
        embedding=query_embedding,
        legacy_id=legacy_id,
        visibility_filter=visibility_filter,
        top_k=top_k
    )

    return chunks
```

---

## AI Chat Integration

### Modified Chat Flow

Extend existing `app/services/ai.py`:

```python
async def send_message(
    conversation_id: UUID,
    user_message: str,
    user_id: UUID
) -> AsyncIterator[str]:
    """Send message with RAG context."""

    # 1. Get conversation and primary legacy (existing logic)
    conversation = await get_conversation(conversation_id)
    primary_legacy = get_primary_legacy(conversation)

    # 2. NEW: Retrieve relevant story context
    chunks = await retrieve_context(
        query=user_message,
        legacy_id=primary_legacy.id,
        user_id=user_id,
        top_k=5
    )

    # 3. Build context block for system prompt
    context_block = format_context(chunks)

    # 4. Load message history (existing)
    history = await load_message_history(conversation_id)

    # 5. Build system prompt with persona + context
    system_prompt = build_system_prompt(
        persona=conversation.persona_id,
        legacy_name=primary_legacy.name,
        story_context=context_block  # NEW
    )

    # 6. Call Claude (existing streaming logic)
    async for token in bedrock.stream_response(system_prompt, history):
        yield token
```

### Context Formatting

```python
def format_context(chunks: list[ChunkResult]) -> str:
    """Format retrieved chunks for the system prompt."""
    if not chunks:
        return ""

    context_parts = ["## Relevant stories about this person:\n"]

    for i, chunk in enumerate(chunks, 1):
        context_parts.append(f"[Story excerpt {i}]\n{chunk.content}\n")

    context_parts.append(
        "\nUse these excerpts to inform your responses. "
        "Reference specific details when relevant. "
        "If the excerpts don't contain relevant information, "
        "say so rather than making things up."
    )

    return "\n".join(context_parts)
```

### System Prompt Structure

```
{persona_base_rules}

{persona_specific_prompt with legacy_name}

{story_context}  <-- NEW: Retrieved chunks inserted here

{conversation continues with message history}
```

---

## Delete Cascade & Audit

### Automatic Cascade

The `ON DELETE CASCADE` foreign key handles core deletion:

```sql
-- When story is deleted, chunks are deleted in same transaction
DELETE FROM stories WHERE id = $1;
-- PostgreSQL automatically: DELETE FROM story_chunks WHERE story_id = $1
```

### Story Service Integration

```python
async def delete_story(story_id: UUID, user_id: UUID) -> DeleteResult:
    """Delete story with vector cleanup and audit."""

    async with db.transaction():
        # 1. Verify permission (existing logic)
        story = await get_story(story_id)
        await check_delete_permission(story, user_id)

        # 2. Count chunks before delete (for audit)
        chunk_count = await count_chunks_for_story(story_id)

        # 3. Delete story (CASCADE handles chunks)
        await db.execute("DELETE FROM stories WHERE id = $1", story_id)

        # 4. Transaction commits - story + chunks gone atomically

    # 5. Audit log in background (non-blocking)
    background_tasks.add_task(
        log_deletion_audit,
        story_id=story_id,
        user_id=user_id,
        chunks_deleted=chunk_count,
        timestamp=utcnow()
    )

    return DeleteResult(success=True, chunks_deleted=chunk_count)
```

### What Gets Logged

- Story indexed (create) - story_id, chunk_count
- Story reindexed (update) - story_id, old_chunk_count, new_chunk_count
- Story deleted - story_id, chunk_count, deleted_by

---

## Implementation Plan

### Files to Modify/Create

```
services/core-api/
├── alembic/versions/
│   └── xxxx_add_pgvector_and_chunks.py    # NEW: Migration
├── app/
│   ├── adapters/
│   │   └── bedrock.py                      # MODIFY: Add embed_texts()
│   ├── models/
│   │   └── knowledge.py                    # NEW: StoryChunk, AuditLog models
│   ├── services/
│   │   ├── story.py                        # MODIFY: Hook ingestion
│   │   ├── chunking.py                     # NEW: Chunking logic
│   │   ├── retrieval.py                    # NEW: Vector search + permissions
│   │   └── ai.py                           # MODIFY: Add context retrieval
│   └── routes/
│       └── ai.py                           # MODIFY: (minimal, logic in service)
```

### Deployment Notes

- RDS must support pgvector (PostgreSQL 15+ on RDS does)
- Run migration before deploying new code
- Existing stories won't have vectors until indexed (need backfill script)

### Backfill Script

```python
async def backfill_existing_stories():
    """One-time script to index all existing stories."""
    stories = await get_all_stories_without_chunks()

    for story in stories:
        legacy_id = await get_primary_legacy_for_story(story.id)
        await index_story_chunks(
            story_id=story.id,
            content=story.content,
            legacy_id=legacy_id,
            visibility=story.visibility,
            author_id=story.author_id
        )
        logger.info(f"Indexed story {story.id}")
```

---

## What's NOT in Phase 1

| Feature | Reason Deferred |
|---------|-----------------|
| Agent framework abstraction | Single provider (Bedrock) works fine for now |
| Memorial-specific guardrails | Existing Bedrock Guardrails sufficient initially |
| Additional personas | Biographer + Friend cover initial use cases |
| Agent memory system | Last 20 messages sufficient for MVP |
| Observability/tracing | Basic logging exists, enhance later |
| Experimentation framework | No A/B testing needed yet |
| SQS queue for ingestion | BackgroundTasks sufficient at MVP scale |
| Tribe-based permissions | Tribes not fully designed yet |

---

## Phase 2 Preview

### Feature 3: Agent Framework Abstraction

**When to add:**
- If you want to compare Claude vs GPT quality/cost
- If Bedrock has reliability issues and you need fallback
- If you want to experiment with open-source models

**Key interfaces to define:**
- `EmbeddingProvider` - swap Titan for OpenAI/Cohere
- `LLMProvider` - swap Claude for other models
- `VectorStore` - swap pgvector for dedicated vector DB if needed

### Feature 5: Memorial-Appropriate Guardrails

**Phase 2 enhancements:**
- Topic-based blocking (intimate, financial, medical, conflict, harmful)
- Graceful redirects instead of hard blocks ("Let's focus on happier memories...")
- Per-persona guardrail profiles (Biographer vs Companion may differ)
- Input validation (catch prompt injection attempts)
- Output validation (ensure responses stay on-topic)

**Implementation approach:**
- Layer 1: Prompt engineering in persona system prompts
- Layer 2: guardrails-ai Python validators
- Layer 3: Bedrock Guardrails (already have this)

### Feature 6: Agent Personas (Expansion)

**Phase 2 additions:**
- **Storyteller** - Generate narratives from collected stories
- **Companion** - Open-ended grief support conversations
- **Archivist** - Help organize and categorize content

**Per-persona configuration:**
- Retrieval config (top_k, reranking)
- Temperature and response style
- Capability flags (can generate summaries, can suggest questions)
- Guardrail profile assignment

**Persona handoff:** "I hear this is bringing up difficult emotions. Would you like to talk with the Companion instead?"

### Feature 7: Agent Memory System

**Phase 2 tiers:**

| Tier | Scope | Storage | Purpose |
|------|-------|---------|---------|
| Working Memory | Current conversation | In-memory | Recent turns, topic tracking |
| Session Memory | Single session | PostgreSQL | Full conversation, extracted topics |
| Legacy Memory | Per-legacy, persistent | PostgreSQL | Key facts, important dates, relationships |

**New tables needed:**

```sql
agent_sessions (id, legacy_id, user_id, persona_id, summary, started_at)
agent_turns (id, session_id, role, content, token_count, created_at)
legacy_facts (id, legacy_id, fact_type, fact_value, confidence, source_session_id)
```

**Key capabilities:**
- Summarization when conversation exceeds token limit
- Fact extraction ("Born in 1942" → `birth_date: 1942`)
- Cross-session continuity ("Last time we talked about his military service...")

### Feature 8: Observability and Monitoring

**Phase 2 additions:**
- OpenTelemetry traces for RAG pipeline (embed latency, search latency, LLM latency)
- Quality metrics (retrieval relevance, guardrail trigger rate)
- Cost tracking (tokens used per conversation, embedding calls)
- Grafana dashboards for AI-specific metrics

**Key traces to instrument:**

```
conversation_request
├── permission_resolution
├── knowledge_retrieval
│   ├── embedding_generation
│   └── vector_search
├── memory_retrieval (Phase 2)
├── guardrail_check
└── llm_generation
```

### Feature 9: Experimentation Framework

**Phase 2 capabilities:**
- Variant assignment (percentage-based or user list)
- Compare prompt versions, models, retrieval configs
- Metrics collection tied to experiment variant
- Gradual rollout with rollback

**Example experiment:**

```yaml
experiment:
  id: retrieval_top_k_test
  variants:
    control: { top_k: 5 }
    treatment: { top_k: 10 }
  metrics: [response_quality, latency]
```

### Migration Path: Phase 1 → Phase 2

| Phase 1 Component | Phase 2 Evolution |
|-------------------|-------------------|
| Direct Bedrock calls | Wrap in `LLMProvider` interface |
| Titan embeddings | Wrap in `EmbeddingProvider` interface |
| pgvector | Wrap in `VectorStore` interface |
| BackgroundTasks | Add SQS for resilience if needed |
| Simple chat context | Add session/legacy memory tables |
| Bedrock Guardrails | Add guardrails-ai validators |

---

## Performance Targets

| Operation | Target |
|-----------|--------|
| Vector search | < 100ms p95 |
| Full agent response | < 3s p95 |
| Story vectorization | < 30s async |
| Deletion cascade | < 5s sync |

---

## Security Checklist

- [ ] Permission checks at every retrieval
- [ ] No user-controllable filter construction
- [ ] Audit logging for sensitive operations
- [ ] PII handling in logs and traces
- [ ] Rate limiting on AI endpoints

---

## References

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [pgvector on RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL-Postgres-extensions.html)
- [Amazon Titan Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)
- [HNSW Algorithm](https://www.pinecone.io/learn/series/faiss/hnsw/)
- [Chunking Strategies](https://www.pinecone.io/learn/chunking-strategies/)
