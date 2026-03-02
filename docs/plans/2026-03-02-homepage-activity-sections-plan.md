# Homepage Activity Sections Implementation Plan

> **Status: COMPLETED** — All 15 tasks implemented and verified on 2026-03-02.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new homepage sections for authenticated users — a social activity feed (non-ephemeral actions from the user and legacy co-members), and two "recently viewed" card sections for legacies and stories.

**Architecture:** New `GET /api/activity/feed` endpoint with social query (legacy membership-scoped) and entity enrichment. Enhanced `GET /api/activity/recent` with action filter and entity enrichment. Three new React components following the existing `FavoritesSection` pattern.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Pydantic v2, React, TanStack Query, Tailwind CSS, Lucide icons, date-fns

**Design Doc:** `docs/plans/2026-03-02-homepage-activity-sections-design.md`

---

### Task 1: Backend Schemas — Social Feed & Enriched Recent Items

**Files:**
- Modify: `services/core-api/app/schemas/activity.py`

**Step 1: Add new schemas to the activity schemas file**

Modify `services/core-api/app/schemas/activity.py` — add these schemas after the existing `CleanupResponse`:

```python
class ActorSummary(BaseModel):
    """Minimal user info for social feed items."""

    id: UUID
    name: str
    avatar_url: str | None = None


class EntitySummary(BaseModel):
    """Summary of an entity referenced by activity."""

    name: str | None = None
    title: str | None = None
    profile_image_url: str | None = None
    content_preview: str | None = None
    biography: str | None = None
    visibility: str | None = None
    birth_date: str | None = None
    death_date: str | None = None
    filename: str | None = None
    author_name: str | None = None
    legacy_id: str | None = None
    legacy_name: str | None = None


class SocialFeedItem(BaseModel):
    """A single item in the social activity feed."""

    id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    created_at: datetime
    metadata: dict[str, Any] | None = None
    actor: ActorSummary
    entity: EntitySummary | None = None


class SocialFeedResponse(BaseModel):
    """Response from the social feed endpoint."""

    items: list[SocialFeedItem]
    next_cursor: str | None = Field(
        default=None, description="ISO timestamp cursor for next page"
    )
    has_more: bool = False


class EnrichedRecentItem(BaseModel):
    """A recent item with full entity details."""

    entity_type: str
    entity_id: UUID
    last_action: str
    last_activity_at: datetime
    metadata: dict[str, Any] | None = None
    entity: EntitySummary | None = None


class EnrichedRecentItemsResponse(BaseModel):
    """Response from the enriched recent items endpoint."""

    items: list[EnrichedRecentItem]
    tracking_enabled: bool = True
```

**Step 2: Verify schemas load**

Run: `cd services/core-api && uv run python -c "from app.schemas.activity import SocialFeedResponse, EnrichedRecentItemsResponse; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add services/core-api/app/schemas/activity.py
git commit -m "feat(activity): add schemas for social feed and enriched recent items"
```

---

### Task 2: Backend Service — Entity Enrichment Helper

**Files:**
- Modify: `services/core-api/app/services/activity.py`

**Step 1: Write the failing test for entity enrichment**

Create `services/core-api/tests/test_activity_enrichment.py`:

```python
"""Tests for activity entity enrichment."""

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.associations import StoryLegacy
from app.models.story_version import StoryVersion
from app.models.person import Person
from app.models.user import User
from app.services.activity import enrich_entities


@pytest_asyncio.fixture
async def enrichment_user(db_session: AsyncSession) -> User:
    """Create a user for enrichment tests."""
    user = User(
        email="enrich@example.com",
        google_id="google_enrich_123",
        name="Enrichment User",
        avatar_url="https://example.com/enrich.jpg",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def enrichment_legacy(
    db_session: AsyncSession, enrichment_user: User
) -> Legacy:
    """Create a legacy for enrichment tests."""
    person = Person(canonical_name="Enrichment Legacy")
    db_session.add(person)
    await db_session.flush()

    legacy = Legacy(
        name="Enrichment Legacy",
        biography="A test legacy for enrichment",
        birth_date=None,
        death_date=None,
        visibility="public",
        created_by=enrichment_user.id,
        person_id=person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    member = LegacyMember(
        legacy_id=legacy.id,
        user_id=enrichment_user.id,
        role="creator",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


@pytest_asyncio.fixture
async def enrichment_story(
    db_session: AsyncSession, enrichment_user: User, enrichment_legacy: Legacy
) -> Story:
    """Create a story for enrichment tests."""
    story = Story(
        author_id=enrichment_user.id,
        title="Enrichment Story",
        content="Content for enrichment testing.",
        visibility="public",
    )
    db_session.add(story)
    await db_session.flush()

    sl = StoryLegacy(
        story_id=story.id,
        legacy_id=enrichment_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(sl)

    version = StoryVersion(
        story_id=story.id,
        version_number=1,
        title=story.title,
        content=story.content,
        status="active",
        source="manual_edit",
        change_summary="Initial version",
        created_by=enrichment_user.id,
    )
    db_session.add(version)
    await db_session.flush()
    story.active_version_id = version.id
    await db_session.commit()
    await db_session.refresh(story)
    return story


class TestEnrichEntities:
    @pytest.mark.asyncio
    async def test_enriches_legacy(
        self, db_session: AsyncSession, enrichment_legacy: Legacy
    ):
        result = await enrich_entities(
            db=db_session,
            items=[("legacy", enrichment_legacy.id)],
        )
        entity = result.get(("legacy", enrichment_legacy.id))
        assert entity is not None
        assert entity["name"] == "Enrichment Legacy"
        assert entity["visibility"] == "public"

    @pytest.mark.asyncio
    async def test_enriches_story(
        self,
        db_session: AsyncSession,
        enrichment_story: Story,
        enrichment_legacy: Legacy,
        enrichment_user: User,
    ):
        result = await enrich_entities(
            db=db_session,
            items=[("story", enrichment_story.id)],
        )
        entity = result.get(("story", enrichment_story.id))
        assert entity is not None
        assert entity["title"] == "Enrichment Story"
        assert entity["legacy_id"] == str(enrichment_legacy.id)

    @pytest.mark.asyncio
    async def test_returns_none_for_deleted_entity(
        self, db_session: AsyncSession
    ):
        result = await enrich_entities(
            db=db_session,
            items=[("legacy", uuid4())],
        )
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_handles_empty_input(self, db_session: AsyncSession):
        result = await enrich_entities(db=db_session, items=[])
        assert result == {}
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/test_activity_enrichment.py -v`
Expected: FAIL — `ImportError: cannot import name 'enrich_entities'`

