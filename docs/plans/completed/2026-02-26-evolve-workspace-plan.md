# Evolve Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 5-stage story evolution pipeline with a unified workspace featuring a resizable TipTap editor, vertical tool strip, swappable tool panels, and AI rewrite with diff view.

**Architecture:** Resizable three-zone layout (editor + tool strip + tool panel) built on `react-resizable-panels`. Backend adds two endpoints: a rewrite SSE stream and a graph context REST endpoint. Zustand manages workspace UI state; TanStack Query handles server state. Mobile collapses to full-screen editor with Vaul bottom sheets.

**Tech Stack:** React 18, TypeScript, TipTap, react-resizable-panels, Zustand, TanStack Query, Vaul (drawers), diff-match-patch, FastAPI, SSE streaming

**Design Doc:** [docs/plans/2026-02-26-evolve-workspace-design.md](2026-02-26-evolve-workspace-design.md)

---

## Phase 1: Backend Endpoints ✅ COMPLETE

### Task 1: Rewrite SSE Endpoint

**Files:**
- Create: `services/core-api/app/routes/rewrite.py`
- Create: `services/core-api/app/schemas/rewrite.py`
- Create: `services/core-api/tests/routes/test_rewrite.py`
- Modify: `services/core-api/app/main.py:32-34,123-124`

**Step 1: Write the test**

Create `services/core-api/tests/routes/test_rewrite.py`:

```python
"""Tests for the rewrite SSE endpoint."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def auth_user_id() -> str:
    return str(uuid4())


@pytest.fixture
def mock_auth(auth_user_id: str):
    """Patch require_auth to return a mock session."""
    session = MagicMock()
    session.user_id = auth_user_id
    with patch("app.routes.rewrite.require_auth", return_value=session):
        yield session


class TestRewriteEndpoint:
    """Test POST /api/stories/{story_id}/rewrite."""

    @pytest.mark.asyncio
    async def test_returns_401_without_auth(self) -> None:
        story_id = uuid4()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/stories/{story_id}/rewrite",
                json={"content": "test"},
            )
            assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_rewrite_schema_validates(self) -> None:
        from app.schemas.rewrite import RewriteRequest

        req = RewriteRequest(content="Hello world")
        assert req.content == "Hello world"
        assert req.persona_id == "biographer"
        assert req.writing_style is None
        assert req.pinned_context_ids == []

    @pytest.mark.asyncio
    async def test_rewrite_schema_with_all_fields(self) -> None:
        from app.schemas.rewrite import RewriteRequest

        req = RewriteRequest(
            content="Hello",
            conversation_id="conv-123",
            pinned_context_ids=["ent-1", "ent-2"],
            writing_style="vivid",
            length_preference="longer",
            persona_id="colleague",
        )
        assert req.conversation_id == "conv-123"
        assert len(req.pinned_context_ids) == 2
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/routes/test_rewrite.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.rewrite'`

**Step 3: Create the schema**

Create `services/core-api/app/schemas/rewrite.py`:

```python
"""Schemas for the story rewrite endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class RewriteRequest(BaseModel):
    """Request body for POST /api/stories/{story_id}/rewrite."""

    content: str
    conversation_id: str | None = None
    pinned_context_ids: list[str] = []
    writing_style: str | None = None
    length_preference: str | None = None
    persona_id: str = "biographer"
```

**Step 4: Create the route**

Create `services/core-api/app/routes/rewrite.py`:

```python
"""API route for story rewrite (SSE streaming)."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import require_auth
from app.database import get_db
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.story_legacy import StoryLegacy
from app.models.story_version import StoryVersion
from app.providers.registry import get_provider_registry
from app.schemas.ai import SSEErrorEvent
from app.schemas.rewrite import RewriteRequest
from app.schemas.story_evolution import EvolutionSSEChunkEvent, EvolutionSSEDoneEvent
from app.services.story_writer import StoryWriterAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}", tags=["rewrite"])


@router.post("/rewrite")
async def rewrite_story(
    story_id: UUID,
    data: RewriteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Rewrite a story with AI assistance. Streams result via SSE.

    Gathers context from the conversation, graph database, and pinned items,
    then streams a full rewrite of the story content.
    """
    session_data = require_auth(request)
    user_id = session_data.user_id

    # Load story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one_or_none()
    if not story:
        return StreamingResponse(
            _error_stream("Story not found", retryable=False),
            media_type="text/event-stream",
            status_code=404,
        )

    # Load legacy name
    legacy_name = "the person"
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary = legacy_result.scalar_one_or_none()
    if primary:
        leg = await db.execute(select(Legacy).where(Legacy.id == primary.legacy_id))
        legacy = leg.scalar_one_or_none()
        if legacy:
            legacy_name = legacy.name

    writer = StoryWriterAgent()
    registry = get_provider_registry()
    llm = registry.get_llm_provider()

    from app.config.personas import get_persona

    persona = get_persona(data.persona_id)
    model_id = (
        persona.model_id if persona else "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    )

    async def rewrite_stream() -> AsyncGenerator[str, None]:
        try:
            # Build context from graph if available
            additional_context = ""
            try:
                graph_context_service = _get_graph_context_service(registry, db)
                if graph_context_service and primary:
                    from app.services.graph_context import GraphContextService

                    assembled = await graph_context_service.assemble_context(
                        query=data.content[:500],
                        legacy_id=primary.legacy_id,
                        user_id=user_id,
                        persona_type=data.persona_id,
                        db=db,
                        token_budget=2000,
                        legacy_name=legacy_name,
                    )
                    if assembled.formatted_context:
                        additional_context = (
                            "\n\n## Related Context\n" + assembled.formatted_context
                        )
            except Exception as exc:
                logger.warning(
                    "rewrite.graph_context_failed",
                    extra={"error": str(exc)},
                )

            # Load conversation summary if conversation_id provided
            conversation_summary = ""
            if data.conversation_id:
                conversation_summary = await _get_conversation_summary(
                    db, data.conversation_id
                )

            system_prompt = writer.build_system_prompt(
                writing_style=data.writing_style or "vivid",
                length_preference=data.length_preference or "similar",
                legacy_name=legacy_name,
                relationship_context="",
                is_revision=False,
            )

            user_message = writer.build_user_message(
                original_story=data.content,
                summary_text=conversation_summary + additional_context,
            )

            full_text = ""
            async for chunk in writer.stream_draft(
                llm_provider=llm,
                system_prompt=system_prompt,
                user_message=user_message,
                model_id=model_id,
            ):
                full_text += chunk
                event = EvolutionSSEChunkEvent(text=chunk)
                yield f"data: {event.model_dump_json()}\n\n"

            # Save as draft version
            version = await _save_rewrite_version(
                db=db,
                story=story,
                content=full_text,
                user_id=user_id,
                conversation_id=data.conversation_id,
            )

            done_event = EvolutionSSEDoneEvent(
                version_id=version.id,
                version_number=version.version_number,
            )
            yield f"data: {done_event.model_dump_json()}\n\n"

        except Exception:
            logger.exception("rewrite.stream.error")
            await db.rollback()
            error_event = SSEErrorEvent(
                message="Rewrite failed. Please try again.",
                retryable=True,
            )
            yield f"data: {error_event.model_dump_json()}\n\n"

    return StreamingResponse(
        rewrite_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _get_graph_context_service(
    registry: Any, db: AsyncSession
) -> Any:
    """Get GraphContextService if graph augmentation is enabled."""
    from app.config import get_settings

    settings = get_settings()
    if not settings.graph_augmentation_enabled:
        return None

    graph_adapter = registry.get_graph_adapter()
    if not graph_adapter:
        return None

    from app.services.graph_context import GraphContextService

    return GraphContextService(
        graph_adapter=graph_adapter,
        retrieval_service=None,
        intent_analyzer=None,
        graph_traversal_service=None,
        graph_access_filter=None,
        circuit_breaker=None,
    )


async def _get_conversation_summary(
    db: AsyncSession, conversation_id: str
) -> str:
    """Load recent messages from a conversation as summary context."""
    from app.models.ai import AIConversation, AIMessage

    conv_result = await db.execute(
        select(AIConversation).where(AIConversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        return ""

    msg_result = await db.execute(
        select(AIMessage)
        .where(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at.desc())
        .limit(20)
    )
    messages = list(reversed(msg_result.scalars().all()))

    if not messages:
        return ""

    parts: list[str] = []
    for msg in messages:
        role = "User" if msg.role == "user" else "AI"
        parts.append(f"{role}: {msg.content}")

    return "\n".join(parts)


async def _save_rewrite_version(
    db: AsyncSession,
    story: Story,
    content: str,
    user_id: UUID,
    conversation_id: str | None,
) -> StoryVersion:
    """Save the rewritten content as a draft version."""
    # Get next version number
    max_result = await db.execute(
        select(StoryVersion.version_number)
        .where(StoryVersion.story_id == story.id)
        .order_by(StoryVersion.version_number.desc())
        .limit(1)
    )
    max_version = max_result.scalar_one_or_none() or 0

    draft = StoryVersion(
        story_id=story.id,
        version_number=max_version + 1,
        title=story.title,
        content=content,
        status="draft",
        source="ai_rewrite",
        created_by=user_id,
    )
    if conversation_id:
        draft.source_conversation_id = conversation_id  # type: ignore[assignment]

    db.add(draft)
    await db.commit()
    await db.refresh(draft)

    return draft


async def _error_stream(
    message: str, retryable: bool = True
) -> AsyncGenerator[str, None]:
    error_event = SSEErrorEvent(message=message, retryable=retryable)
    yield f"data: {error_event.model_dump_json()}\n\n"
```

