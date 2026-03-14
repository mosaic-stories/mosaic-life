# Graph Model Expansion Implementation Plan

> **Status: COMPLETED** — All 8 tasks implemented and validated on 2026-03-14.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Person nodes, Story-to-Person edges (WRITTEN_ABOUT, MENTIONS, AUTHORED_BY), and Person-to-Person relationship edges (FAMILY_OF, WORKED_WITH, FRIENDS_WITH, KNEW) to the Neptune graph database.

**Architecture:** Expand `_sync_entities_to_graph()` to create Person nodes from extracted entities and classify Story→Person edges. Add a new graph sync hook in `member_profile.update_profile()` to project declared relationships as Person→Person edges. Update `clear_story_entity_relationships()` to also clear person-related edges. Update backfill scripts for both extraction-derived and declared relationships.

**Tech Stack:** Python/FastAPI, Neptune (openCypher), TinkerPop (Gremlin, local), SQLAlchemy, pytest

**Design doc:** `docs/plans/2026-03-14-graph-model-expansion-design.md`

---

## Task 1: Add relationship type categorization utility ✅

**Files:**
- Create: `services/core-api/app/services/graph_sync.py`
- Test: `services/core-api/tests/services/test_graph_sync.py`

This module holds shared logic for mapping relationship types to graph edge labels, normalizing person IDs, and classifying Story→Person edges. It's used by both ingestion and member profile sync.

**Step 1: Write the failing tests**

```python
"""Tests for graph sync utilities."""

import pytest

from app.services.graph_sync import (
    categorize_relationship,
    classify_story_person_edge,
    normalize_person_id,
)


class TestCategorizeRelationship:
    """Map relationship_type strings to graph edge labels."""

    @pytest.mark.parametrize(
        "relationship_type,expected",
        [
            ("parent", "FAMILY_OF"),
            ("child", "FAMILY_OF"),
            ("spouse", "FAMILY_OF"),
            ("sibling", "FAMILY_OF"),
            ("grandparent", "FAMILY_OF"),
            ("grandchild", "FAMILY_OF"),
            ("aunt", "FAMILY_OF"),
            ("uncle", "FAMILY_OF"),
            ("cousin", "FAMILY_OF"),
            ("niece", "FAMILY_OF"),
            ("nephew", "FAMILY_OF"),
            ("in_law", "FAMILY_OF"),
            ("colleague", "WORKED_WITH"),
            ("mentor", "WORKED_WITH"),
            ("mentee", "WORKED_WITH"),
            ("friend", "FRIENDS_WITH"),
            ("neighbor", "FRIENDS_WITH"),
            ("caregiver", "KNEW"),
            ("other", "KNEW"),
            ("unknown_value", "KNEW"),
        ],
    )
    def test_maps_correctly(self, relationship_type: str, expected: str) -> None:
        assert categorize_relationship(relationship_type) == expected

    def test_none_returns_knew(self) -> None:
        assert categorize_relationship(None) == "KNEW"


class TestNormalizePersonId:
    """Build deterministic person node IDs."""

    def test_from_name_and_legacy(self) -> None:
        result = normalize_person_id("Uncle Jim", "abc-123")
        assert result == "person-uncle-jim-abc-123"

    def test_strips_extra_whitespace(self) -> None:
        result = normalize_person_id("  John   Doe  ", "abc-123")
        assert result == "person-john-doe-abc-123"


class TestClassifyStoryPersonEdge:
    """Determine WRITTEN_ABOUT vs MENTIONS."""

    def test_name_in_title_returns_written_about(self) -> None:
        assert classify_story_person_edge("Grandma Rose", "Remembering Grandma Rose", 0.8) == "WRITTEN_ABOUT"

    def test_high_confidence_returns_written_about(self) -> None:
        assert classify_story_person_edge("Jim", "A day at the park", 0.95) == "WRITTEN_ABOUT"

    def test_low_confidence_returns_mentions(self) -> None:
        assert classify_story_person_edge("Jim", "A day at the park", 0.75) == "MENTIONS"

    def test_partial_name_match_in_title(self) -> None:
        assert classify_story_person_edge("Rose", "Remembering Grandma Rose", 0.7) == "WRITTEN_ABOUT"
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/services/test_graph_sync.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.graph_sync'`

