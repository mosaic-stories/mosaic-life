# Feature 7: Agent Memory System - Design Document

**Date:** 2026-02-14
**Status:** Approved
**Depends on:** Feature 3 (Agent Framework Abstraction) - COMPLETE

---

## Overview

Add two memory capabilities to the existing agent infrastructure:

1. **Conversation Memory** - Rolling summarization of long conversations, stored as vector chunks for RAG retrieval. Ensures nothing is "forgotten" when conversations exceed the 20-message context window.
2. **Legacy Facts** - Per-user-per-legacy factual observations extracted automatically from conversations. Injected into the agent's system prompt so the agent always has baseline knowledge about the memorialized person.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Summary storage | Separate `conversation_chunks` table with pgvector | Different access patterns from story chunks; always user-scoped |
| Summary timing | Rolling window (summarize as messages fall off context) | Directly solves the 20-message limit; right-sized summaries |
| Fact scope | Per-user-per-legacy | Facts are relational (one user's "hero" is another's "disciplinarian") |
| Fact extraction | Automatic with post-hoc review | Keeps conversation flow smooth; users manage via review UI |
| Fact visibility | Private by default, shareable to all members | Simple toggle; granular permissions can be added later |
| Fact injection | System prompt | Facts are short and few; guarantees agent always knows established facts |
| Extraction method | Single LLM call for both summary + facts | Avoids two separate LLM calls for the same content |

---

## Data Models

### New Table: `conversation_chunks`

Stores vectorized conversation summaries for RAG retrieval. Scoped to the user who had the conversation.

```sql
CREATE TABLE conversation_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_id UUID NOT NULL REFERENCES legacies(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    message_range_start INTEGER NOT NULL,
    message_range_end INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For retrieval filtering: "my conversation context for this legacy"
CREATE INDEX ix_conversation_chunks_user_legacy ON conversation_chunks(user_id, legacy_id);

-- For idempotency: prevent re-summarizing same range
CREATE UNIQUE INDEX ix_conversation_chunks_range ON conversation_chunks(conversation_id, message_range_start, message_range_end);

-- HNSW vector index for similarity search
CREATE INDEX ix_conversation_chunks_embedding ON conversation_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

### New Table: `legacy_facts`

Stores per-user-per-legacy facts with visibility control.

```sql
CREATE TABLE legacy_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id UUID NOT NULL REFERENCES legacies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    visibility VARCHAR(10) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
    source_conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For retrieval: "my facts + shared facts for this legacy"
CREATE INDEX ix_legacy_facts_legacy_user ON legacy_facts(legacy_id, user_id);
CREATE INDEX ix_legacy_facts_legacy_visibility ON legacy_facts(legacy_id, visibility);
```

### No Changes to Existing Tables

`ai_conversations` and `ai_messages` stay as-is. The `message_range_start/end` on `conversation_chunks` tracks which messages were summarized, preventing re-summarization.

---

## Service Layer

### New Service: `memory_service`

Three responsibilities: summarization triggering, fact extraction, and fact management.

#### Summarization Flow

```python
SUMMARIZATION_THRESHOLD = 30  # Unsummarized messages before triggering
BATCH_SIZE = 20               # Messages per summarization batch

async def maybe_summarize(conversation_id, user_id, legacy_id, db):
    """Called as background task after each message save."""

    total_messages = count_messages(conversation_id)
    last_summarized_end = get_last_summarized_index(conversation_id)  # 0 if never summarized
    unsummarized_count = total_messages - last_summarized_end

    if unsummarized_count <= SUMMARIZATION_THRESHOLD:
        return  # Not enough new messages yet

    # Grab the oldest unsummarized batch (messages beyond context window)
    messages_to_summarize = get_messages_in_range(
        conversation_id, last_summarized_end, last_summarized_end + BATCH_SIZE
    )

    # Single LLM call: summarize + extract facts
    result = await llm_provider.generate(
        system_prompt=SUMMARIZE_AND_EXTRACT_PROMPT,
        messages=messages_to_summarize
    )

    # Parse structured JSON response
    parsed = parse_summary_response(result)  # Graceful failure if malformed

    # Store summary as vector chunk
    embedding = await embedding_provider.embed_texts([parsed.summary])
    save_conversation_chunk(
        conversation_id, user_id, legacy_id,
        parsed.summary, embedding,
        range_start=last_summarized_end,
        range_end=last_summarized_end + BATCH_SIZE
    )

    # Store extracted facts (deduplication by content similarity)
    for fact in parsed.facts:
        save_legacy_fact(legacy_id, user_id, fact, conversation_id)
```

#### Fact Retrieval for System Prompt

```python
async def get_facts_for_context(legacy_id, user_id, db) -> list[LegacyFact]:
    """Get this user's private facts + all shared facts from other members."""
    return query(
        WHERE legacy_id = :legacy_id
        AND (user_id = :user_id OR visibility = 'shared')
        ORDER BY extracted_at
    )