**Step 5: Register the route**

In `services/core-api/app/main.py`, add after line 33:

```python
from .routes.rewrite import router as rewrite_router
```

And after line 124:

```python
app.include_router(rewrite_router)
```

**Step 6: Run tests**

Run: `cd services/core-api && uv run pytest tests/routes/test_rewrite.py -v`
Expected: Schema tests PASS. Auth test PASS (401).

**Step 7: Run validation**

Run: `just validate-backend`
Expected: Passes (ruff + mypy).

**Step 8: Commit**

```bash
git add services/core-api/app/schemas/rewrite.py services/core-api/app/routes/rewrite.py services/core-api/tests/routes/test_rewrite.py services/core-api/app/main.py
git commit -m "feat: add story rewrite SSE endpoint"
```

---

### Task 2: Graph Context REST Endpoint

**Files:**
- Create: `services/core-api/app/routes/graph_context.py`
- Create: `services/core-api/app/schemas/graph_context.py`
- Create: `services/core-api/tests/routes/test_graph_context_route.py`
- Modify: `services/core-api/app/main.py:34-35,125-126`

**Step 1: Write the test**

Create `services/core-api/tests/routes/test_graph_context_route.py`:

```python
"""Tests for graph context REST endpoint."""

from __future__ import annotations

import pytest

from app.schemas.graph_context import (
    EntityGroup,
    GraphContextResponse,
    RelatedStory,
)


class TestGraphContextSchema:
    """Test the response schema."""

    def test_related_story_schema(self) -> None:
        story = RelatedStory(
            id="abc-123",
            title="A Summer Story",
            snippet="The summer of 1992...",
            relevance=0.85,
        )
        assert story.relevance == 0.85

    def test_entity_group_schema(self) -> None:
        group = EntityGroup(
            people=[{"name": "Uncle Jim", "context": "brother"}],
            places=[{"name": "Chicago", "type": "city"}],
            events=[],
            objects=[],
        )
        assert len(group.people) == 1

    def test_full_response_schema(self) -> None:
        resp = GraphContextResponse(
            related_stories=[
                RelatedStory(
                    id="s1", title="First", snippet="...", relevance=0.9
                )
            ],
            entities=EntityGroup(
                people=[],
                places=[],
                events=[],
                objects=[],
            ),
        )
        assert len(resp.related_stories) == 1
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/routes/test_graph_context_route.py -v`
Expected: FAIL — `ModuleNotFoundError`.

**Step 3: Create the schema**

Create `services/core-api/app/schemas/graph_context.py`:

```python
"""Schemas for the graph context REST endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class RelatedStory(BaseModel):
    """A story related to the current one via graph connections."""

    id: str
    title: str
    snippet: str
    relevance: float


class EntityGroup(BaseModel):
    """Entities grouped by type."""

    people: list[dict[str, str]] = []
    places: list[dict[str, str]] = []
    events: list[dict[str, str]] = []
    objects: list[dict[str, str]] = []


class GraphContextResponse(BaseModel):
    """Response for GET /api/stories/{story_id}/graph-context."""

    related_stories: list[RelatedStory] = []
    entities: EntityGroup = EntityGroup()
```

**Step 4: Create the route**

Create `services/core-api/app/routes/graph_context.py`:

```python
"""API route for graph context (related stories and entities)."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import require_auth
from app.database import get_db
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.story_legacy import StoryLegacy
from app.providers.registry import get_provider_registry
from app.schemas.graph_context import (
    EntityGroup,
    GraphContextResponse,
    RelatedStory,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}", tags=["graph-context"])


@router.get("/graph-context", response_model=GraphContextResponse)
async def get_graph_context(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> GraphContextResponse:
    """Get graph-connected stories and entities for a story.

    Returns related stories, people, places, events, and objects
    discovered through the graph database.
    """
    session_data = require_auth(request)
    user_id = session_data.user_id

    # Load story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one_or_none()
    if not story:
        return GraphContextResponse()

    # Load primary legacy
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary = legacy_result.scalar_one_or_none()
    if not primary:
        return GraphContextResponse()

    legacy_name = "the person"
    leg = await db.execute(select(Legacy).where(Legacy.id == primary.legacy_id))
    legacy = leg.scalar_one_or_none()
    if legacy:
        legacy_name = legacy.name

    # Try to get graph context
    from app.config import get_settings

    settings = get_settings()
    if not settings.graph_augmentation_enabled:
        return GraphContextResponse()

    registry = get_provider_registry()
    graph_adapter = registry.get_graph_adapter()
    if not graph_adapter:
        return GraphContextResponse()

    try:
        from app.services.graph_context import GraphContextService

        service = GraphContextService(
            graph_adapter=graph_adapter,
            retrieval_service=None,
            intent_analyzer=None,
            graph_traversal_service=None,
            graph_access_filter=None,
            circuit_breaker=None,
        )

        assembled = await service.assemble_context(
            query=story.content[:500],
            legacy_id=primary.legacy_id,
            user_id=user_id,
            persona_type="biographer",
            db=db,
            token_budget=3000,
            legacy_name=legacy_name,
        )

        # Convert graph results to response schema
        related_stories: list[RelatedStory] = []
        for gr in assembled.graph_results:
            related_stories.append(
                RelatedStory(
                    id=str(gr.story_id),
                    title=gr.source_type,
                    snippet="",
                    relevance=gr.relevance_score,
                )
            )

        # Extract entities from metadata if available
        entities = EntityGroup()
        if assembled.metadata and hasattr(assembled.metadata, "intent"):
            intent = assembled.metadata.intent
            if intent and hasattr(intent, "entities"):
                ents = intent.entities
                entities = EntityGroup(
                    people=ents.get("people", []),
                    places=ents.get("places", []),
                    events=ents.get("events", []),
                    objects=ents.get("objects", []),
                )

        return GraphContextResponse(
            related_stories=related_stories,
            entities=entities,
        )

    except Exception as exc:
        logger.warning(
            "graph_context.route.failed",
            extra={"story_id": str(story_id), "error": str(exc)},
        )
        return GraphContextResponse()
```