**Step 3: Write the entity enrichment function**

Add to `services/core-api/app/services/activity.py` — add these imports at the top:

```python
from ..models.associations import StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.story import Story
```

Then add this function after the existing `run_retention_cleanup` function:

```python
async def enrich_entities(
    db: AsyncSession,
    items: list[tuple[str, UUID]],
) -> dict[tuple[str, UUID], dict[str, Any]]:
    """Batch-load entity details for activity items.

    Returns a dict keyed by (entity_type, entity_id) with entity summary dicts.
    Missing entities (deleted) are omitted from the result.
    """
    if not items:
        return {}

    result: dict[tuple[str, UUID], dict[str, Any]] = {}

    # Group by entity type for batch queries
    legacy_ids = [eid for etype, eid in items if etype == "legacy"]
    story_ids = [eid for etype, eid in items if etype == "story"]

    # Enrich legacies
    if legacy_ids:
        rows = await db.execute(
            select(Legacy).where(Legacy.id.in_(legacy_ids))
        )
        for legacy in rows.scalars().all():
            result[("legacy", legacy.id)] = {
                "name": legacy.name,
                "profile_image_url": legacy.profile_image_url,
                "biography": legacy.biography,
                "visibility": legacy.visibility,
                "birth_date": str(legacy.birth_date) if legacy.birth_date else None,
                "death_date": str(legacy.death_date) if legacy.death_date else None,
            }

    # Enrich stories (with primary legacy info and author name)
    if story_ids:
        rows = await db.execute(
            select(Story).where(Story.id.in_(story_ids))
        )
        stories = list(rows.scalars().all())

        # Get primary legacy associations for these stories
        if stories:
            sl_rows = await db.execute(
                select(StoryLegacy, Legacy.id, Legacy.name)
                .join(Legacy, StoryLegacy.legacy_id == Legacy.id)
                .where(
                    StoryLegacy.story_id.in_([s.id for s in stories]),
                    StoryLegacy.role == "primary",
                )
            )
            # Build story_id -> (legacy_id, legacy_name) map
            story_legacy_map: dict[UUID, tuple[str, str]] = {}
            for sl, leg_id, leg_name in sl_rows.all():
                story_legacy_map[sl.story_id] = (str(leg_id), leg_name)

            # Get author names
            author_ids = list({s.author_id for s in stories})
            author_rows = await db.execute(
                select(User.id, User.name).where(User.id.in_(author_ids))
            )
            author_map: dict[UUID, str] = {
                uid: name or "" for uid, name in author_rows.all()
            }

            for story in stories:
                legacy_info = story_legacy_map.get(story.id)
                content_preview = (story.content or "")[:200]
                result[("story", story.id)] = {
                    "title": story.title,
                    "content_preview": content_preview,
                    "visibility": story.visibility,
                    "author_name": author_map.get(story.author_id, ""),
                    "legacy_id": legacy_info[0] if legacy_info else None,
                    "legacy_name": legacy_info[1] if legacy_info else None,
                }

    return result
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/test_activity_enrichment.py -v`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add services/core-api/app/services/activity.py services/core-api/tests/test_activity_enrichment.py
git commit -m "feat(activity): add entity enrichment helper for activity feed"
```

---

### Task 3: Backend Service — Social Feed Query

**Files:**
- Modify: `services/core-api/app/services/activity.py`

**Step 1: Write the failing tests for the social feed**

Create `services/core-api/tests/test_activity_social_feed.py`:

```python
"""Tests for social activity feed."""

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.person import Person
from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.services import activity as activity_service