```

#### Fact Management (Review UI)

```python
async def list_user_facts(legacy_id, user_id, db) -> list[LegacyFact]
async def delete_fact(fact_id, user_id, db) -> None          # ownership check
async def update_fact_visibility(fact_id, user_id, visibility, db) -> None  # ownership check
```

---

## Integration Points

### 1. System Prompt Building

`build_system_prompt()` in `app/config/personas.py` gains a `facts` parameter:

```python
def build_system_prompt(persona_id, legacy_name, story_context, facts=None):
    # Existing prompt + story context...

    if facts:
        prompt += f"\n\nKnown facts about {legacy_name} from conversations:\n"
        for fact in facts:
            source = "(shared)" if fact.visibility == "shared" else "(personal)"
            prompt += f"- [{fact.category}] {fact.content} {source}\n"
```

### 2. Turn Preparation

`DefaultStorytellingAgent.prepare_turn` in `app/adapters/storytelling.py` gains two additions:

```python
async def prepare_turn(...):
    # Existing: get last 20 messages
    context_messages = await memory.get_context_messages(db, conversation_id)

    # Existing: RAG over story_chunks
    story_context = await vector_store.retrieve_context(db, query, legacy_id, ...)

    # NEW: RAG over conversation_chunks (prior conversation memory)
    conversation_context = await conversation_memory.retrieve_context(
        db, query, user_id, legacy_id, top_k=3
    )

    # NEW: Get facts for system prompt
    facts = await memory_service.get_facts_for_context(legacy_id, user_id, db)

    # Build system prompt with all context
    system_prompt = build_system_prompt(
        persona_id, legacy_name,
        story_context + conversation_context,  # Combined RAG results
        facts=facts
    )
```

### 3. Post-Message Summarization Trigger

In `app/routes/ai.py`, after saving the assistant message:

```python
# Existing: save assistant message
message = await storytelling_agent.save_assistant_message(...)

# NEW: trigger summarization check as background task
background_tasks.add_task(
    memory_service.maybe_summarize,
    conversation_id, user_id, legacy_id, db
)
```

### 4. New API Endpoints

Added to existing `app/routes/ai.py`:

```
GET    /api/ai/legacies/{legacy_id}/facts          # List my facts + shared facts
PATCH  /api/ai/facts/{fact_id}/visibility           # Toggle private/shared
DELETE /api/ai/facts/{fact_id}                       # Delete a fact
```

---

## LLM Prompt: Summarize and Extract

A single structured prompt handles both summarization and fact extraction:

```
You are analyzing a conversation between a user and a memorial agent about {legacy_name}.

Given the following conversation messages, produce:
1. A concise summary (2-4 sentences) capturing the key topics discussed and any emotional tone.
2. A list of factual observations about {legacy_name} mentioned by the user.

For each fact, provide:
- category: one of [personality, hobby, relationship, milestone, occupation, preference, habit, other]
- content: a short factual statement (one sentence)

Only extract facts the user explicitly stated or clearly implied. Do not infer or speculate.

Respond in JSON:
{
  "summary": "...",
  "facts": [{"category": "...", "content": "..."}]
}
```

If the LLM returns malformed JSON, the summarization fails gracefully - messages stay unsummarized and get picked up on the next pass.

---

## Testing Strategy

### Unit Tests

- **Summarization trigger logic**: Verify `maybe_summarize` only fires when unsummarized count exceeds threshold. Verify correct message range calculation.
- **Fact CRUD**: Create, list, delete, visibility toggle. Ownership checks (User A cannot delete User B's facts).
- **Fact retrieval filtering**: User sees own private facts + all shared facts. Does not see other users' private facts.
- **JSON parsing**: Valid response, malformed response, empty facts array, missing fields.

### Integration Tests

- **Full turn flow**: Send messages, trigger summarization, verify conversation chunks land in database with correct embeddings and message ranges.
- **RAG retrieval**: Verify conversation chunks are returned by similarity search scoped to correct user + legacy.
- **System prompt injection**: Verify facts appear in the system prompt sent to the LLM.

### Fact Extraction Tests

- Feed known conversation snippets through the extract prompt, assert expected facts are captured.
- Edge cases: no facts mentioned, duplicate facts across sessions, contradicting facts from same user.

### Visibility Tests

- User A shares a fact → User B sees it in their context.
- User A's private facts stay invisible to User B.
- User A unshares a fact → User B no longer sees it.

### Idempotency and Failure

- Re-running summarization on already-summarized ranges produces no duplicates (enforced by unique index on `conversation_id, message_range_start, message_range_end`).
- LLM returns bad JSON → no chunks or facts stored, messages remain for retry.
- Embedding service down → summarization fails, retried on next trigger.
- Database write fails → no partial state (transaction rollback).

---

## Implementation Sequence

1. **Alembic migrations** - Create `conversation_chunks` and `legacy_facts` tables
2. **SQLAlchemy models** - `ConversationChunk` and `LegacyFact`
3. **Pydantic schemas** - Request/response models for facts API
4. **Memory service** - Summarization, fact extraction, fact management
5. **Protocol/adapter updates** - Extend `AgentMemory` or add conversation memory retrieval
6. **Integration wiring** - Update `prepare_turn`, `build_system_prompt`, route hooks
7. **API endpoints** - Fact management routes
8. **Tests** - Unit, integration, visibility, edge cases
9. **Validation** - `just validate-backend` passing