**Step 5: Register the route**

In `services/core-api/app/main.py`, add the import:

```python
from .routes.graph_context import router as graph_context_router
```

And the registration:

```python
app.include_router(graph_context_router)
```

**Step 6: Run tests**

Run: `cd services/core-api && uv run pytest tests/routes/test_graph_context_route.py -v`
Expected: All tests PASS.

**Step 7: Run validation**

Run: `just validate-backend`
Expected: Passes.

**Step 8: Commit**

```bash
git add services/core-api/app/schemas/graph_context.py services/core-api/app/routes/graph_context.py services/core-api/tests/routes/test_graph_context_route.py services/core-api/app/main.py
git commit -m "feat: add graph context REST endpoint"
```

---

## Phase 2: Frontend Foundation ✅ COMPLETE

### Task 3: Install diff-match-patch and Create Diff Engine

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/features/evolve-workspace/utils/diffEngine.ts`
- Create: `apps/web/src/features/evolve-workspace/utils/diffEngine.test.ts`

**Step 1: Install the dependency**

Run: `cd apps/web && npm install diff-match-patch && npm install -D @types/diff-match-patch`

**Step 2: Write the test**

Create `apps/web/src/features/evolve-workspace/utils/diffEngine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeDiff, type DiffSegment } from './diffEngine';

describe('diffEngine', () => {
  it('returns single equal segment for identical text', () => {
    const result = computeDiff('hello world', 'hello world');
    expect(result).toEqual([{ type: 'equal', text: 'hello world' }]);
  });

  it('detects inserted text', () => {
    const result = computeDiff('hello world', 'hello beautiful world');
    const inserted = result.filter((s) => s.type === 'insert');
    expect(inserted.length).toBeGreaterThan(0);
    expect(inserted.some((s) => s.text.includes('beautiful'))).toBe(true);
  });

  it('detects deleted text', () => {
    const result = computeDiff('hello beautiful world', 'hello world');
    const deleted = result.filter((s) => s.type === 'delete');
    expect(deleted.length).toBeGreaterThan(0);
    expect(deleted.some((s) => s.text.includes('beautiful'))).toBe(true);
  });

  it('handles empty original', () => {
    const result = computeDiff('', 'new content');
    expect(result).toEqual([{ type: 'insert', text: 'new content' }]);
  });

  it('handles empty rewrite', () => {
    const result = computeDiff('old content', '');
    expect(result).toEqual([{ type: 'delete', text: 'old content' }]);
  });

  it('handles multi-line diffs', () => {
    const original = 'line one\nline two\nline three';
    const rewrite = 'line one\nline TWO\nline three';
    const result = computeDiff(original, rewrite);
    expect(result.length).toBeGreaterThan(1);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/utils/diffEngine.test.ts`
Expected: FAIL — module not found.

**Step 4: Implement the diff engine**

Create `apps/web/src/features/evolve-workspace/utils/diffEngine.ts`:

```typescript
import DiffMatchPatch from 'diff-match-patch';

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

const dmp = new DiffMatchPatch();

/**
 * Compute a semantic diff between original and rewritten text.
 * Returns an array of segments typed as equal, insert, or delete.
 */
export function computeDiff(original: string, rewrite: string): DiffSegment[] {
  const diffs = dmp.diff_main(original, rewrite);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, text]) => ({
    type: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  }));
}
```

**Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/utils/diffEngine.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/features/evolve-workspace/utils/diffEngine.ts apps/web/src/features/evolve-workspace/utils/diffEngine.test.ts
git commit -m "feat: add diff-match-patch and diffEngine utility"
```

---

### Task 4: Zustand Store

**Files:**
- Create: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts`
- Create: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`

**Step 1: Write the test**

Create `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useEvolveWorkspaceStore } from './useEvolveWorkspaceStore';

describe('useEvolveWorkspaceStore', () => {
  beforeEach(() => {
    useEvolveWorkspaceStore.getState().reset();
  });

  it('defaults to ai-chat tool', () => {
    expect(useEvolveWorkspaceStore.getState().activeTool).toBe('ai-chat');
  });

  it('defaults to idle rewrite state', () => {
    expect(useEvolveWorkspaceStore.getState().rewriteState).toBe('idle');
  });

  it('defaults to editor view mode', () => {
    expect(useEvolveWorkspaceStore.getState().viewMode).toBe('editor');
  });

  it('setActiveTool changes the active tool', () => {
    useEvolveWorkspaceStore.getState().setActiveTool('versions');
    expect(useEvolveWorkspaceStore.getState().activeTool).toBe('versions');
  });

  it('startRewrite snapshots original and sets streaming', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original content');
    const state = useEvolveWorkspaceStore.getState();
    expect(state.rewriteState).toBe('streaming');
    expect(state.originalContent).toBe('original content');
    expect(state.rewriteContent).toBe('');
  });

  it('appendRewriteChunk accumulates content', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original');
    useEvolveWorkspaceStore.getState().appendRewriteChunk('Hello ');
    useEvolveWorkspaceStore.getState().appendRewriteChunk('world');
    expect(useEvolveWorkspaceStore.getState().rewriteContent).toBe('Hello world');
  });

  it('completeRewrite transitions to reviewing', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original');
    useEvolveWorkspaceStore.getState().completeRewrite();
    expect(useEvolveWorkspaceStore.getState().rewriteState).toBe('reviewing');
  });

  it('discardRewrite resets to idle', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original');
    useEvolveWorkspaceStore.getState().appendRewriteChunk('new');
    useEvolveWorkspaceStore.getState().discardRewrite();
    const state = useEvolveWorkspaceStore.getState();
    expect(state.rewriteState).toBe('idle');
    expect(state.rewriteContent).toBeNull();
    expect(state.originalContent).toBeNull();
  });

  it('togglePinnedContext adds and removes IDs', () => {
    useEvolveWorkspaceStore.getState().togglePinnedContext('ent-1');
    expect(useEvolveWorkspaceStore.getState().pinnedContextIds).toEqual(['ent-1']);
    useEvolveWorkspaceStore.getState().togglePinnedContext('ent-1');
    expect(useEvolveWorkspaceStore.getState().pinnedContextIds).toEqual([]);
  });

  it('setWritingStyle updates style', () => {
    useEvolveWorkspaceStore.getState().setWritingStyle('emotional');
    expect(useEvolveWorkspaceStore.getState().writingStyle).toBe('emotional');
  });

  it('setLengthPreference updates preference', () => {
    useEvolveWorkspaceStore.getState().setLengthPreference('longer');
    expect(useEvolveWorkspaceStore.getState().lengthPreference).toBe('longer');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the store**

Create `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts`:

```typescript
import { create } from 'zustand';
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';

export type ToolId = 'ai-chat' | 'context' | 'versions' | 'media' | 'style';
export type RewriteState = 'idle' | 'streaming' | 'reviewing';
export type ViewMode = 'editor' | 'diff';

interface EvolveWorkspaceState {
  // Tool panel
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;

  // AI rewrite lifecycle
  rewriteState: RewriteState;
  rewriteContent: string | null;
  originalContent: string | null;
  viewMode: ViewMode;

  startRewrite: (currentContent: string) => void;
  appendRewriteChunk: (chunk: string) => void;
  completeRewrite: () => void;
  discardRewrite: () => void;
  acceptRewrite: () => void;
  setViewMode: (mode: ViewMode) => void;

  // Style preferences
  writingStyle: WritingStyle | null;
  lengthPreference: LengthPreference | null;
  setWritingStyle: (style: WritingStyle) => void;
  setLengthPreference: (pref: LengthPreference) => void;

  // Pinned context
  pinnedContextIds: string[];
  togglePinnedContext: (id: string) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  activeTool: 'ai-chat' as ToolId,
  rewriteState: 'idle' as RewriteState,
  rewriteContent: null as string | null,
  originalContent: null as string | null,
  viewMode: 'editor' as ViewMode,
  writingStyle: null as WritingStyle | null,
  lengthPreference: null as LengthPreference | null,
  pinnedContextIds: [] as string[],
};

export const useEvolveWorkspaceStore = create<EvolveWorkspaceState>((set) => ({
  ...initialState,

  setActiveTool: (tool) => set({ activeTool: tool }),

  startRewrite: (currentContent) =>
    set({
      rewriteState: 'streaming',
      originalContent: currentContent,
      rewriteContent: '',
    }),

  appendRewriteChunk: (chunk) =>
    set((state) => ({
      rewriteContent: (state.rewriteContent ?? '') + chunk,
    })),

  completeRewrite: () => set({ rewriteState: 'reviewing' }),

  discardRewrite: () =>
    set({
      rewriteState: 'idle',
      rewriteContent: null,
      originalContent: null,
    }),

  acceptRewrite: () =>
    set({
      rewriteState: 'idle',
      rewriteContent: null,
      originalContent: null,
    }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setWritingStyle: (style) => set({ writingStyle: style }),
  setLengthPreference: (pref) => set({ lengthPreference: pref }),

  togglePinnedContext: (id) =>
    set((state) => ({
      pinnedContextIds: state.pinnedContextIds.includes(id)
        ? state.pinnedContextIds.filter((p) => p !== id)
        : [...state.pinnedContextIds, id],
    })),

  reset: () => set(initialState),
}));
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/evolve-workspace/store/
git commit -m "feat: add evolve workspace Zustand store"
```

---

### Task 5: API Client and Hooks

**Files:**
- Create: `apps/web/src/features/evolve-workspace/api/rewrite.ts`
- Create: `apps/web/src/features/evolve-workspace/api/graphContext.ts`
- Create: `apps/web/src/features/evolve-workspace/hooks/useAIRewrite.ts`
- Create: `apps/web/src/features/evolve-workspace/hooks/useGraphContext.ts`

**Step 1: Create the rewrite API client**

Create `apps/web/src/features/evolve-workspace/api/rewrite.ts`:

```typescript
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';

export interface RewriteRequest {
  content: string;
  conversation_id?: string | null;
  pinned_context_ids?: string[];
  writing_style?: WritingStyle | null;
  length_preference?: LengthPreference | null;
  persona_id?: string;
}

interface RewriteChunkEvent {
  type: 'chunk';
  text: string;
}

interface RewriteDoneEvent {
  type: 'done';
  version_id: string;
  version_number: number;
}

interface RewriteErrorEvent {
  type: 'error';
  message: string;
  retryable: boolean;
}

type RewriteSSEEvent = RewriteChunkEvent | RewriteDoneEvent | RewriteErrorEvent;

/**
 * Stream a story rewrite via SSE. Returns an AbortController for cancellation.
 */
export function streamRewrite(
  storyId: string,
  data: RewriteRequest,
  onChunk: (text: string) => void,
  onDone: (versionId: string, versionNumber: number) => void,
  onError: (message: string, retryable: boolean) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`/api/stories/${storyId}/rewrite`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        onError(
          (errorData as { detail?: string }).detail ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status >= 500,
        );
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError('No response body', false);
        return;
      }

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
                const event = JSON.parse(jsonStr) as RewriteSSEEvent;
                switch (event.type) {
                  case 'chunk':
                    onChunk(event.text);
                    break;
                  case 'done':
                    onDone(event.version_id, event.version_number);
                    break;
                  case 'error':
                    onError(event.message, event.retryable);
                    break;
                }
              } catch {
                console.error('Failed to parse SSE event');
              }
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Rewrite stream error:', error);
      onError('Connection error. Please try again.', true);
    }
  })();

  return controller;
}
```

**Step 2: Create the graph context API client**

Create `apps/web/src/features/evolve-workspace/api/graphContext.ts`:

```typescript
import { apiGet } from '@/lib/api/client';