**Step 3: Write the implementation**

```python
"""Utilities for syncing data to the graph database.

Shared by entity extraction ingestion and member profile sync.
"""

from __future__ import annotations

# Family relationship types
_FAMILY_TYPES = frozenset({
    "parent", "child", "spouse", "sibling",
    "grandparent", "grandchild", "aunt", "uncle",
    "cousin", "niece", "nephew", "in_law",
})

# Work relationship types
_WORK_TYPES = frozenset({"colleague", "mentor", "mentee"})

# Friend relationship types
_FRIEND_TYPES = frozenset({"friend", "neighbor"})

# Confidence threshold for WRITTEN_ABOUT classification
_WRITTEN_ABOUT_CONFIDENCE = 0.9


def categorize_relationship(relationship_type: str | None) -> str:
    """Map a relationship type string to a graph edge label.

    Returns one of: FAMILY_OF, WORKED_WITH, FRIENDS_WITH, KNEW.
    """
    if relationship_type is None:
        return "KNEW"
    rt = relationship_type.lower().strip()
    if rt in _FAMILY_TYPES:
        return "FAMILY_OF"
    if rt in _WORK_TYPES:
        return "WORKED_WITH"
    if rt in _FRIEND_TYPES:
        return "FRIENDS_WITH"
    return "KNEW"


def normalize_person_id(name: str, legacy_id: str) -> str:
    """Build a deterministic person node ID from name and legacy."""
    normalized = " ".join(name.split()).lower().replace(" ", "-")
    return f"person-{normalized}-{legacy_id}"


def classify_story_person_edge(
    person_name: str,
    story_title: str,
    confidence: float,
) -> str:
    """Classify whether a person is WRITTEN_ABOUT or MENTIONS in a story.

    Heuristic:
    - Name appears in story title → WRITTEN_ABOUT
    - Confidence >= 0.9 → WRITTEN_ABOUT
    - Otherwise → MENTIONS
    """
    if person_name.lower() in story_title.lower():
        return "WRITTEN_ABOUT"
    if confidence >= _WRITTEN_ABOUT_CONFIDENCE:
        return "WRITTEN_ABOUT"
    return "MENTIONS"
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/services/test_graph_sync.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/graph_sync.py services/core-api/tests/services/test_graph_sync.py
git commit -m "feat: add graph sync utility module for relationship categorization"
```

---

## Task 2: Update `clear_story_entity_relationships` to include person edges ✅

**Files:**
- Modify: `services/core-api/app/adapters/neptune_graph.py:167-177`
- Modify: `services/core-api/app/adapters/local_graph.py:121-131`
- Test: `services/core-api/tests/adapters/test_local_graph.py` (verify existing tests still pass)

The current `clear_story_entity_relationships` only clears `TOOK_PLACE_AT` and `REFERENCES`. We need to also clear `WRITTEN_ABOUT`, `MENTIONS`, and `AUTHORED_BY` so that re-ingestion is idempotent.

**Step 1: Write the failing test**

Add to existing test file for local graph adapter (or neptune graph if mocked):

```python
# In tests/adapters/test_local_graph.py — add a test that verifies
# clear_story_entity_relationships clears person edges too.
# The exact test depends on the existing test structure.
# At minimum, verify the method includes the new relationship types.
```

Since both adapters hardcode the relationship types list, the change is mechanical:

**Step 2: Update neptune_graph.py**

In `services/core-api/app/adapters/neptune_graph.py`, line 168-171, change:

```python
        relationship_types = [
            self._rel_type("TOOK_PLACE_AT"),
            self._rel_type("REFERENCES"),
        ]
```

to:

