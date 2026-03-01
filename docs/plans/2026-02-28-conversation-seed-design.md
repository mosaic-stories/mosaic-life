# Conversation Seed Opening Message Design

**Date:** 2026-02-28
**Status:** Approved
**Goal:** Re-enable the AI persona opening message in the evolve workspace, which was lost when the new `EvolveWorkspace` bypassed the old `StoryEvolutionSession` creation flow.

## Problem

The old evolution flow created a `StoryEvolutionSession` via `POST /api/stories/{id}/evolution`, which called `generate_opening_message()` to seed the chat with a contextual AI introduction. The new `EvolveWorkspace` creates a bare conversation via `POST /api/ai/conversations/new`, skipping the opening message entirely.

Users valued the initial AI message — it queried RAG and graph context, surfaced relevant connections, and suggested directions. It made the AI feel like it had earned the right to be interacted with.

## Solution

Add a new SSE endpoint that streams an opening message into an existing conversation, plus a frontend hook to consume it.

### Backend: `POST /api/ai/conversations/{conversation_id}/seed`

**Query parameter:** `story_id: UUID` (required)

**Behavior:**

1. Verify auth + conversation ownership
2. **Idempotency check:** If conversation already has messages, return 204 (no-op)
3. Load story content + primary legacy name from the conversation's linked legacy
4. Query graph context service for related stories/entities (best-effort)
5. Build elicitation-mode system prompt with story text + graph context
6. Stream LLM response using `SSEChunkEvent` / `SSEDoneEvent` / `SSEErrorEvent`
7. Save only the assistant response (the hidden seed instruction is NOT persisted)

**SSE events:** Reuses the existing event types from `app.schemas.ai` — no new event types needed.

**Error handling:** Best-effort. If seeding fails, the user sees the empty chat placeholder and can type manually.

### Frontend: `useConversationSeed` hook

**Location:** `apps/web/src/features/evolve-workspace/hooks/useConversationSeed.ts`

**Inputs:** `conversationId: string | null`, `storyId: string`

**Behavior:**

1. When `conversationId` is set and messages are empty, call `POST /api/ai/conversations/{id}/seed?story_id=X`
2. Parse SSE stream (same format as existing chat streaming)
3. Push chunks into the Zustand AI chat store as a streaming assistant message
4. On `done` event, mark message as complete
5. On error, log and fail silently (user can still type manually)

**Integration:** Called from `AIChatTool` after `useAIChat` initializes.

### Data Flow

```
EvolveWorkspace mounts
  → createNewConversation() → POST /api/ai/conversations/new
  → sets conversationId
  → AIChatTool mounts with conversationId + storyId
    → useAIChat loads messages (empty)
    → useConversationSeed fires POST /api/ai/conversations/{id}/seed?story_id=X
    → SSE stream: chunk → chunk → chunk → done
    → Zustand store updates as chunks arrive
    → User sees AI "typing" its introduction
```

### Key Decisions

- **Separate endpoint (not modifying `/conversations/new`):** Keeps conversation creation fast and pure. The seed is a separate concern that streams.
- **Query parameter for story_id:** The conversation itself doesn't store a story reference — story_id is context for generating the opening message only.
- **Idempotent:** Safe to call multiple times. If messages exist, returns 204.
- **Reuses existing SSE format:** Frontend SSE parsing can share the same logic as `streamMessage`.
- **Best-effort:** Failure to seed doesn't break the workspace.

### Files Touched

**Backend (new):**
- `services/core-api/app/routes/ai.py` — new `/conversations/{id}/seed` endpoint
- `services/core-api/tests/routes/test_conversation_seed.py` — endpoint tests

**Backend (modified):**
- `services/core-api/app/services/story_evolution.py` — extract reusable opening message logic

**Frontend (new):**
- `apps/web/src/features/evolve-workspace/hooks/useConversationSeed.ts` — SSE hook
- `apps/web/src/features/evolve-workspace/api/seed.ts` — API client

**Frontend (modified):**
- `apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx` — wire up seed hook