export interface RelatedStory {
  id: string;
  title: string;
  snippet: string;
  relevance: number;
}

export interface EntityGroup {
  people: Array<Record<string, string>>;
  places: Array<Record<string, string>>;
  events: Array<Record<string, string>>;
  objects: Array<Record<string, string>>;
}

export interface GraphContextResponse {
  related_stories: RelatedStory[];
  entities: EntityGroup;
}

export async function getGraphContext(storyId: string): Promise<GraphContextResponse> {
  return apiGet<GraphContextResponse>(`/api/stories/${storyId}/graph-context`);
}
```

**Step 3: Create the useAIRewrite hook**

Create `apps/web/src/features/evolve-workspace/hooks/useAIRewrite.ts`:

```typescript
import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { streamRewrite, type RewriteRequest } from '../api/rewrite';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

export function useAIRewrite(storyId: string) {
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const { startRewrite, appendRewriteChunk, completeRewrite, discardRewrite } =
    useEvolveWorkspaceStore();

  const triggerRewrite = useCallback(
    (currentContent: string, options: Omit<RewriteRequest, 'content'> = {}) => {
      // Abort any in-progress rewrite
      abortRef.current?.abort();

      startRewrite(currentContent);

      const data: RewriteRequest = {
        content: currentContent,
        ...options,
      };

      abortRef.current = streamRewrite(
        storyId,
        data,
        (chunk) => appendRewriteChunk(chunk),
        (_versionId, _versionNumber) => {
          completeRewrite();
          // Invalidate versions query so the new draft appears
          queryClient.invalidateQueries({ queryKey: ['versions', storyId] });
        },
        (message, _retryable) => {
          console.error('Rewrite error:', message);
          discardRewrite();
        },
      );
    },
    [storyId, startRewrite, appendRewriteChunk, completeRewrite, discardRewrite, queryClient],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    discardRewrite();
  }, [discardRewrite]);

  return { triggerRewrite, abort };
}
```

**Step 4: Create the useGraphContext hook**

Create `apps/web/src/features/evolve-workspace/hooks/useGraphContext.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getGraphContext, type GraphContextResponse } from '../api/graphContext';