```python
        relationship_types = [
            self._rel_type("TOOK_PLACE_AT"),
            self._rel_type("REFERENCES"),
            self._rel_type("WRITTEN_ABOUT"),
            self._rel_type("MENTIONS"),
            self._rel_type("AUTHORED_BY"),
        ]
```

**Step 3: Update local_graph.py**

In `services/core-api/app/adapters/local_graph.py`, line 123-126, change:

```python
        relationship_types = [
            self._rel_type("TOOK_PLACE_AT"),
            self._rel_type("REFERENCES"),
        ]
```

to:

```python
        relationship_types = [
            self._rel_type("TOOK_PLACE_AT"),
            self._rel_type("REFERENCES"),
            self._rel_type("WRITTEN_ABOUT"),
            self._rel_type("MENTIONS"),
            self._rel_type("AUTHORED_BY"),
        ]
```

**Step 4: Run existing adapter tests**

Run: `cd services/core-api && uv run pytest tests/adapters/test_local_graph.py tests/adapters/test_neptune_graph.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/adapters/neptune_graph.py services/core-api/app/adapters/local_graph.py
git commit -m "feat: clear person edges in clear_story_entity_relationships"
```

---

## Task 3: Add Person nodes and Story→Person edges to `_sync_entities_to_graph` ✅

**Files:**
- Modify: `services/core-api/app/services/ingestion.py:193-276`
- Test: `services/core-api/tests/services/test_ingestion.py`

Currently `_sync_entities_to_graph` processes places, events, and objects but skips people. We add person processing after the existing object loop.

**Step 1: Write the failing test**

Add to `tests/services/test_ingestion.py`:

```python
class TestSyncEntitiesToGraphPersons:
    """Test person entity sync to graph."""

    @pytest.mark.asyncio
    async def test_creates_person_nodes_and_edges(self) -> None:
        """Extracted people create Person nodes and Story→Person edges."""
        graph = AsyncMock()
        story_id = uuid4()
        legacy_id = uuid4()
        author_id = uuid4()

        entities = ExtractedEntities(
            people=[
                ExtractedEntity(name="Uncle Jim", context="uncle", confidence=0.8),
                ExtractedEntity(name="Sarah", context="friend", confidence=0.95),
            ],
        )

        await _sync_entities_to_graph(
            graph, story_id, legacy_id, entities,
            story_title="Remembering Sarah",
            author_id=author_id,
            legacy_person_id=str(legacy_id),
        )

        # Should upsert Person nodes for both extracted people
        person_calls = [
            c for c in graph.upsert_node.call_args_list
            if c.args[0] == "Person"
        ]
        assert len(person_calls) == 3  # 2 extracted + 1 author

        # Should create MENTIONS for Uncle Jim (not in title, confidence < 0.9)
        # Should create WRITTEN_ABOUT for Sarah (name in title)
        rel_calls = [
            c for c in graph.create_relationship.call_args_list
            if c.args[0] == "Story" and c.args[3] == "Person"
        ]
        rel_types = [c.args[2] for c in rel_calls]
        assert "MENTIONS" in rel_types
        assert "WRITTEN_ABOUT" in rel_types
        assert "AUTHORED_BY" in rel_types

    @pytest.mark.asyncio
    async def test_infers_person_to_person_relationship(self) -> None:
        """Extraction context 'uncle' creates FAMILY_OF edge."""
        graph = AsyncMock()
        story_id = uuid4()
        legacy_id = uuid4()

        entities = ExtractedEntities(
            people=[
                ExtractedEntity(name="Uncle Jim", context="uncle", confidence=0.8),
            ],
        )

        await _sync_entities_to_graph(
            graph, story_id, legacy_id, entities,
            story_title="A story",
            author_id=uuid4(),
            legacy_person_id=str(legacy_id),
        )

        # Should create FAMILY_OF edge between Uncle Jim and legacy person
        p2p_calls = [
            c for c in graph.create_relationship.call_args_list
            if c.args[0] == "Person" and c.args[3] == "Person"
        ]
        assert len(p2p_calls) == 1
        assert p2p_calls[0].args[2] == "FAMILY_OF"
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/services/test_ingestion.py::TestSyncEntitiesToGraphPersons -v`
Expected: FAIL — `_sync_entities_to_graph` doesn't accept new params yet