@pytest_asyncio.fixture
async def user_alice(db_session: AsyncSession) -> User:
    """Create user Alice."""
    user = User(
        email="alice@example.com",
        google_id="google_alice",
        name="Alice",
        avatar_url="https://example.com/alice.jpg",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_bob(db_session: AsyncSession) -> User:
    """Create user Bob."""
    user = User(
        email="bob@example.com",
        google_id="google_bob",
        name="Bob",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_eve(db_session: AsyncSession) -> User:
    """Create user Eve (not a member of any shared legacy)."""
    user = User(
        email="eve@example.com",
        google_id="google_eve",
        name="Eve",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def shared_legacy(
    db_session: AsyncSession, user_alice: User, user_bob: User
) -> Legacy:
    """Create a legacy where Alice and Bob are both members."""
    person = Person(canonical_name="Shared Legacy")
    db_session.add(person)
    await db_session.flush()

    legacy = Legacy(
        name="Shared Legacy",
        biography="Shared between Alice and Bob",
        visibility="public",
        created_by=user_alice.id,
        person_id=person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    for uid, role in [(user_alice.id, "creator"), (user_bob.id, "advocate")]:
        db_session.add(
            LegacyMember(legacy_id=legacy.id, user_id=uid, role=role)
        )
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


@pytest_asyncio.fixture
async def shared_story(
    db_session: AsyncSession, user_bob: User, shared_legacy: Legacy
) -> Story:
    """Create a story by Bob linked to the shared legacy."""
    story = Story(
        author_id=user_bob.id,
        title="Bob's Story",
        content="Story content from Bob.",
        visibility="public",
    )
    db_session.add(story)
    await db_session.flush()

    sl = StoryLegacy(
        story_id=story.id,
        legacy_id=shared_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(sl)

    version = StoryVersion(
        story_id=story.id,
        version_number=1,
        title=story.title,
        content=story.content,
        status="active",
        source="manual_edit",
        change_summary="Initial version",
        created_by=user_bob.id,
    )
    db_session.add(version)
    await db_session.flush()
    story.active_version_id = version.id
    await db_session.commit()
    await db_session.refresh(story)
    return story


class TestGetSocialFeed:
    @pytest.mark.asyncio
    async def test_shows_own_activity(
        self, db_session: AsyncSession, user_alice: User, shared_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=user_alice.id,
            action="created",
            entity_type="legacy",
            entity_id=shared_legacy.id,
            metadata={"name": "Shared Legacy"},
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["action"] == "created"
        assert result["items"][0]["actor"]["name"] == "Alice"

    @pytest.mark.asyncio
    async def test_shows_co_member_legacy_activity(
        self,
        db_session: AsyncSession,
        user_alice: User,
        user_bob: User,
        shared_legacy: Legacy,
    ):
        # Bob updates the shared legacy
        await activity_service.record_activity(
            db=db_session,
            user_id=user_bob.id,
            action="updated",
            entity_type="legacy",
            entity_id=shared_legacy.id,
            metadata={"name": "Shared Legacy"},
        )
        # Alice should see Bob's action
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["actor"]["name"] == "Bob"

    @pytest.mark.asyncio
    async def test_shows_co_member_story_activity(
        self,
        db_session: AsyncSession,
        user_alice: User,
        user_bob: User,
        shared_legacy: Legacy,
        shared_story: Story,
    ):
        # Bob creates a story on shared legacy
        await activity_service.record_activity(
            db=db_session,
            user_id=user_bob.id,
            action="created",
            entity_type="story",
            entity_id=shared_story.id,
            metadata={"title": "Bob's Story"},
        )
        # Alice should see it
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["entity_type"] == "story"

    @pytest.mark.asyncio
    async def test_excludes_viewed_actions(
        self, db_session: AsyncSession, user_alice: User, shared_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=user_alice.id,
            action="viewed",
            entity_type="legacy",
            entity_id=shared_legacy.id,
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 0

    @pytest.mark.asyncio
    async def test_excludes_non_member_activity(
        self,
        db_session: AsyncSession,
        user_alice: User,
        user_eve: User,
        shared_legacy: Legacy,
    ):
        # Eve (not a member) does something on another legacy
        other_person = Person(canonical_name="Eve Legacy")
        db_session.add(other_person)
        await db_session.flush()

        eve_legacy = Legacy(
            name="Eve's Legacy",
            visibility="public",
            created_by=user_eve.id,
            person_id=other_person.id,
        )
        db_session.add(eve_legacy)
        await db_session.flush()

        db_session.add(
            LegacyMember(
                legacy_id=eve_legacy.id, user_id=user_eve.id, role="creator"
            )
        )
        await db_session.commit()

        await activity_service.record_activity(
            db=db_session,
            user_id=user_eve.id,
            action="created",
            entity_type="legacy",
            entity_id=eve_legacy.id,
        )
        # Alice should NOT see Eve's activity
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 0

    @pytest.mark.asyncio
    async def test_includes_enriched_entity_data(
        self, db_session: AsyncSession, user_alice: User, shared_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=user_alice.id,
            action="updated",
            entity_type="legacy",
            entity_id=shared_legacy.id,
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert result["items"][0]["entity"] is not None
        assert result["items"][0]["entity"]["name"] == "Shared Legacy"

    @pytest.mark.asyncio
    async def test_pagination(
        self,
        db_session: AsyncSession,
        user_alice: User,
        shared_legacy: Legacy,
    ):
        for i in range(4):
            await activity_service.record_activity(
                db=db_session,
                user_id=user_alice.id,
                action="updated",
                entity_type="legacy",
                entity_id=shared_legacy.id,
                metadata={"index": i},
            )
        page1 = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id, limit=2
        )
        assert len(page1["items"]) == 2
        assert page1["has_more"] is True

        from datetime import datetime

        cursor = datetime.fromisoformat(page1["next_cursor"])
        page2 = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id, limit=2, cursor=cursor
        )
        assert len(page2["items"]) == 2
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/test_activity_social_feed.py -v`
Expected: FAIL — `AttributeError: module 'app.services.activity' has no attribute 'get_social_feed'`

**Step 3: Write the social feed service function**

Add to `services/core-api/app/services/activity.py`, after the `enrich_entities` function:

```python
async def get_social_feed(
    db: AsyncSession,
    user_id: UUID,
    cursor: datetime | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Get social activity feed — own actions + co-member actions on shared legacies.

    Excludes 'viewed' (ephemeral) actions. Enriches items with actor and entity data.
    """
    # Check if tracking is enabled
    user_result = await db.execute(select(User.preferences).where(User.id == user_id))
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {"items": [], "has_more": False, "next_cursor": None}

    # 1. Find all legacy IDs the user is a member of
    membership_result = await db.execute(
        select(LegacyMember.legacy_id).where(LegacyMember.user_id == user_id)
    )
    my_legacy_ids = [row[0] for row in membership_result.all()]

    if not my_legacy_ids:
        return {"items": [], "has_more": False, "next_cursor": None}

    # 2. Find story IDs linked to those legacies
    story_result = await db.execute(
        select(StoryLegacy.story_id).where(
            StoryLegacy.legacy_id.in_(my_legacy_ids)
        )
    )
    related_story_ids = [row[0] for row in story_result.all()]

    # 3. Build activity query: legacy actions on my legacies + story actions on related stories
    from sqlalchemy import or_

    scope_filters = [
        (UserActivity.entity_type == "legacy")
        & (UserActivity.entity_id.in_(my_legacy_ids)),
    ]
    if related_story_ids:
        scope_filters.append(
            (UserActivity.entity_type == "story")
            & (UserActivity.entity_id.in_(related_story_ids))
        )
    # Also include the user's own media/conversation activity
    scope_filters.append(
        (UserActivity.user_id == user_id)
        & (UserActivity.entity_type.in_(["media", "conversation"]))
    )

    filters = [
        or_(*scope_filters),
        UserActivity.action != "viewed",  # Exclude ephemeral
    ]
    if cursor:
        filters.append(UserActivity.created_at < cursor)

    query = (
        select(UserActivity)
        .where(*filters)
        .order_by(UserActivity.created_at.desc())
        .limit(limit + 1)
    )

    result = await db.execute(query)
    activities = list(result.scalars().all())

    has_more = len(activities) > limit
    if has_more:
        activities = activities[:limit]

    next_cursor = (
        activities[-1].created_at.isoformat() if activities and has_more else None
    )

    # 4. Batch-load actor info
    actor_ids = list({a.user_id for a in activities})
    actor_map: dict[UUID, dict[str, Any]] = {}
    if actor_ids:
        actor_rows = await db.execute(
            select(User.id, User.name, User.avatar_url).where(User.id.in_(actor_ids))
        )
        for uid, name, avatar_url in actor_rows.all():
            actor_map[uid] = {
                "id": uid,
                "name": name or "",
                "avatar_url": avatar_url,
            }

    # 5. Batch-load entity details
    entity_keys = [(a.entity_type, a.entity_id) for a in activities]
    entity_map = await enrich_entities(db=db, items=entity_keys)

    # 6. Build response items
    items = []
    for a in activities:
        entity_data = entity_map.get((a.entity_type, a.entity_id))
        items.append(
            {
                "id": a.id,
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "created_at": a.created_at,
                "metadata": a.metadata_,
                "actor": actor_map.get(a.user_id, {"id": a.user_id, "name": "", "avatar_url": None}),
                "entity": entity_data,
            }
        )

    return {"items": items, "has_more": has_more, "next_cursor": next_cursor}
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/test_activity_social_feed.py -v`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add services/core-api/app/services/activity.py services/core-api/tests/test_activity_social_feed.py
git commit -m "feat(activity): add social feed service with co-member activity"
```

---

### Task 4: Backend Service — Enhanced Recent Items with Action Filter & Enrichment

**Files:**
- Modify: `services/core-api/app/services/activity.py`

**Step 1: Write the failing tests**

Create `services/core-api/tests/test_activity_enriched_recent.py`:

```python
"""Tests for enriched recent items with action filter."""

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.person import Person
from app.models.user import User
from app.services import activity as activity_service


@pytest_asyncio.fixture
async def recent_user(db_session: AsyncSession) -> User:
    """Create a user for recent items tests."""
    user = User(
        email="recent@example.com",
        google_id="google_recent_123",
        name="Recent User",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def recent_legacy(
    db_session: AsyncSession, recent_user: User
) -> Legacy:
    """Create a legacy for recent items tests."""
    person = Person(canonical_name="Recent Legacy")
    db_session.add(person)
    await db_session.flush()

    legacy = Legacy(
        name="Recent Legacy",
        biography="A test legacy",
        visibility="public",
        created_by=recent_user.id,
        person_id=person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    db_session.add(
        LegacyMember(
            legacy_id=legacy.id, user_id=recent_user.id, role="creator"
        )
    )
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


class TestGetEnrichedRecentItems:
    @pytest.mark.asyncio
    async def test_filters_by_action(
        self, db_session: AsyncSession, recent_user: User, recent_legacy: Legacy
    ):
        # Record a view and a create
        await activity_service.record_activity(
            db=db_session,
            user_id=recent_user.id,
            action="viewed",
            entity_type="legacy",
            entity_id=recent_legacy.id,
        )
        await activity_service.record_activity(
            db=db_session,
            user_id=recent_user.id,
            action="created",
            entity_type="legacy",
            entity_id=recent_legacy.id,
        )

        # Filter by viewed only
        result = await activity_service.get_enriched_recent_items(
            db=db_session, user_id=recent_user.id, action="viewed"
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["last_action"] == "viewed"

    @pytest.mark.asyncio
    async def test_enriches_entity_data(
        self, db_session: AsyncSession, recent_user: User, recent_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=recent_user.id,
            action="viewed",
            entity_type="legacy",
            entity_id=recent_legacy.id,
        )
        result = await activity_service.get_enriched_recent_items(
            db=db_session,
            user_id=recent_user.id,
            action="viewed",
            entity_type="legacy",
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["entity"] is not None
        assert result["items"][0]["entity"]["name"] == "Recent Legacy"

    @pytest.mark.asyncio
    async def test_returns_empty_when_tracking_disabled(
        self, db_session: AsyncSession
    ):
        user = User(
            email="norecenttrack@example.com",
            google_id="google_norecent",
            name="No Track",
            preferences={"activity_tracking_enabled": False},
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        result = await activity_service.get_enriched_recent_items(
            db=db_session, user_id=user.id, action="viewed"
        )
        assert result["items"] == []
        assert result["tracking_enabled"] is False
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/test_activity_enriched_recent.py -v`
Expected: FAIL — `AttributeError: module 'app.services.activity' has no attribute 'get_enriched_recent_items'`

**Step 3: Write the enriched recent items function**

Add to `services/core-api/app/services/activity.py`, after the `get_social_feed` function:

```python
async def get_enriched_recent_items(
    db: AsyncSession,
    user_id: UUID,
    action: str | None = None,
    entity_type: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Get deduplicated recent items with entity enrichment.

    Like get_recent_items but with optional action filter and entity data.
    """
    # Check if tracking is enabled
    user_result = await db.execute(select(User.preferences).where(User.id == user_id))
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {"items": [], "tracking_enabled": False}

    filters = [UserActivity.user_id == user_id]
    if entity_type:
        filters.append(UserActivity.entity_type == entity_type)
    if action:
        filters.append(UserActivity.action == action)

    subq = (
        select(
            UserActivity.entity_type,
            UserActivity.entity_id,
            func.max(UserActivity.created_at).label("last_activity_at"),
        )
        .where(*filters)
        .group_by(UserActivity.entity_type, UserActivity.entity_id)
        .order_by(func.max(UserActivity.created_at).desc())
        .limit(limit)
        .subquery()
    )

    query = (
        select(UserActivity)
        .join(
            subq,
            (UserActivity.entity_type == subq.c.entity_type)
            & (UserActivity.entity_id == subq.c.entity_id)
            & (UserActivity.created_at == subq.c.last_activity_at),
        )
        .where(UserActivity.user_id == user_id)
        .order_by(UserActivity.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(query)
    activities = list(result.scalars().unique().all())

    # Enrich entities
    entity_keys = [(a.entity_type, a.entity_id) for a in activities]
    entity_map = await enrich_entities(db=db, items=entity_keys)

    items = [
        {
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "last_action": a.action,
            "last_activity_at": a.created_at,
            "metadata": a.metadata_,
            "entity": entity_map.get((a.entity_type, a.entity_id)),
        }
        for a in activities
    ]

    return {"items": items, "tracking_enabled": True}
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/test_activity_enriched_recent.py -v`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add services/core-api/app/services/activity.py services/core-api/tests/test_activity_enriched_recent.py
git commit -m "feat(activity): add enriched recent items with action filter"
```

---

### Task 5: Backend Routes — Social Feed & Enriched Recent Endpoints

**Files:**
- Modify: `services/core-api/app/routes/activity.py`
- Modify: `services/core-api/app/main.py`

**Step 1: Write the failing route tests**

Create `services/core-api/tests/test_activity_feed_routes.py`:

```python
"""Tests for social feed and enriched recent items API routes."""

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.person import Person
from app.models.user import User
from app.services import activity as activity_service
from tests.conftest import create_auth_headers_for_user


@pytest_asyncio.fixture
async def feed_user(db_session: AsyncSession) -> User:
    """Create a user for feed tests."""
    user = User(
        email="feeduser@example.com",
        google_id="google_feeduser",
        name="Feed User",
        avatar_url="https://example.com/feed.jpg",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def feed_legacy(
    db_session: AsyncSession, feed_user: User
) -> Legacy:
    """Create a legacy for feed tests."""
    person = Person(canonical_name="Feed Legacy")
    db_session.add(person)
    await db_session.flush()

    legacy = Legacy(
        name="Feed Legacy",
        biography="Test",
        visibility="public",
        created_by=feed_user.id,
        person_id=person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    db_session.add(
        LegacyMember(
            legacy_id=legacy.id, user_id=feed_user.id, role="creator"
        )
    )
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


class TestSocialFeedRoute:
    @pytest.mark.asyncio
    async def test_returns_feed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        feed_user: User,
        feed_legacy: Legacy,
    ):
        headers = create_auth_headers_for_user(feed_user)
        await activity_service.record_activity(
            db=db_session,
            user_id=feed_user.id,
            action="created",
            entity_type="legacy",
            entity_id=feed_legacy.id,
            metadata={"name": "Feed Legacy"},
        )

        response = await client.get("/api/activity/feed", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["actor"]["name"] == "Feed User"
        assert data["items"][0]["entity"]["name"] == "Feed Legacy"

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/activity/feed")
        assert response.status_code == 401


class TestEnrichedRecentRoute:
    @pytest.mark.asyncio
    async def test_returns_enriched_items(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        feed_user: User,
        feed_legacy: Legacy,
    ):
        headers = create_auth_headers_for_user(feed_user)
        await activity_service.record_activity(
            db=db_session,
            user_id=feed_user.id,
            action="viewed",
            entity_type="legacy",
            entity_id=feed_legacy.id,
        )

        response = await client.get(
            "/api/activity/recent/enriched?action=viewed&entity_type=legacy&limit=4",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["entity"]["name"] == "Feed Legacy"

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/activity/recent/enriched")
        assert response.status_code == 401
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/test_activity_feed_routes.py -v`
Expected: FAIL — 404 for the new endpoints.

**Step 3: Add the new routes**

Modify `services/core-api/app/routes/activity.py`:

Add these imports to the existing imports at the top:

```python
from ..schemas.activity import (
    ActivityFeedResponse,
    ActivityItem,
    CleanupResponse,
    EnrichedRecentItemsResponse,
    RecentItemsResponse,
    SocialFeedResponse,
)
```

(This replaces the existing import block — just add `EnrichedRecentItemsResponse` and `SocialFeedResponse` to the existing import list.)

Add these route handlers after the existing `get_recent_items` route (before the `DELETE` route):

```python
@router.get("/feed", response_model=SocialFeedResponse)
async def get_social_feed(
    request: Request,
    cursor: str | None = Query(None, description="ISO timestamp cursor for pagination"),
    limit: int = Query(5, ge=1, le=20, description="Max items to return"),
    db: AsyncSession = Depends(get_db),
) -> SocialFeedResponse:
    """Get the social activity feed — own + co-member actions on shared legacies."""
    session = require_auth(request)

    cursor_dt = None
    if cursor:
        cursor_dt = datetime.fromisoformat(cursor)

    result = await activity_service.get_social_feed(
        db=db,
        user_id=session.user_id,
        cursor=cursor_dt,
        limit=limit,
    )
    return SocialFeedResponse(**result)


@router.get("/recent/enriched", response_model=EnrichedRecentItemsResponse)
async def get_enriched_recent_items(
    request: Request,
    entity_type: EntityTypeParam | None = Query(
        None, description="Filter by entity type"
    ),
    action: str | None = Query(None, description="Filter by action type"),
    limit: int = Query(10, ge=1, le=50, description="Max items to return"),
    db: AsyncSession = Depends(get_db),
) -> EnrichedRecentItemsResponse:
    """Get recent items with entity enrichment and optional action filter."""
    session = require_auth(request)

    result = await activity_service.get_enriched_recent_items(
        db=db,
        user_id=session.user_id,
        action=action,
        entity_type=entity_type,
        limit=limit,
    )
    return EnrichedRecentItemsResponse(**result)
```

**Important:** The `/feed` and `/recent/enriched` routes must be registered BEFORE the `DELETE ""` route, but they are on the same router so no changes to `main.py` are needed.

**Step 4: Run route tests**

Run: `cd services/core-api && uv run pytest tests/test_activity_feed_routes.py -v`
Expected: All 4 tests PASS.

**Step 5: Run all existing activity tests to check for regressions**

Run: `cd services/core-api && uv run pytest tests/test_activity_service.py tests/test_activity_routes.py tests/test_activity_privacy.py -v`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add services/core-api/app/routes/activity.py services/core-api/tests/test_activity_feed_routes.py
git commit -m "feat(activity): add social feed and enriched recent items API routes"
```

---

### Task 6: Backend Validation

**Files:** None — validation only.

**Step 1: Run backend validation**

Run: `just validate-backend`
Expected: All checks pass.

Common issues to fix:
- Import ordering for `from sqlalchemy import or_` may need to move to top of file
- The `or_` import inside the function should be moved to file-level imports
- Any ruff formatting issues

**Step 2: Fix any issues and re-run**

Run: `just validate-backend`
Expected: Clean pass.

**Step 3: Run full test suite**

Run: `cd services/core-api && uv run pytest -v`
Expected: All tests PASS.

**Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix(activity): address linting issues in social feed implementation"
```

---

### Task 7: Frontend — API Client & Types

**Files:**
- Create: `apps/web/src/features/activity/api/activity.ts`

**Step 1: Create the activity API client**

Create the directory and file `apps/web/src/features/activity/api/activity.ts`:

```typescript
import { apiGet } from '@/lib/api/client';

export interface ActorSummary {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface EntitySummary {
  name?: string | null;
  title?: string | null;
  profile_image_url?: string | null;
  content_preview?: string | null;
  biography?: string | null;
  visibility?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  filename?: string | null;
  author_name?: string | null;
  legacy_id?: string | null;
  legacy_name?: string | null;
}

export interface SocialFeedItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor: ActorSummary;
  entity: EntitySummary | null;
}

export interface SocialFeedResponse {
  items: SocialFeedItem[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface EnrichedRecentItem {
  entity_type: string;
  entity_id: string;
  last_action: string;
  last_activity_at: string;
  metadata: Record<string, unknown> | null;
  entity: EntitySummary | null;
}

export interface EnrichedRecentItemsResponse {
  items: EnrichedRecentItem[];
  tracking_enabled: boolean;
}

export async function getSocialFeed(
  limit = 5,
  cursor?: string,
): Promise<SocialFeedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiGet<SocialFeedResponse>(`/api/activity/feed?${params}`);
}

export async function getRecentlyViewed(
  entityType: string,
  limit = 4,
): Promise<EnrichedRecentItemsResponse> {
  const params = new URLSearchParams({
    action: 'viewed',
    entity_type: entityType,
    limit: String(limit),
  });
  return apiGet<EnrichedRecentItemsResponse>(
    `/api/activity/recent/enriched?${params}`,
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/activity/api/activity.ts
git commit -m "feat(activity): add frontend API client for social feed and recent items"
```

---

### Task 8: Frontend — TanStack Query Hooks

**Files:**
- Create: `apps/web/src/features/activity/hooks/useActivity.ts`

**Step 1: Create the hooks file**

Create `apps/web/src/features/activity/hooks/useActivity.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getSocialFeed, getRecentlyViewed } from '../api/activity';

export const activityKeys = {
  all: ['activity'] as const,
  socialFeed: () => [...activityKeys.all, 'social-feed'] as const,
  recentViewed: (entityType: string) =>
    [...activityKeys.all, 'recent-viewed', entityType] as const,
};

export function useSocialFeed(limit = 5) {
  return useQuery({
    queryKey: activityKeys.socialFeed(),
    queryFn: () => getSocialFeed(limit),
  });
}

export function useRecentlyViewed(entityType: 'legacy' | 'story', limit = 4) {
  return useQuery({
    queryKey: activityKeys.recentViewed(entityType),
    queryFn: () => getRecentlyViewed(entityType, limit),
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/activity/hooks/useActivity.ts
git commit -m "feat(activity): add TanStack Query hooks for activity feed"
```

---

### Task 9: Frontend — ActivityFeedItem Component

**Files:**
- Create: `apps/web/src/features/activity/components/ActivityFeedItem.tsx`

**Step 1: Create the feed item component**

Create `apps/web/src/features/activity/components/ActivityFeedItem.tsx`:

```tsx
import { Landmark, BookOpen, Image, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { SocialFeedItem } from '../api/activity';

const entityIcons: Record<string, typeof Landmark> = {
  legacy: Landmark,
  story: BookOpen,
  media: Image,
  conversation: MessageCircle,
};

const entityLabels: Record<string, string> = {
  legacy: 'Legacy',
  story: 'Story',
  media: 'Media',
  conversation: 'Conversation',
};

const actionLabels: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  favorited: 'favorited',
  unfavorited: 'unfavorited',
  shared: 'shared',
  joined: 'joined',
  invited: 'invited',
  ai_conversation_started: 'started a conversation about',
  ai_story_evolved: 'evolved',
};

interface ActivityFeedItemProps {
  item: SocialFeedItem;
  currentUserId: string;
  onClick?: () => void;
}

export default function ActivityFeedItem({
  item,
  currentUserId,
  onClick,
}: ActivityFeedItemProps) {
  const Icon = entityIcons[item.entity_type] || BookOpen;
  const actorName = item.actor.id === currentUserId ? 'You' : item.actor.name;
  const actionText = actionLabels[item.action] || item.action;
  const entityLabel = entityLabels[item.entity_type] || item.entity_type;
  const entityName =
    item.entity?.title || item.entity?.name || item.entity?.filename || '';
  const timeAgo = formatDistanceToNow(new Date(item.created_at), {
    addSuffix: true,
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 w-full text-left py-3 px-2 rounded-lg hover:bg-neutral-50 transition-colors"
    >
      <div className="mt-0.5 flex-shrink-0 size-8 rounded-full bg-neutral-100 flex items-center justify-center">
        <Icon className="size-4 text-neutral-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-neutral-900">
          <span className="font-medium">{actorName}</span>{' '}
          {actionText}{' '}
          {entityName && (
            <span className="font-medium">&ldquo;{entityName}&rdquo;</span>
          )}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {entityLabel} &middot; {timeAgo}
        </p>
      </div>
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/activity/components/ActivityFeedItem.tsx
git commit -m "feat(activity): add ActivityFeedItem component"
```

---

### Task 10: Frontend — RecentActivitySection Component

**Files:**
- Create: `apps/web/src/features/activity/components/RecentActivitySection.tsx`

**Step 1: Create the recent activity section**

Create `apps/web/src/features/activity/components/RecentActivitySection.tsx`:

```tsx
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocialFeed } from '../hooks/useActivity';
import type { SocialFeedItem } from '../api/activity';
import ActivityFeedItem from './ActivityFeedItem';

function getActivityRoute(item: SocialFeedItem): string | null {
  switch (item.entity_type) {
    case 'legacy':
      return `/legacy/${item.entity_id}`;
    case 'story': {
      const legacyId = item.entity?.legacy_id;
      return legacyId
        ? `/legacy/${legacyId}/story/${item.entity_id}`
        : null;
    }
    case 'media': {
      const legacyId = item.entity?.legacy_id;
      return legacyId ? `/legacy/${legacyId}/gallery` : null;
    }
    default:
      return null;
  }
}

export default function RecentActivitySection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useSocialFeed(5);

  if (!isLoading && (!data || data.items.length === 0)) {
    return null;
  }

  const handleClick = (item: SocialFeedItem) => {
    const route = getActivityRoute(item);
    if (route) navigate(route);
  };

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="space-y-2 mb-6">
          <h2 className="text-neutral-900">Recent Activity</h2>
          <p className="text-neutral-600">
            What&apos;s been happening across your legacies
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {!isLoading && data && data.items.length > 0 && (
          <div className="divide-y divide-neutral-100">
            {data.items.map((item) => (
              <ActivityFeedItem
                key={item.id}
                item={item}
                currentUserId={user?.id || ''}
                onClick={() => handleClick(item)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/activity/components/RecentActivitySection.tsx
git commit -m "feat(activity): add RecentActivitySection component"
```

---

### Task 11: Frontend — RecentlyViewedSection Component

**Files:**
- Create: `apps/web/src/features/activity/components/RecentlyViewedSection.tsx`

**Step 1: Create the recently viewed section**

Create `apps/web/src/features/activity/components/RecentlyViewedSection.tsx`:

```tsx
import { Loader2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { useRecentlyViewed } from '../hooks/useActivity';
import type { EnrichedRecentItem } from '../api/activity';

interface RecentlyViewedSectionProps {
  entityType: 'legacy' | 'story';
  title: string;
  description: string;
  limit?: number;
}

function LegacyCard({
  item,
  onClick,
}: {
  item: EnrichedRecentItem;
  onClick: () => void;
}) {
  const entity = item.entity;
  if (!entity) return null;

  const dates = (() => {
    const birthYear = entity.birth_date
      ? new Date(entity.birth_date).getFullYear()
      : null;
    const deathYear = entity.death_date
      ? new Date(entity.death_date).getFullYear()
      : null;
    if (birthYear && deathYear) return `${birthYear} - ${deathYear}`;
    if (birthYear) return `Born ${birthYear}`;
    if (deathYear) return `Died ${deathYear}`;
    return '';
  })();

  return (
    <Card
      role="button"
      tabIndex={0}
      className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
        {entity.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(entity.profile_image_url)}
            alt={entity.name || ''}
            className="w-full h-full object-cover"
          />
        ) : (
          <Users className="size-12 text-neutral-300" />
        )}
      </div>
      <div className="p-5 space-y-3">
        <div className="space-y-1">
          <h3 className="text-neutral-900">{entity.name}</h3>
          {dates && <p className="text-sm text-neutral-500">{dates}</p>}
        </div>
        {entity.biography && (
          <p className="text-sm text-neutral-600 line-clamp-2">
            {entity.biography}
          </p>
        )}
      </div>
    </Card>
  );
}

function StoryCard({
  item,
  onClick,
}: {
  item: EnrichedRecentItem;
  onClick: () => void;
}) {
  const entity = item.entity;
  if (!entity) return null;

  return (
    <Card
      role="button"
      tabIndex={0}
      className="p-5 space-y-3 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="space-y-1">
        <h3 className="text-neutral-900 text-sm font-medium line-clamp-1">
          {entity.title}
        </h3>
        {entity.legacy_name && (
          <Badge variant="outline" className="text-xs">
            {entity.legacy_name}
          </Badge>
        )}
      </div>
      {entity.content_preview && (
        <p className="text-xs text-neutral-600 line-clamp-2">
          {entity.content_preview}
        </p>
      )}
      {entity.author_name && (
        <p className="text-xs text-neutral-500">by {entity.author_name}</p>
      )}
    </Card>
  );
}

export default function RecentlyViewedSection({
  entityType,
  title,
  description,
  limit = 4,
}: RecentlyViewedSectionProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useRecentlyViewed(entityType, limit);

  if (!isLoading && (!data || data.items.length === 0)) {
    return null;
  }

  if (!isLoading && data && !data.tracking_enabled) {
    return null;
  }

  const handleClick = (item: EnrichedRecentItem) => {
    if (entityType === 'legacy') {
      navigate(`/legacy/${item.entity_id}`);
    } else if (entityType === 'story') {
      const legacyId = item.entity?.legacy_id;
      if (legacyId) {
        navigate(`/legacy/${legacyId}/story/${item.entity_id}`);
      }
    }
  };

  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="space-y-2 mb-6">
          <h2 className="text-neutral-900 text-xl">{title}</h2>
          <p className="text-neutral-600 text-sm">{description}</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {!isLoading && data && data.items.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {data.items.map((item) =>
              entityType === 'legacy' ? (
                <LegacyCard
                  key={item.entity_id}
                  item={item}
                  onClick={() => handleClick(item)}
                />
              ) : (
                <StoryCard
                  key={item.entity_id}
                  item={item}
                  onClick={() => handleClick(item)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/activity/components/RecentlyViewedSection.tsx
git commit -m "feat(activity): add RecentlyViewedSection component with legacy and story cards"
```

---

### Task 12: Frontend — Integrate Sections into Homepage

**Files:**
- Modify: `apps/web/src/pages/Homepage.tsx`

**Step 1: Add imports to Homepage**

Add these imports at the top of `apps/web/src/pages/Homepage.tsx` (after the existing imports):

```typescript
import RecentActivitySection from '@/features/activity/components/RecentActivitySection';
import RecentlyViewedSection from '@/features/activity/components/RecentlyViewedSection';
```

**Step 2: Insert the new sections**

In the Homepage JSX, insert the three new sections for authenticated users. The target ordering is:

1. Hero
2. **Recently Viewed Legacies** (new) — after Hero, before My Legacies
3. My Legacies (existing)
4. **Recently Viewed Stories** (new) — after My Legacies, before Recent Activity
5. **Recent Activity** (new) — after Recently Viewed Stories, before Favorites
6. Favorites (existing)
7. Explore Legacies (existing)

After the Hero section closing `</section>` tag (line 103) and before the `{/* My Legacies */}` comment (line 105), add:

```tsx
      {user && (
        <RecentlyViewedSection
          entityType="legacy"
          title="Recently Viewed Legacies"
          description="Legacies you've visited recently"
        />
      )}
```

After the My Legacies section closing `</section>` (the `)}` on line 202) and before the existing `{user && <FavoritesSection />}` (line 204), add:

```tsx
      {user && (
        <RecentlyViewedSection
          entityType="story"
          title="Recently Viewed Stories"
          description="Stories you've read recently"
        />
      )}

      {user && <RecentActivitySection />}
```

**Step 3: Verify the app builds**

Run: `cd apps/web && npm run build`
Expected: Build succeeds with no TypeScript errors.

**Step 4: Commit**

```bash
git add apps/web/src/pages/Homepage.tsx
git commit -m "feat(activity): integrate activity sections into homepage"
```

---

### Task 13: Frontend Validation & Build

**Files:** None — validation only.

**Step 1: Run frontend lint**

Run: `cd apps/web && npm run lint`
Expected: No errors. Fix any issues if they appear.

**Step 2: Run frontend build**

Run: `cd apps/web && npm run build`
Expected: Build succeeds.

**Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix(activity): address frontend lint issues"
```

---

### Task 14: Backend — Full Test Suite

**Files:** None — testing only.

**Step 1: Run all backend tests**

Run: `cd services/core-api && uv run pytest -v`
Expected: All tests PASS.

**Step 2: Run backend validation**

Run: `just validate-backend`
Expected: Clean pass.

**Step 3: Fix any regressions and commit**

```bash
git add -u
git commit -m "fix(activity): address test regressions"
```

---

### Task 15: Final Review

**Step 1: Verify all activity tests pass**

Run: `cd services/core-api && uv run pytest tests/test_activity_service.py tests/test_activity_routes.py tests/test_activity_privacy.py tests/test_activity_enrichment.py tests/test_activity_social_feed.py tests/test_activity_enriched_recent.py tests/test_activity_feed_routes.py -v`
Expected: All tests PASS.

**Step 2: Run full backend validation**

Run: `just validate-backend`
Expected: Clean pass.

**Step 3: Review changes**

Run: `git log --oneline -15` to see the commit history.
Run: `git diff develop --stat` to see total files changed.

Verify:
- New backend files: `tests/test_activity_enrichment.py`, `tests/test_activity_social_feed.py`, `tests/test_activity_enriched_recent.py`, `tests/test_activity_feed_routes.py`
- Modified backend files: `schemas/activity.py`, `services/activity.py`, `routes/activity.py`
- New frontend files: `features/activity/api/activity.ts`, `features/activity/hooks/useActivity.ts`, `features/activity/components/ActivityFeedItem.tsx`, `features/activity/components/RecentActivitySection.tsx`, `features/activity/components/RecentlyViewedSection.tsx`
- Modified frontend files: `pages/Homepage.tsx`