export function useGraphContext(storyId: string | undefined, enabled = true) {
  return useQuery<GraphContextResponse>({
    queryKey: ['graph-context', storyId],
    queryFn: () => getGraphContext(storyId!),
    enabled: !!storyId && enabled,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
```

**Step 5: Commit**

```bash
git add apps/web/src/features/evolve-workspace/api/ apps/web/src/features/evolve-workspace/hooks/
git commit -m "feat: add rewrite API client, graph context client, and hooks"
```

---

## Phase 3: Layout Components ✅ COMPLETE

### Task 6: WorkspaceHeader

**Files:**
- Create: `apps/web/src/features/evolve-workspace/components/WorkspaceHeader.tsx`

**Step 1: Implement the header**

Create `apps/web/src/features/evolve-workspace/components/WorkspaceHeader.tsx`:

```typescript
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface WorkspaceHeaderProps {
  legacyId: string;
  storyId: string;
  title: string;
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
}

export function WorkspaceHeader({
  legacyId,
  storyId,
  title,
  isSaving,
  isDirty,
  onSave,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/legacy/${legacyId}/story/${storyId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to story
        </Button>
        <h1 className="text-sm font-medium text-neutral-700 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">
          {isSaving ? 'Saving...' : isDirty ? 'Unsaved changes' : 'Saved'}
        </span>
        <Button size="sm" onClick={onSave} disabled={isSaving || !isDirty}>
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/WorkspaceHeader.tsx
git commit -m "feat: add WorkspaceHeader component"
```

---

### Task 7: ToolStrip

**Files:**
- Create: `apps/web/src/features/evolve-workspace/components/ToolStrip.tsx`

**Step 1: Implement the tool strip**

Create `apps/web/src/features/evolve-workspace/components/ToolStrip.tsx`:

```typescript
import { MessageSquare, GitBranch, History, Image, Pen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ToolId, useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TOOLS: { id: ToolId; icon: typeof MessageSquare; label: string }[] = [
  { id: 'ai-chat', icon: MessageSquare, label: 'AI Persona' },
  { id: 'context', icon: GitBranch, label: 'Context' },
  { id: 'versions', icon: History, label: 'Versions' },
  { id: 'media', icon: Image, label: 'Media' },
  { id: 'style', icon: Pen, label: 'Style' },
];

export function ToolStrip() {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);

  return (
    <div className="flex flex-col items-center py-2 px-1 border-x bg-neutral-50 shrink-0 w-12">
      {TOOLS.map(({ id, icon: Icon, label }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveTool(id)}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-md mb-1 transition-colors',
                activeTool === id
                  ? 'bg-theme-primary/10 text-theme-primary'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700',
              )}
              aria-label={label}
              aria-pressed={activeTool === id}
            >
              <Icon className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/ToolStrip.tsx
git commit -m "feat: add ToolStrip vertical icon bar"
```

---

### Task 8: ToolPanel Container

**Files:**
- Create: `apps/web/src/features/evolve-workspace/components/ToolPanel.tsx`

**Step 1: Implement the swappable container**

Create `apps/web/src/features/evolve-workspace/components/ToolPanel.tsx`:

```typescript
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { AIChatTool } from '../tools/AIChatTool';
import { ContextTool } from '../tools/ContextTool';
import { VersionsTool } from '../tools/VersionsTool';
import { MediaTool } from '../tools/MediaTool';
import { StyleTool } from '../tools/StyleTool';

interface ToolPanelProps {
  legacyId: string;
  storyId: string;
  conversationId: string | null;
}

export function ToolPanel({ legacyId, storyId, conversationId }: ToolPanelProps) {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-4 py-2 border-b shrink-0">
        <h2 className="text-sm font-medium text-neutral-600 capitalize">
          {activeTool.replace('-', ' ')}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTool === 'ai-chat' && (
          <AIChatTool
            legacyId={legacyId}
            storyId={storyId}
            conversationId={conversationId}
          />
        )}
        {activeTool === 'context' && <ContextTool storyId={storyId} />}
        {activeTool === 'versions' && <VersionsTool storyId={storyId} />}
        {activeTool === 'media' && <MediaTool legacyId={legacyId} />}
        {activeTool === 'style' && <StyleTool />}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/ToolPanel.tsx
git commit -m "feat: add ToolPanel swappable container"
```

---

### Task 9: DiffView Component

**Files:**
- Create: `apps/web/src/features/evolve-workspace/components/DiffView.tsx`

**Step 1: Implement the diff view**

Create `apps/web/src/features/evolve-workspace/components/DiffView.tsx`:

```typescript
import { useMemo } from 'react';
import { computeDiff, type DiffSegment } from '../utils/diffEngine';

interface DiffViewProps {
  original: string;
  rewrite: string;
}

export function DiffView({ original, rewrite }: DiffViewProps) {
  const segments = useMemo(() => computeDiff(original, rewrite), [original, rewrite]);

  return (
    <div className="px-6 py-4 font-serif text-base leading-relaxed whitespace-pre-wrap">
      {segments.map((segment, i) => (
        <DiffSegmentSpan key={i} segment={segment} />
      ))}
    </div>
  );
}

function DiffSegmentSpan({ segment }: { segment: DiffSegment }) {
  switch (segment.type) {
    case 'equal':
      return <span>{segment.text}</span>;
    case 'insert':
      return (
        <span className="bg-emerald-100 text-emerald-800 decoration-emerald-400">
          {segment.text}
        </span>
      );
    case 'delete':
      return (
        <span className="bg-red-100 text-red-800 line-through decoration-red-400">
          {segment.text}
        </span>
      );
  }
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/DiffView.tsx
git commit -m "feat: add DiffView inline diff renderer"
```

---

### Task 10: EditorPanel with Diff Toggle

**Files:**
- Create: `apps/web/src/features/evolve-workspace/components/EditorPanel.tsx`

**Step 1: Implement the editor panel**

Create `apps/web/src/features/evolve-workspace/components/EditorPanel.tsx`:

```typescript
import { useCallback } from 'react';
import StoryEditor from '@/features/editor/components/StoryEditor';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { Button } from '@/components/ui/button';
import { Check, X, RefreshCw } from 'lucide-react';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { DiffView } from './DiffView';

interface EditorPanelProps {
  content: string;
  onChange: (markdown: string) => void;
  legacyId: string;
  onAcceptRewrite: (content: string) => void;
  onRegenerate: () => void;
}

export function EditorPanel({
  content,
  onChange,
  legacyId,
  onAcceptRewrite,
  onRegenerate,
}: EditorPanelProps) {
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const rewriteContent = useEvolveWorkspaceStore((s) => s.rewriteContent);
  const originalContent = useEvolveWorkspaceStore((s) => s.originalContent);
  const viewMode = useEvolveWorkspaceStore((s) => s.viewMode);
  const setViewMode = useEvolveWorkspaceStore((s) => s.setViewMode);
  const discardRewrite = useEvolveWorkspaceStore((s) => s.discardRewrite);
  const acceptRewrite = useEvolveWorkspaceStore((s) => s.acceptRewrite);

  const isRewriting = rewriteState === 'streaming' || rewriteState === 'reviewing';

  const handleAccept = useCallback(() => {
    if (rewriteContent) {
      onAcceptRewrite(rewriteContent);
      acceptRewrite();
    }
  }, [rewriteContent, onAcceptRewrite, acceptRewrite]);

  const handleDiscard = useCallback(() => {
    discardRewrite();
  }, [discardRewrite]);

  // Normal editing mode
  if (!isRewriting) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
          <StoryEditor
            content={content}
            onChange={onChange}
            legacyId={legacyId}
            placeholder="Start writing your story..."
          />
        </div>
      </div>
    );
  }

  // Rewrite mode: show toggle + content + action buttons
  return (
    <div className="flex flex-col h-full">
      {/* View mode toggle + status */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-neutral-50 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500 mr-2">View:</span>
          <Button
            variant={viewMode === 'editor' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('editor')}
          >
            Editor
          </Button>
          <Button
            variant={viewMode === 'diff' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('diff')}
          >
            Diff
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {rewriteState === 'streaming' && (
            <span className="text-xs text-amber-600 animate-pulse">Rewriting...</span>
          )}
          {rewriteState === 'reviewing' && (
            <span className="text-xs text-emerald-600">Rewrite complete</span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'editor' ? (
          rewriteState === 'streaming' ? (
            <div className="px-6 py-4 font-serif">
              <Streamdown isAnimating={true} caret="block">
                {rewriteContent ?? ''}
              </Streamdown>
            </div>
          ) : (
            <StoryEditor
              content={rewriteContent ?? ''}
              onChange={(md) =>
                useEvolveWorkspaceStore.setState({ rewriteContent: md })
              }
              legacyId={legacyId}
            />
          )
        ) : (
          <DiffView
            original={originalContent ?? ''}
            rewrite={rewriteContent ?? ''}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 px-4 py-3 border-t bg-white shrink-0">
        <Button size="sm" onClick={handleAccept} disabled={rewriteState === 'streaming'}>
          <Check className="h-4 w-4 mr-1" />
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={handleDiscard}>
          <X className="h-4 w-4 mr-1" />
          Discard
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRegenerate}
          disabled={rewriteState === 'streaming'}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Regenerate
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/EditorPanel.tsx
git commit -m "feat: add EditorPanel with diff/editor toggle and rewrite actions"
```

---

### Task 11: BottomToolbar

**Files:**
- Create: `apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx`

**Step 1: Implement the bottom toolbar**

Create `apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx`:

```typescript
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

interface BottomToolbarProps {
  onRewrite: () => void;
  wordCount: number;
}

export function BottomToolbar({ onRewrite, wordCount }: BottomToolbarProps) {
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t bg-white shrink-0">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={onRewrite}
          disabled={rewriteState === 'streaming'}
        >
          <Sparkles className="h-4 w-4 mr-1" />
          AI Rewrite
        </Button>

        {writingStyle && (
          <span className="text-xs text-neutral-500 capitalize">
            Style: {writingStyle}
          </span>
        )}
        {lengthPreference && (
          <span className="text-xs text-neutral-500 capitalize">
            Length: {lengthPreference}
          </span>
        )}
      </div>

      <span className="text-xs text-neutral-400">{wordCount} words</span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx
git commit -m "feat: add BottomToolbar with AI Rewrite trigger"
```

---

## Phase 4: Tool Panels ✅ COMPLETE

### Task 12: AIChatTool

**Files:**
- Create: `apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx`

**Step 1: Implement the AI chat tool**

Adapts the pattern from `ElicitationPanel` into a side panel format. Reuses `useAIChat` directly.

Create `apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAIChat } from '@/features/ai-chat/hooks/useAIChat';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

interface AIChatToolProps {
  legacyId: string;
  storyId: string;
  conversationId: string | null;
}

export function AIChatTool({ legacyId, conversationId }: AIChatToolProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    retryLastMessage,
    clearError,
  } = useAIChat({
    legacyId,
    personaId: 'biographer',
    conversationId,
  });

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-8">
            Chat with the AI to discuss the story before rewriting.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-theme-primary/10 ml-4'
                : msg.role === 'assistant'
                  ? 'bg-neutral-50 mr-4'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {msg.role === 'assistant' && msg.status === 'streaming' ? (
              <Streamdown isAnimating={true} caret="block">
                {msg.content}
              </Streamdown>
            ) : (
              <span className="whitespace-pre-wrap">{msg.content}</span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={retryLastMessage}>
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t shrink-0">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the story..."
            className="min-h-[60px] max-h-[120px] text-sm resize-none"
            disabled={isStreaming}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx
git commit -m "feat: add AIChatTool side panel"
```

---

### Task 13: ContextTool

**Files:**
- Create: `apps/web/src/features/evolve-workspace/tools/ContextTool.tsx`

**Step 1: Implement the context tool**

Create `apps/web/src/features/evolve-workspace/tools/ContextTool.tsx`:

```typescript
import { Pin, PinOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useGraphContext } from '../hooks/useGraphContext';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

interface ContextToolProps {
  storyId: string;
}

export function ContextTool({ storyId }: ContextToolProps) {
  const { data, isLoading } = useGraphContext(storyId);
  const pinnedContextIds = useEvolveWorkspaceStore((s) => s.pinnedContextIds);
  const togglePinnedContext = useEvolveWorkspaceStore((s) => s.togglePinnedContext);

  if (isLoading) {
    return <div className="p-4 text-sm text-neutral-400">Loading context...</div>;
  }

  if (!data) {
    return (
      <div className="p-4 text-sm text-neutral-400">
        No graph context available. Context will appear as more stories are added.
      </div>
    );
  }

  const { related_stories, entities } = data;
  const hasEntities =
    entities.people.length > 0 ||
    entities.places.length > 0 ||
    entities.events.length > 0 ||
    entities.objects.length > 0;

  return (
    <div className="p-3 space-y-4">
      {/* Related Stories */}
      {related_stories.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Related Stories
          </h3>
          <div className="space-y-2">
            {related_stories.map((story) => {
              const isPinned = pinnedContextIds.includes(story.id);
              return (
                <div
                  key={story.id}
                  className="flex items-start justify-between p-2 rounded-md border bg-neutral-50 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{story.title}</p>
                    {story.snippet && (
                      <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">
                        {story.snippet}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => togglePinnedContext(story.id)}
                    className="ml-2 text-neutral-400 hover:text-theme-primary shrink-0"
                    aria-label={isPinned ? 'Unpin from context' : 'Pin to context'}
                  >
                    {isPinned ? (
                      <PinOff className="h-4 w-4" />
                    ) : (
                      <Pin className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Entities */}
      {hasEntities && (
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Entities
          </h3>
          <div className="space-y-2">
            {entities.people.length > 0 && (
              <EntityChips label="People" items={entities.people} />
            )}
            {entities.places.length > 0 && (
              <EntityChips label="Places" items={entities.places} />
            )}
            {entities.events.length > 0 && (
              <EntityChips label="Events" items={entities.events} />
            )}
            {entities.objects.length > 0 && (
              <EntityChips label="Objects" items={entities.objects} />
            )}
          </div>
        </section>
      )}

      {related_stories.length === 0 && !hasEntities && (
        <div className="text-sm text-neutral-400">
          No connections found yet. Add more stories to build the knowledge graph.
        </div>
      )}
    </div>
  );
}

function EntityChips({
  label,
  items,
}: {
  label: string;
  items: Array<Record<string, string>>;
}) {
  return (
    <div>
      <span className="text-xs text-neutral-500">{label}</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {item.name || item.period || Object.values(item)[0]}
          </Badge>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/ContextTool.tsx
git commit -m "feat: add ContextTool with graph entities and related stories"
```

---

### Task 14: VersionsTool

**Files:**
- Create: `apps/web/src/features/evolve-workspace/tools/VersionsTool.tsx`

**Step 1: Implement the versions tool**

Adapts the version list rendering from `VersionHistoryDrawer` into an inline panel. Uses existing `useVersions` hook.

Create `apps/web/src/features/evolve-workspace/tools/VersionsTool.tsx`:

```typescript
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useVersions } from '@/features/story/hooks/useVersions';
import { getVersionSourceLabel } from '@/lib/utils/versionLabels';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { formatDistanceToNow } from 'date-fns';

interface VersionsToolProps {
  storyId: string;
}

export function VersionsTool({ storyId }: VersionsToolProps) {
  const { data, isLoading } = useVersions(storyId);
  const setViewMode = useEvolveWorkspaceStore((s) => s.setViewMode);

  if (isLoading) {
    return <div className="p-4 text-sm text-neutral-400">Loading versions...</div>;
  }

  const versions = data?.versions ?? [];

  if (versions.length === 0) {
    return (
      <div className="p-4 text-sm text-neutral-400">
        No versions yet. Save changes or run an AI rewrite to create versions.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {versions.map((version) => (
        <div
          key={version.version_number}
          className="flex items-center justify-between p-2 rounded-md border bg-neutral-50 text-sm"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs shrink-0">
                v{version.version_number}
              </Badge>
              {version.status === 'active' && (
                <Badge className="text-xs bg-emerald-100 text-emerald-700">Active</Badge>
              )}
              {version.status === 'draft' && (
                <Badge className="text-xs bg-amber-100 text-amber-700">Draft</Badge>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {getVersionSourceLabel(version.source)} &middot;{' '}
              {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
            </p>
            {version.change_summary && (
              <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                {version.change_summary}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // Set up diff view with this version vs current
              // This will be wired up in the EvolveWorkspace
              setViewMode('diff');
            }}
            className="shrink-0 text-xs"
          >
            Compare
          </Button>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/VersionsTool.tsx
git commit -m "feat: add VersionsTool panel"
```

---

### Task 15: MediaTool

**Files:**
- Create: `apps/web/src/features/evolve-workspace/tools/MediaTool.tsx`

**Step 1: Implement the media tool**

Create `apps/web/src/features/evolve-workspace/tools/MediaTool.tsx`:

```typescript
import { useState } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { useMediaUpload, useMediaList } from '@/features/media/hooks/useMedia';

interface MediaToolProps {
  legacyId: string;
}

export function MediaTool({ legacyId }: MediaToolProps) {
  const { data: mediaItems } = useMediaList(legacyId);
  const uploadMutation = useMediaUpload(legacyId);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await uploadMutation.mutateAsync(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadMutation.mutateAsync(file);
      e.target.value = '';
    }
  };

  return (
    <div className="p-3 space-y-4">
      {/* Upload zone */}
      <label
        className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragging
            ? 'border-theme-primary bg-theme-primary/5'
            : 'border-neutral-200 hover:border-neutral-300'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-6 w-6 text-neutral-400 mb-2" />
        <span className="text-sm text-neutral-500">
          {uploadMutation.isPending ? 'Uploading...' : 'Drop media here or click to upload'}
        </span>
        <input
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          disabled={uploadMutation.isPending}
        />
      </label>

      {/* Legacy media grid */}
      {mediaItems && mediaItems.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Legacy Media
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {mediaItems.map((item) => (
              <div
                key={item.id}
                className="aspect-square rounded-md overflow-hidden border cursor-pointer hover:ring-2 hover:ring-theme-primary/50 transition-shadow"
                title="Click to insert into story"
              >
                {item.download_url ? (
                  <img
                    src={item.download_url}
                    alt={item.filename || 'Media'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-100">
                    <ImageIcon className="h-6 w-6 text-neutral-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400 mt-2">Click to insert into story</p>
        </section>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/MediaTool.tsx
git commit -m "feat: add MediaTool with upload and legacy media grid"
```

---

### Task 16: StyleTool

**Files:**
- Create: `apps/web/src/features/evolve-workspace/tools/StyleTool.tsx`

**Step 1: Implement the style tool**

Reuses the style/length options from `StyleSelector` but as a persistent preferences panel.

Create `apps/web/src/features/evolve-workspace/tools/StyleTool.tsx`:

```typescript
import { Eye, Heart, MessageCircle, AlignLeft, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const WRITING_STYLES: {
  id: WritingStyle;
  name: string;
  description: string;
  icon: typeof Eye;
}[] = [
  { id: 'vivid', name: 'Vivid', description: 'Sensory details, atmosphere', icon: Eye },
  { id: 'emotional', name: 'Emotional', description: 'Feelings, relationships', icon: Heart },
  {
    id: 'conversational',
    name: 'Conversational',
    description: 'Informal, personal',
    icon: MessageCircle,
  },
  { id: 'concise', name: 'Concise', description: 'Tight, impactful', icon: AlignLeft },
  { id: 'documentary', name: 'Documentary', description: 'Factual, chronological', icon: FileText },
];

const LENGTH_OPTIONS: { id: LengthPreference; label: string }[] = [
  { id: 'similar', label: 'Keep similar length' },
  { id: 'shorter', label: 'Make it shorter' },
  { id: 'longer', label: 'Allow it to grow' },
];

export function StyleTool() {
  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);
  const setWritingStyle = useEvolveWorkspaceStore((s) => s.setWritingStyle);
  const setLengthPreference = useEvolveWorkspaceStore((s) => s.setLengthPreference);

  return (
    <div className="p-3 space-y-5">
      {/* Writing style */}
      <section>
        <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Writing Style
        </h3>
        <div className="space-y-1.5">
          {WRITING_STYLES.map(({ id, name, description, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setWritingStyle(id)}
              className={cn(
                'flex items-center gap-3 w-full p-2.5 rounded-md border text-left text-sm transition-colors',
                writingStyle === id
                  ? 'border-theme-primary bg-theme-primary/5'
                  : 'border-neutral-200 hover:border-neutral-300',
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-neutral-500" />
              <div className="min-w-0">
                <p className="font-medium">{name}</p>
                <p className="text-xs text-neutral-500">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Length preference */}
      <section>
        <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Length Preference
        </h3>
        <RadioGroup
          value={lengthPreference ?? undefined}
          onValueChange={(v) => setLengthPreference(v as LengthPreference)}
        >
          {LENGTH_OPTIONS.map(({ id, label }) => (
            <div key={id} className="flex items-center space-x-2">
              <RadioGroupItem value={id} id={`length-${id}`} />
              <Label htmlFor={`length-${id}`} className="text-sm">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </section>

      {/* Info */}
      <p className="text-xs text-neutral-400">
        These preferences are applied when you click "AI Rewrite" in the bottom toolbar.
      </p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/StyleTool.tsx
git commit -m "feat: add StyleTool with writing style and length preferences"
```

---

## Phase 5: Assembly & Mobile ✅ COMPLETE

### Task 17: MobileToolSheet

**Files:**
- Create: `apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx`

**Step 1: Implement the mobile sheet wrapper**

Create `apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx`:

```typescript
import { Drawer, DrawerContent, DrawerHandle } from '@/components/ui/drawer';
import { type ToolId, useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { AIChatTool } from '../tools/AIChatTool';
import { ContextTool } from '../tools/ContextTool';
import { VersionsTool } from '../tools/VersionsTool';
import { MediaTool } from '../tools/MediaTool';
import { StyleTool } from '../tools/StyleTool';

interface MobileToolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyId: string;
  storyId: string;
  conversationId: string | null;
}

export function MobileToolSheet({
  open,
  onOpenChange,
  legacyId,
  storyId,
  conversationId,
}: MobileToolSheetProps) {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[60vh]">
        <DrawerHandle />
        <div className="px-2 py-1 border-b">
          <h2 className="text-sm font-medium text-neutral-600 capitalize">
            {activeTool.replace('-', ' ')}
          </h2>
        </div>
        <div className="overflow-y-auto flex-1">
          {activeTool === 'ai-chat' && (
            <AIChatTool legacyId={legacyId} storyId={storyId} conversationId={conversationId} />
          )}
          {activeTool === 'context' && <ContextTool storyId={storyId} />}
          {activeTool === 'versions' && <VersionsTool storyId={storyId} />}
          {activeTool === 'media' && <MediaTool legacyId={legacyId} />}
          {activeTool === 'style' && <StyleTool />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx
git commit -m "feat: add MobileToolSheet for bottom sheet tools"
```

---

### Task 18: EvolveWorkspace Root Component

**Files:**
- Create: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`

**Step 1: Implement the root component**

This is the main orchestrator that wires all pieces together.

Create `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`:

```typescript
import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useStory, useUpdateStory } from '@/features/story/hooks/useStories';
import { useIsMobile } from '@/hooks/use-mobile';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { EditorPanel } from './components/EditorPanel';
import { ToolStrip } from './components/ToolStrip';
import { ToolPanel } from './components/ToolPanel';
import { BottomToolbar } from './components/BottomToolbar';
import { MobileToolSheet } from './components/MobileToolSheet';
import { MobileBottomBar } from './components/MobileBottomBar';
import { useAIRewrite } from './hooks/useAIRewrite';
import { useEvolveWorkspaceStore } from './store/useEvolveWorkspaceStore';

interface EvolveWorkspaceProps {
  storyId?: string;
  legacyId?: string;
}

export default function EvolveWorkspace({ storyId: propStoryId, legacyId: propLegacyId }: EvolveWorkspaceProps) {
  const params = useParams<{ storyId: string; legacyId: string }>();
  const storyId = propStoryId ?? params.storyId ?? '';
  const legacyId = propLegacyId ?? params.legacyId ?? '';

  const isMobile = useIsMobile();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [conversationId] = useState<string | null>(null);

  const { data: story, isLoading } = useStory(storyId);
  const updateStory = useUpdateStory(storyId);
  const { triggerRewrite } = useAIRewrite(storyId);

  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);
  const pinnedContextIds = useEvolveWorkspaceStore((s) => s.pinnedContextIds);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);

  // Initialize content from story data
  useState(() => {
    if (story?.content && !isDirty) {
      setContent(story.content);
    }
  });

  // Keep content in sync when story loads
  if (story?.content && content === '' && !isDirty) {
    setContent(story.content);
  }

  const handleContentChange = useCallback((markdown: string) => {
    setContent(markdown);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!story) return;
    await updateStory.mutateAsync({
      title: story.title,
      content,
      visibility: story.visibility,
      legacies: story.legacies.map((l) => ({
        legacy_id: l.legacy_id,
        role: l.role,
      })),
    });
    setIsDirty(false);
  }, [story, content, updateStory]);

  const handleRewrite = useCallback(() => {
    triggerRewrite(content, {
      conversation_id: conversationId,
      pinned_context_ids: pinnedContextIds,
      writing_style: writingStyle,
      length_preference: lengthPreference,
    });
  }, [content, conversationId, pinnedContextIds, writingStyle, lengthPreference, triggerRewrite]);

  const handleAcceptRewrite = useCallback(
    (rewrittenContent: string) => {
      setContent(rewrittenContent);
      setIsDirty(true);
    },
    [],
  );

  const wordCount = useMemo(
    () => content.split(/\s+/).filter(Boolean).length,
    [content],
  );

  const handleMobileToolSelect = useCallback(
    (toolId: string) => {
      if (toolId === 'rewrite') {
        handleRewrite();
      } else {
        setActiveTool(toolId as any);
        setMobileSheetOpen(true);
      }
    },
    [handleRewrite, setActiveTool],
  );

  if (isLoading) {
    return (
      <div className="h-[calc(100dvh-3.5rem)] flex items-center justify-center">
        <span className="text-neutral-400">Loading workspace...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden bg-theme-background">
        <WorkspaceHeader
          legacyId={legacyId}
          storyId={storyId}
          title={story?.title ?? 'Untitled'}
          isSaving={updateStory.isPending}
          isDirty={isDirty}
          onSave={handleSave}
        />

        {isMobile ? (
          /* Mobile layout: full editor + bottom bar + sheet */
          <>
            <div className="flex-1 overflow-y-auto">
              <EditorPanel
                content={content}
                onChange={handleContentChange}
                legacyId={legacyId}
                onAcceptRewrite={handleAcceptRewrite}
                onRegenerate={handleRewrite}
              />
            </div>
            <MobileBottomBar
              wordCount={wordCount}
              onToolSelect={handleMobileToolSelect}
            />
            <MobileToolSheet
              open={mobileSheetOpen}
              onOpenChange={setMobileSheetOpen}
              legacyId={legacyId}
              storyId={storyId}
              conversationId={conversationId}
            />
          </>
        ) : (
          /* Desktop layout: resizable panels */
          <>
            <div className="flex-1 flex min-h-0">
              <ResizablePanelGroup direction="horizontal">
                <ResizablePanel defaultSize={65} minSize={40} maxSize={80}>
                  <EditorPanel
                    content={content}
                    onChange={handleContentChange}
                    legacyId={legacyId}
                    onAcceptRewrite={handleAcceptRewrite}
                    onRegenerate={handleRewrite}
                  />
                </ResizablePanel>
                <ToolStrip />
                <ResizableHandle />
                <ResizablePanel defaultSize={35} minSize={20}>
                  <ToolPanel
                    legacyId={legacyId}
                    storyId={storyId}
                    conversationId={conversationId}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
            <BottomToolbar onRewrite={handleRewrite} wordCount={wordCount} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
```

**Step 2: Create MobileBottomBar**

Create `apps/web/src/features/evolve-workspace/components/MobileBottomBar.tsx`:

```typescript
import { MessageSquare, GitBranch, History, Image, Pen, Sparkles } from 'lucide-react';

const MOBILE_TOOLS = [
  { id: 'ai-chat', icon: MessageSquare, label: 'Chat' },
  { id: 'context', icon: GitBranch, label: 'Context' },
  { id: 'versions', icon: History, label: 'Versions' },
  { id: 'media', icon: Image, label: 'Media' },
  { id: 'style', icon: Pen, label: 'Style' },
  { id: 'rewrite', icon: Sparkles, label: 'Rewrite' },
];

interface MobileBottomBarProps {
  wordCount: number;
  onToolSelect: (toolId: string) => void;
}

export function MobileBottomBar({ wordCount, onToolSelect }: MobileBottomBarProps) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 border-t bg-white shrink-0">
      <div className="flex items-center gap-1">
        {MOBILE_TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onToolSelect(id)}
            className="flex flex-col items-center p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={label}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] mt-0.5">{label}</span>
          </button>
        ))}
      </div>
      <span className="text-[10px] text-neutral-400">{wordCount}w</span>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx apps/web/src/features/evolve-workspace/components/MobileBottomBar.tsx
git commit -m "feat: add EvolveWorkspace root component with desktop and mobile layouts"
```

---

### Task 19: Route Swap

**Files:**
- Modify: `apps/web/src/routes/index.tsx:22,143-149`

**Step 1: Update the lazy import**

In `apps/web/src/routes/index.tsx`, change line 22 from:

```typescript
const StoryEvolution = lazy(() => import('@/features/story-evolution/StoryEvolutionWorkspace'));
```

to:

```typescript
const StoryEvolution = lazy(() => import('@/features/evolve-workspace/EvolveWorkspace'));
```

The route definition at lines 143-149 stays the same — the `WithStoryProps` wrapper will pass `storyId` and `legacyId` as props.

**Step 2: Run the dev server to verify no build errors**

Run: `cd apps/web && npm run build`
Expected: Build succeeds without errors.

**Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "feat: swap evolve route to new EvolveWorkspace component"
```

---

### Task 20: Frontend Tests and Validation

**Files:**
- Run existing tests + new tests

**Step 1: Run the diff engine tests**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/utils/diffEngine.test.ts`
Expected: All tests PASS.

**Step 2: Run the store tests**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`
Expected: All tests PASS.

**Step 3: Run the full frontend test suite**

Run: `cd apps/web && npm run test`
Expected: All existing tests still pass.

**Step 4: Run the frontend build**

Run: `cd apps/web && npm run build`
Expected: Build succeeds.

**Step 5: Run the frontend lint**

Run: `cd apps/web && npm run lint`
Expected: No errors.

**Step 6: Run backend validation**

Run: `just validate-backend`
Expected: Passes (ruff + mypy).

**Step 7: Commit any remaining fixes**

If any fixes are needed from the validation steps, commit them:

```bash
git add -A
git commit -m "fix: address lint and type issues from validation"
```

---

## Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|----------------|
| 1: Backend | 1-2 | Rewrite SSE endpoint + Graph context REST endpoint |
| 2: Foundation | 3-5 | diff-match-patch + Zustand store + API clients + hooks |
| 3: Layout | 6-11 | Header, ToolStrip, ToolPanel, EditorPanel, DiffView, BottomToolbar |
| 4: Tools | 12-16 | AI Chat, Context, Versions, Media, Style tool panels |
| 5: Assembly | 17-20 | EvolveWorkspace root, MobileToolSheet, route swap, validation |

**Total:** ~20 tasks, ~25 files created, 2 files modified, 1 npm dependency added.
