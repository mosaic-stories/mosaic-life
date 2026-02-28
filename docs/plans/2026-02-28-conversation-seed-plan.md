# Conversation Seed Opening Message Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Re-enable the AI persona opening message in the evolve workspace by adding an SSE seed endpoint and a frontend hook to stream it on mount.

**Architecture:** New `POST /api/ai/conversations/{id}/seed?story_id=X` SSE endpoint reuses the existing `generate_opening_message` logic but streams via SSE instead of blocking. Frontend `useConversationSeed` hook consumes the stream and pushes chunks into the Zustand AI chat store. `AIChatTool` calls the hook when it mounts with an empty conversation.

**Tech Stack:** FastAPI SSE streaming, SQLAlchemy, TanStack Query, Zustand, existing `SSEChunkEvent`/`SSEDoneEvent`/`SSEErrorEvent` schemas

**Design Doc:** [docs/plans/2026-02-28-conversation-seed-design.md](../../docs/plans/2026-02-28-conversation-seed-design.md)

---

## Phase 1: Backend Seed Endpoint ✅ COMPLETED

### Task 1: Add Seed SSE Endpoint

**Files:**
- Modify: `services/core-api/app/routes/ai.py` (add new endpoint after line ~131)
- Create: `services/core-api/tests/routes/test_conversation_seed.py`

**Step 1: Write the test**

Create `services/core-api/tests/routes/test_conversation_seed.py`:

```python
"""Tests for conversation seed SSE endpoint."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestConversationSeed:
    """Test POST /api/ai/conversations/{conversation_id}/seed."""

    @pytest.mark.asyncio
    async def test_seed_requires_auth(
        self,
        client: AsyncClient,
        test_story: Story,
    ) -> None:
        from uuid import uuid4

        response = await client.post(
            f"/api/ai/conversations/{uuid4()}/seed",
            params={"story_id": str(test_story.id)},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_seed_returns_204_when_messages_exist(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        # Create conversation
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test",
        )
        db_session.add(conv)
        await db_session.flush()

        # Link to legacy
        cl = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(cl)

        # Add an existing message
        msg = AIMessage(
            conversation_id=conv.id,
            role="assistant",
            content="Hello!",
        )
        db_session.add(msg)
        await db_session.commit()

        response = await client.post(
            f"/api/ai/conversations/{conv.id}/seed",
            params={"story_id": str(test_story.id)},
            headers=auth_headers,
        )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_seed_returns_404_for_unknown_conversation(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        from uuid import uuid4

        response = await client.post(
            f"/api/ai/conversations/{uuid4()}/seed",
            params={"story_id": str(test_story.id)},
            headers=auth_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_seed_returns_404_for_unknown_story(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        from uuid import uuid4

        # Create conversation
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test",
        )
        db_session.add(conv)
        await db_session.flush()

        cl = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(cl)
        await db_session.commit()

        response = await client.post(
            f"/api/ai/conversations/{conv.id}/seed",
            params={"story_id": str(uuid4())},
            headers=auth_headers,
        )
        assert response.status_code == 404
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/routes/test_conversation_seed.py -v`
Expected: FAIL — 404/405 because the route doesn't exist yet.

**Step 3: Add the seed endpoint**

In `services/core-api/app/routes/ai.py`, add the following endpoint after the `create_new_conversation` function (after line ~131). Add these imports at the top of the file alongside existing imports:

```python
from ..models.ai import AIMessage as AIMessageModel
from ..models.story import Story
```

Add the endpoint:

```python
@router.post(
    "/conversations/{conversation_id}/seed",
    summary="Seed conversation with AI opening message",
    description="Stream an AI-generated opening message into an empty conversation. "
    "Requires a story_id to provide context. Idempotent: returns 204 if "
    "the conversation already has messages.",
)
async def seed_conversation(
    conversation_id: UUID,
    request: Request,
    story_id: UUID = Query(..., description="Story to use as context for the opening message"),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Seed a conversation with a contextual AI opening message via SSE."""
    session = require_auth(request)

    with tracer.start_as_current_span("ai.conversation.seed") as span:
        span.set_attribute("user_id", str(session.user_id))
        span.set_attribute("conversation_id", str(conversation_id))
        span.set_attribute("story_id", str(story_id))

        # Get conversation and verify ownership
        conversation = await ai_service.get_conversation(
            db=db,
            conversation_id=conversation_id,
            user_id=session.user_id,
        )

        # Idempotency: if conversation already has messages, return 204
        msg_count_result = await db.execute(
            select(func.count(AIMessageModel.id)).where(
                AIMessageModel.conversation_id == conversation_id
            )
        )
        if (msg_count_result.scalar() or 0) > 0:
            return StreamingResponse(
                content=iter([]),
                status_code=204,
                media_type="text/plain",
            )

        # Load story
        story_result = await db.execute(
            select(Story).where(Story.id == story_id)
        )
        story = story_result.scalar_one_or_none()
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")

        # Load legacy name from conversation's linked legacy
        primary_legacy_id = ai_service.get_primary_legacy_id(conversation)
        legacy_result = await db.execute(
            select(Legacy).where(Legacy.id == primary_legacy_id)
        )
        legacy = legacy_result.scalar_one()

        # Get persona config
        persona = get_persona(conversation.persona_id)
        if not persona:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid persona: {conversation.persona_id}",
            )

        # Best-effort graph context
        story_context = ""
        registry = get_provider_registry()
        try:
            graph_context_service = registry.get_graph_context_service()
            if graph_context_service:
                assembled = await graph_context_service.assemble_context(
                    query=story.content[:500],
                    legacy_id=primary_legacy_id,
                    user_id=session.user_id,
                    persona_type=conversation.persona_id,
                    db=db,
                    token_budget=2000,
                    legacy_name=legacy.name,
                )
                story_context = assembled.formatted_context
                span.set_attribute("graph.context_length", len(story_context))
        except Exception:
            logger.warning(
                "ai.seed.graph_context_failed",
                extra={"conversation_id": str(conversation_id)},
            )

        # Build elicitation-mode system prompt
        from ..config.personas import build_system_prompt

        system_prompt = build_system_prompt(
            persona_id=conversation.persona_id,
            legacy_name=legacy.name,
            story_context=story_context,
            elicitation_mode=True,
            original_story_text=story.content,
            include_graph_suggestions=bool(story_context),
        )
        if not system_prompt:
            raise HTTPException(status_code=500, detail="Failed to build system prompt")

        # Seed instruction (not saved to conversation)
        seed_instruction = (
            "[System] The user has just started a story evolution session. "
            "This is the very first message in the conversation. Please:\n"
            "1. Briefly greet the user and introduce what you'll be doing together\n"
            "2. Share what stood out to you about the story — key moments, themes, "
            "or details that caught your attention\n"
            "3. Suggest 2-3 specific directions they could explore to deepen the story "
            "(use the story context provided, including any connected stories or people)\n"
            "4. Let them know they're free to take the conversation in any direction\n\n"
            "Keep it warm, concise, and inviting. Use 2-3 short paragraphs."
        )

        llm = registry.get_llm_provider()

        async def seed_stream() -> AsyncGenerator[str, None]:
            full_response = ""
            try:
                async for chunk in llm.stream_generate(
                    messages=[{"role": "user", "content": seed_instruction}],
                    system_prompt=system_prompt,
                    model_id=persona.model_id,
                    max_tokens=persona.max_tokens,
                ):
                    full_response += chunk
                    event = SSEChunkEvent(content=chunk)
                    yield f"data: {event.model_dump_json()}\n\n"

                # Save as assistant message (seed instruction NOT saved)
                message = await ai_service.save_message(
                    db=db,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                )

                done_event = SSEDoneEvent(
                    message_id=message.id,
                    token_count=None,
                )
                yield f"data: {done_event.model_dump_json()}\n\n"

            except Exception:
                logger.exception(
                    "ai.seed.stream_error",
                    extra={"conversation_id": str(conversation_id)},
                )
                error_event = SSEErrorEvent(
                    message="Failed to generate opening message.",
                    retryable=True,
                )
                yield f"data: {error_event.model_dump_json()}\n\n"

        return StreamingResponse(
            seed_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
```

Also add `func` to the sqlalchemy imports at the top of the file. Look for the existing `from sqlalchemy import select` import and add `func`:

```python
from sqlalchemy import func, select
```

**Step 4: Run test to verify it passes**

Run: `cd services/core-api && uv run pytest tests/routes/test_conversation_seed.py -v`
Expected: All tests PASS.

**Step 5: Run validation**

Run: `just validate-backend`
Expected: Passes (ruff + mypy).

**Step 6: Commit**

```bash
git add services/core-api/app/routes/ai.py services/core-api/tests/routes/test_conversation_seed.py
git commit -m "feat: add conversation seed SSE endpoint for opening messages"
```

---

## Phase 2: Frontend Integration ✅ COMPLETED

### Task 2: Create Seed API Client

**Files:**
- Create: `apps/web/src/features/evolve-workspace/api/seed.ts`

**Step 1: Create the seed API client**

Create `apps/web/src/features/evolve-workspace/api/seed.ts`:

```typescript
/**
 * Stream a seed opening message into an empty conversation.
 * Returns an AbortController for cancellation.
 */
export function streamSeed(
  conversationId: string,
  storyId: string,
  onChunk: (content: string) => void,
  onDone: (messageId: string) => void,
  onError: (message: string) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(
        `/api/ai/conversations/${conversationId}/seed?story_id=${encodeURIComponent(storyId)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        }
      );

      // 204 = conversation already has messages, nothing to do
      if (response.status === 204) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        onError(
          (errorData as { detail?: string }).detail ||
            `HTTP ${response.status}: ${response.statusText}`
        );
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (done) break;

        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              try {
                const event = JSON.parse(jsonStr);
                switch (event.type) {
                  case 'chunk':
                    onChunk(event.content);
                    break;
                  case 'done':
                    onDone(event.message_id);
                    break;
                  case 'error':
                    onError(event.message);
                    break;
                }
              } catch {
                console.error('Failed to parse seed SSE event');
              }
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Seed stream error:', error);
      onError('Connection error during opening message.');
    }
  })();

  return controller;
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/api/seed.ts
git commit -m "feat: add seed SSE API client"
```

---

### Task 3: Create useConversationSeed Hook

**Files:**
- Create: `apps/web/src/features/evolve-workspace/hooks/useConversationSeed.ts`

**Step 1: Create the hook**

Create `apps/web/src/features/evolve-workspace/hooks/useConversationSeed.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { streamSeed } from '../api/seed';
import { useAIChatStore, type ChatMessage } from '@/features/ai-chat/store/aiChatStore';

/**
 * Stream a seed opening message into the conversation when it's empty.
 * Fires once when conversationId is set and messages are empty.
 * Best-effort: errors are logged but don't break the workspace.
 */
export function useConversationSeed(
  conversationId: string | null,
  storyId: string
) {
  const hasFiredRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const {
    getActiveMessages,
    addMessage,
    appendToLastMessage,
    updateLastMessage,
    setStreaming,
  } = useAIChatStore();

  useEffect(() => {
    if (!conversationId || hasFiredRef.current) return;

    // Wait a tick for useAIChat to finish loading messages
    const timer = setTimeout(() => {
      const messages = getActiveMessages();
      if (messages.length > 0) {
        hasFiredRef.current = true;
        return;
      }

      hasFiredRef.current = true;

      // Add placeholder assistant message
      const placeholder: ChatMessage = {
        id: `seed-${Date.now()}`,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        token_count: null,
        created_at: new Date().toISOString(),
        blocked: false,
        status: 'streaming',
      };
      addMessage(conversationId, placeholder);
      setStreaming(true);

      abortRef.current = streamSeed(
        conversationId,
        storyId,
        (chunk) => {
          appendToLastMessage(conversationId, chunk);
        },
        (messageId) => {
          updateLastMessage(conversationId, {
            id: messageId,
            status: 'complete',
          });
          setStreaming(false);
        },
        (errorMsg) => {
          console.error('Seed error:', errorMsg);
          // Remove the empty placeholder on error
          const current = getActiveMessages();
          if (
            current.length > 0 &&
            current[current.length - 1].id.startsWith('seed-')
          ) {
            // Remove placeholder by setting messages without it
            const store = useAIChatStore.getState();
            const convState = store.conversations.get(conversationId);
            if (convState) {
              const filtered = convState.messages.filter(
                (m) => !m.id.startsWith('seed-')
              );
              store.setMessages(conversationId, filtered);
            }
          }
          setStreaming(false);
        }
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [
    conversationId,
    storyId,
    getActiveMessages,
    addMessage,
    appendToLastMessage,
    updateLastMessage,
    setStreaming,
  ]);
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/hooks/useConversationSeed.ts
git commit -m "feat: add useConversationSeed hook for streaming opening messages"
```

---

### Task 4: Wire Up AIChatTool to Use Seed Hook

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx`

**Step 1: Modify AIChatTool to use the seed hook**

In `apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx`:

1. Add the import at the top (after existing imports):
```typescript
import { useConversationSeed } from '../hooks/useConversationSeed';
```

2. Update the component signature to destructure `storyId` (line 15):
```typescript
export function AIChatTool({ legacyId, storyId, conversationId }: AIChatToolProps) {
```

3. Add the seed hook call after the `useAIChat` call (after line 30):
```typescript
  // Stream opening message when conversation is empty
  useConversationSeed(conversationId, storyId);
```

4. Update the empty state message (lines 55-58) to show a loading hint instead of the static placeholder. Replace the existing empty state block:
```typescript
        {messages.length === 0 && !isStreaming && (
          <p className="text-sm text-neutral-400 text-center py-8">
            Preparing your AI companion...
          </p>
        )}
```

**Step 2: Run frontend build to verify no errors**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx
git commit -m "feat: wire AIChatTool to seed conversation with opening message"
```

---

## Phase 3: Validation ✅ COMPLETED

### Task 5: Run Full Validation

**Step 1: Run backend validation**

Run: `just validate-backend`
Expected: Passes.

**Step 2: Run backend tests**

Run: `cd services/core-api && uv run pytest tests/routes/test_conversation_seed.py tests/routes/test_ai_routes.py -v`
Expected: All tests PASS.

**Step 3: Run frontend type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

**Step 4: Run frontend tests**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/ --reporter=verbose`
Expected: Existing tests PASS.

**Step 5: Commit any fixups if needed**