**Step 3: Modify `_sync_entities_to_graph` in `ingestion.py`**

Update the function signature at line 193 to accept new parameters:

```python
async def _sync_entities_to_graph(
    graph_adapter: GraphAdapter,
    story_id: UUID,
    legacy_id: UUID,
    entities: ExtractedEntities,
    *,
    story_title: str = "",
    author_id: UUID | None = None,
    legacy_person_id: str | None = None,
) -> None:
```

After the existing object loop (after line 256), add:

```python
        # --- Person nodes and Story→Person edges ---
        lid = str(legacy_id)

        for person in entities.people:
            person_id = normalize_person_id(person.name, lid)
            await graph_adapter.upsert_node(
                "Person",
                person_id,
                {
                    "name": person.name,
                    "legacy_id": lid,
                    "source": "extracted",
                },
            )

            edge_type = classify_story_person_edge(
                person.name, story_title, person.confidence
            )
            await graph_adapter.create_relationship(
                "Story", sid, edge_type, "Person", person_id,
                properties={"confidence": person.confidence},
            )

            # Infer Person→Person relationship from extraction context
            if legacy_person_id and person.context:
                rel_label = categorize_relationship(person.context)
                await graph_adapter.create_relationship(
                    "Person", person_id, rel_label, "Person", legacy_person_id,
                    properties={
                        "relationship_type": person.context,
                        "source": "extracted",
                    },
                )

        # --- AUTHORED_BY edge ---
        if author_id:
            author_node_id = f"user-{author_id}"
            await graph_adapter.upsert_node(
                "Person",
                author_node_id,
                {"user_id": str(author_id), "is_user": "true", "source": "declared"},
            )
            await graph_adapter.create_relationship(
                "Story", sid, "AUTHORED_BY", "Person", author_node_id,
            )
```

Add imports at top of `ingestion.py`:

```python
from .graph_sync import categorize_relationship, classify_story_person_edge, normalize_person_id
```

Update the telemetry counters (lines 258-263) to include people:

```python
        nodes_upserted = (
            1 + len(entities.places) + len(entities.events)
            + len(entities.objects) + len(entities.people)
            + (1 if author_id else 0)
        )
        edges_created = (
            len(entities.places) + len(entities.events)
            + len(entities.objects) + len(entities.people)
            + (1 if author_id else 0)
        )
```

Update the logger extra dict to include people count:

```python
            "people": len(entities.people),
```

**Step 4: Update the caller of `_sync_entities_to_graph`**

Find where `_sync_entities_to_graph` is called in `ingestion.py` (within `index_story_chunks`) and pass the new keyword arguments. The caller needs `story_title`, `author_id`, and `legacy_person_id`. These should come from the Story and Legacy models. Read the caller to determine exact parameters available — `index_story_chunks` receives `story_id`, `content`, `legacy_id`, `visibility`. You'll need to add `story_title`, `author_id`, and `legacy_person_id` as parameters to `index_story_chunks` as well, and pass them through from the route/service that calls it.

**Step 5: Run tests**

Run: `cd services/core-api && uv run pytest tests/services/test_ingestion.py -v`
Expected: All PASS (both new and existing)

**Step 6: Commit**

```bash
git add services/core-api/app/services/ingestion.py services/core-api/tests/services/test_ingestion.py
git commit -m "feat: sync extracted Person nodes and Story→Person edges to graph"
```

---

## Task 4: Add graph sync to member profile updates ✅

**Files:**
- Modify: `services/core-api/app/services/member_profile.py:51-82`
- Test: `services/core-api/tests/test_member_profile_service.py`

When a user sets `relationship_type` on their profile, sync a Person→Person edge to the graph.

**Step 1: Write the failing test**

Add to `tests/test_member_profile_service.py`:

```python
class TestUpdateProfileGraphSync:
    """Test graph sync on profile update."""

    @pytest.mark.asyncio
    async def test_syncs_relationship_to_graph(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ) -> None:
        """Setting relationship_type creates Person→Person graph edge."""
        # Ensure user is a member
        from app.models.legacy import LegacyMember
        member = LegacyMember(
            legacy_id=test_legacy.id, user_id=test_user.id, role="advocate"
        )
        db_session.add(member)
        await db_session.commit()

        data = MemberProfileUpdate(relationship_type="uncle")

        with patch("app.services.member_profile.get_provider_registry") as mock_reg:
            mock_graph = AsyncMock()
            mock_reg.return_value.get_graph_adapter.return_value = mock_graph

            await update_profile(db_session, test_legacy.id, test_user.id, data)

            # Should upsert Person nodes for user and legacy subject
            assert mock_graph.upsert_node.call_count >= 2

            # Should create FAMILY_OF edge (uncle → FAMILY_OF)
            rel_calls = [
                c for c in mock_graph.create_relationship.call_args_list
                if c.args[2] == "FAMILY_OF"
            ]
            assert len(rel_calls) == 1

    @pytest.mark.asyncio
    async def test_graph_failure_does_not_block_profile_update(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ) -> None:
        """Graph adapter errors are logged but don't fail the profile update."""
        from app.models.legacy import LegacyMember
        member = LegacyMember(
            legacy_id=test_legacy.id, user_id=test_user.id, role="advocate"
        )
        db_session.add(member)
        await db_session.commit()

        data = MemberProfileUpdate(relationship_type="friend")

        with patch("app.services.member_profile.get_provider_registry") as mock_reg:
            mock_graph = AsyncMock()
            mock_graph.upsert_node.side_effect = Exception("Neptune down")
            mock_reg.return_value.get_graph_adapter.return_value = mock_graph

            result = await update_profile(db_session, test_legacy.id, test_user.id, data)

            # Profile still updated despite graph failure
            assert result.relationship_type == "friend"
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/test_member_profile_service.py::TestUpdateProfileGraphSync -v`
Expected: FAIL — no graph sync logic exists yet

**Step 3: Modify `member_profile.py`**

Add imports:

```python
from ..providers.registry import get_provider_registry
from .graph_sync import categorize_relationship
```

After line 79 (the logger.info call) in `update_profile()`, add the graph sync:

```python
    # Best-effort graph sync for relationship edges
    try:
        registry = get_provider_registry()
        graph_adapter = registry.get_graph_adapter()
        if graph_adapter and existing.get("relationship_type"):
            await _sync_relationship_to_graph(
                graph_adapter, legacy_id, user_id, existing["relationship_type"]
            )
    except Exception:
        logger.warning(
            "member_profile.graph_sync_failed",
            extra={"legacy_id": str(legacy_id), "user_id": str(user_id)},
            exc_info=True,
        )
```

Add the helper function:

```python
async def _sync_relationship_to_graph(
    graph_adapter: object,
    legacy_id: UUID,
    user_id: UUID,
    relationship_type: str,
) -> None:
    """Sync a declared member relationship to the graph as a Person→Person edge."""
    from ..adapters.graph_adapter import GraphAdapter

    if not isinstance(graph_adapter, GraphAdapter):
        return

    user_node_id = f"user-{user_id}"
    legacy_node_id = str(legacy_id)  # Legacy's person_id used as node ID

    # Upsert Person nodes
    await graph_adapter.upsert_node(
        "Person", user_node_id,
        {"user_id": str(user_id), "is_user": "true", "source": "declared"},
    )
    await graph_adapter.upsert_node(
        "Person", legacy_node_id,
        {"legacy_id": str(legacy_id), "is_legacy": "true", "source": "declared"},
    )

    # Categorize and create edge
    edge_label = categorize_relationship(relationship_type)
    await graph_adapter.create_relationship(
        "Person", user_node_id, edge_label, "Person", legacy_node_id,
        properties={
            "relationship_type": relationship_type,
            "source": "declared",
        },
    )
```

Note: For idempotency, we should delete existing Person→Person edges between this user and legacy before creating the new one. This requires iterating through all 4 edge labels and calling `delete_relationship` for each, or adding a helper method. For simplicity in the first pass, `create_relationship` with the same properties is acceptable since relationships are directional and graph queries use the latest data. A cleanup can be added later if duplicate edges become an issue.

**Step 4: Run tests**

Run: `cd services/core-api && uv run pytest tests/test_member_profile_service.py -v`
Expected: All PASS

**Step 5: Run validation**

Run: `cd services/core-api && just validate-backend`
Expected: PASS (ruff + mypy)

**Step 6: Commit**

```bash
git add services/core-api/app/services/member_profile.py services/core-api/tests/test_member_profile_service.py
git commit -m "feat: sync declared member relationships to graph on profile update"
```

---

## Task 5: Update callers of `_sync_entities_to_graph` to pass new parameters ✅

**Files:**
- Modify: `services/core-api/app/services/ingestion.py` (the `index_story_chunks` function and its callers)
- Test: existing ingestion tests

The `_sync_entities_to_graph` function now accepts `story_title`, `author_id`, and `legacy_person_id`. We need to thread these through from wherever stories are ingested.

**Step 1: Read `index_story_chunks` to find how it calls `_sync_entities_to_graph`**

Look for the call site within `index_story_chunks` and trace back to the route that calls it. Add `story_title: str = ""`, `author_id: UUID | None = None`, and `legacy_person_id: str | None = None` as parameters to `index_story_chunks`, and pass them through.

**Step 2: Update the route/service that calls `index_story_chunks`**

The story creation/update route likely has access to the Story model (which has `title` and `author_id`) and can look up `legacy.person_id`. Pass these through.

**Step 3: Run all ingestion tests**

Run: `cd services/core-api && uv run pytest tests/services/test_ingestion.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add services/core-api/app/services/ingestion.py services/core-api/app/routes/
git commit -m "feat: thread story_title, author_id, legacy_person_id through ingestion"
```

---

## Task 6: Update backfill script for person entities ✅

**Files:**
- Modify: `services/core-api/scripts/backfill_entities.py`

The existing backfill script calls `_sync_entities_to_graph` but doesn't pass the new person-related parameters. Update it.

**Step 1: Modify `backfill_entities.py`**

In the story processing loop (around line 145), update the call to pass `story_title`, `author_id`, and `legacy_person_id`:

```python
                await _sync_entities_to_graph(
                    graph_adapter,
                    story.id,
                    primary.legacy_id,
                    filtered,
                    story_title=story.title,
                    author_id=story.author_id,
                    legacy_person_id=str(primary.legacy_id),
                )
```

Also update the entity count logging to include people:

```python
                entity_count = (
                    len(filtered.people)
                    + len(filtered.places)
                    + len(filtered.events)
                    + len(filtered.objects)
                )
```

Note: `filtered.people` was already populated by the extraction service — the backfill just wasn't syncing them to the graph.

**Step 2: Test with dry run**

Run: `cd services/core-api && uv run python scripts/backfill_entities.py --dry-run --limit 5`
Expected: Shows stories that would be processed (no actual graph writes)

**Step 3: Commit**

```bash
git add services/core-api/scripts/backfill_entities.py
git commit -m "feat: update entity backfill to include person nodes and relationships"
```

---

## Task 7: Create backfill script for declared member relationships ✅

**Files:**
- Create: `services/core-api/scripts/backfill_member_relationships.py`

This script iterates through all `legacy_members` with a `profile.relationship_type` set and syncs them as Person→Person edges in the graph.

**Step 1: Write the script**

```python
#!/usr/bin/env python
"""Backfill graph edges from existing member relationship profiles.

Usage:
    cd services/core-api
    uv run python scripts/backfill_member_relationships.py

Options:
    --dry-run    Show what would be processed without writing to graph
    --limit N    Only process N members (for testing)
"""

import argparse
import asyncio
import logging
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, ".")

from app.config import get_settings
from app.database import normalize_async_db_url
from app.models.legacy import LegacyMember
from app.services.graph_sync import categorize_relationship

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def backfill_member_relationships(
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    """Sync declared member relationships to the graph database."""
    settings = get_settings()

    if not settings.db_url:
        logger.error("DB_URL not configured")
        sys.exit(1)

    if not settings.graph_augmentation_enabled:
        logger.error("GRAPH_AUGMENTATION_ENABLED is false")
        sys.exit(1)

    try:
        db_url = normalize_async_db_url(settings.db_url)
    except ValueError:
        logger.error(f"Unsupported DB_URL format: {settings.db_url}")
        sys.exit(1)

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    from app.providers.registry import get_provider_registry

    registry = get_provider_registry()
    graph_adapter = registry.get_graph_adapter()
    if not graph_adapter:
        logger.error("Graph adapter not available")
        sys.exit(1)

    async with async_session() as db:
        query = (
            select(LegacyMember)
            .where(LegacyMember.role != "pending")
            .where(LegacyMember.profile.isnot(None))
        )
        if limit:
            query = query.limit(limit)

        result = await db.execute(query)
        members = result.scalars().all()
        total = len(members)

        logger.info(f"Found {total} members with profiles to process")

        if dry_run:
            for m in members:
                rt = (m.profile or {}).get("relationship_type", "none")
                logger.info(
                    f"[DRY RUN] user={m.user_id} legacy={m.legacy_id} "
                    f"relationship_type={rt} -> {categorize_relationship(rt)}"
                )
            return

        success = 0
        failed = 0

        for i, member in enumerate(members, 1):
            try:
                profile = member.profile or {}
                relationship_type = profile.get("relationship_type")
                if not relationship_type:
                    logger.info(f"[{i}/{total}] Skipping — no relationship_type")
                    continue

                user_node_id = f"user-{member.user_id}"
                legacy_node_id = str(member.legacy_id)
                edge_label = categorize_relationship(relationship_type)

                logger.info(
                    f"[{i}/{total}] user={member.user_id} "
                    f"legacy={member.legacy_id} "
                    f"{relationship_type} -> {edge_label}"
                )

                await graph_adapter.upsert_node(
                    "Person", user_node_id,
                    {"user_id": str(member.user_id), "is_user": "true", "source": "declared"},
                )
                await graph_adapter.upsert_node(
                    "Person", legacy_node_id,
                    {"legacy_id": str(member.legacy_id), "is_legacy": "true", "source": "declared"},
                )
                await graph_adapter.create_relationship(
                    "Person", user_node_id, edge_label, "Person", legacy_node_id,
                    properties={
                        "relationship_type": relationship_type,
                        "source": "declared",
                    },
                )

                success += 1
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"  Failed: {e}")
                failed += 1
                continue

        logger.info(f"Backfill complete: {success} succeeded, {failed} failed")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill member relationships to graph")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    asyncio.run(backfill_member_relationships(dry_run=args.dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
```

**Step 2: Test with dry run**

Run: `cd services/core-api && uv run python scripts/backfill_member_relationships.py --dry-run --limit 5`
Expected: Lists members and their relationship categorizations without writing

**Step 3: Commit**

```bash
git add services/core-api/scripts/backfill_member_relationships.py
git commit -m "feat: add backfill script for declared member relationships to graph"
```

---

## Task 8: Run validation and final tests ✅

**Files:** None (verification only)

**Step 1: Run full backend validation**

Run: `cd services/core-api && just validate-backend`
Expected: PASS (ruff + mypy)

**Step 2: Run all related tests**

Run: `cd services/core-api && uv run pytest tests/services/test_graph_sync.py tests/services/test_ingestion.py tests/test_member_profile_service.py tests/adapters/test_local_graph.py tests/adapters/test_neptune_graph.py -v`
Expected: All PASS

**Step 3: Run full test suite**

Run: `cd services/core-api && uv run pytest --tb=short`
Expected: All PASS, no regressions

**Step 4: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix: address validation and test issues from graph model expansion"
```
