# Stories Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the `/stories` placeholder into a full Stories Hub with stats bar, top-legacies chips, and tabbed browsing (All Stories, Drafts, Activity), mirroring the Legacies Hub pattern.

**Architecture:** Add two new backend endpoints (`/api/stories/stats`, `/api/stories/top-legacies`), extend the existing stories list endpoint with `all`/`drafts` scopes and a wrapped response shape, then build frontend hub components in `apps/web/src/components/stories-hub/` and rewrite `StoriesPage.tsx`.

**Tech Stack:** React 18, TypeScript, TanStack Query, Radix UI Tabs, Tailwind CSS, FastAPI, SQLAlchemy, Pydantic

**Design doc:** `docs/plans/2026-03-03-stories-hub-redesign-design.md`

**Status:**
- [x] Task 1: Add Story Stats Backend Endpoint
- [x] Task 2: Add Top Legacies Backend Endpoint
- [x] Task 3: Add `all` and `drafts` Scopes + Wrapped Response to Stories Endpoint
- [x] Task 4: Update Frontend Story API & Hooks
- [x] Task 5: Build StoryStatsBar Component
- [x] Task 6: Build TopLegaciesChips Component
- [x] Task 7: Build AllStoriesTabContent Component
- [x] Task 8: Build DraftsTabContent Component
- [x] Task 9: Build StoryActivityTabContent Component
- [x] Task 10: Build LegacyPickerDialog Component
- [x] Task 11: Rewrite StoriesPage
- [x] Task 12: Fix Callers & Run Full Test Suite

---

## Task 1: Add Story Stats Backend Endpoint

Add `GET /api/stories/stats` returning story-specific metrics for the authenticated user.

**Files:**
- Modify: `services/core-api/app/schemas/story.py:106` (add new schema after StorySummary)
- Modify: `services/core-api/app/services/story.py:585` (add new function before list_stories_scoped)
- Modify: `services/core-api/app/routes/story.py:115` (add new endpoint before list_stories)
- Test: `services/core-api/tests/test_story_stats.py`

**Step 1: Add the schema**

In `services/core-api/app/schemas/story.py`, add after `StorySummary` (after line 106, before the blank line at 107):

```python
class StoryStatsResponse(BaseModel):
    """Story-specific stats for the authenticated user."""

    my_stories_count: int
    favorites_given_count: int
    stories_evolved_count: int
    legacies_written_for_count: int
```

**Step 2: Add the service function**

In `services/core-api/app/services/story.py`, add this function before `list_stories_scoped` (before line 585). You'll need to add `func` to the sqlalchemy import on line 10 (change `from sqlalchemy import and_, or_, select` to `from sqlalchemy import and_, func, or_, select`):

```python
async def get_story_stats(
    db: AsyncSession,
    user_id: UUID,
) -> dict:
    """Get story-specific stats for a user.

    Returns counts for: stories authored, favorites given to stories,
    stories evolved via AI, distinct legacies written for.
    """
    from app.models.favorite import UserFavorite
    from app.models.story_evolution import StoryEvolutionSession

    # Count stories authored by user
    my_stories_result = await db.execute(
        select(func.count(Story.id)).where(Story.author_id == user_id)
    )
    my_stories_count = my_stories_result.scalar() or 0

    # Count favorites given to stories
    fav_result = await db.execute(
        select(func.count(UserFavorite.id)).where(
            UserFavorite.user_id == user_id,
            UserFavorite.entity_type == "story",
        )
    )
    favorites_given_count = fav_result.scalar() or 0

    # Count stories evolved via AI (completed sessions)
    evolved_result = await db.execute(
        select(func.count(func.distinct(StoryEvolutionSession.story_id))).where(
            StoryEvolutionSession.created_by == user_id,
            StoryEvolutionSession.phase == "completed",
        )
    )
    stories_evolved_count = evolved_result.scalar() or 0

    # Count distinct legacies user has written stories for
    legacies_result = await db.execute(
        select(func.count(func.distinct(StoryLegacy.legacy_id)))
        .join(Story, StoryLegacy.story_id == Story.id)
        .where(Story.author_id == user_id)
    )
    legacies_written_for_count = legacies_result.scalar() or 0

    logger.info(
        "story.stats",
        extra={"user_id": str(user_id)},
    )

    return {
        "my_stories_count": my_stories_count,
        "favorites_given_count": favorites_given_count,
        "stories_evolved_count": stories_evolved_count,
        "legacies_written_for_count": legacies_written_for_count,
    }
```

**Step 3: Add the route**

In `services/core-api/app/routes/story.py`, add `StoryStatsResponse` to the schema imports (line 12-18). Then add this endpoint before the `list_stories` endpoint (before line 115):

Add to imports:
```python
from ..schemas.story import (
    StoryCreate,
    StoryDetail,
    StoryResponse,
    StoryStatsResponse,
    StorySummary,
    StoryUpdate,
)
```

Add the endpoint:
```python
@router.get(
    "/stats",
    response_model=StoryStatsResponse,
    summary="Get story stats",
    description="Get story-specific statistics for the authenticated user.",
)
async def get_story_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryStatsResponse:
    """Get story stats for the current user."""
    session = require_auth(request)

    result = await story_service.get_story_stats(
        db=db,
        user_id=session.user_id,
    )
    return StoryStatsResponse(**result)
```

**Important:** This endpoint MUST be placed before the `/{story_id}` route (line 148) to avoid FastAPI treating "stats" as a story ID.

**Step 4: Write the test**

Create `services/core-api/tests/test_story_stats.py`:

```python
"""Tests for GET /api/stories/stats endpoint."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestStoryStats:
    """Tests for GET /api/stories/stats."""

    @pytest.mark.asyncio
    async def test_stats_returns_all_fields(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Stats response includes all four story stat fields."""
        response = await client.get("/api/stories/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "my_stories_count" in data
        assert "favorites_given_count" in data
        assert "stories_evolved_count" in data
        assert "legacies_written_for_count" in data

    @pytest.mark.asyncio
    async def test_stats_values_are_integers(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """All stats values are non-negative integers."""
        response = await client.get("/api/stories/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        for key, value in data.items():
            assert isinstance(value, int), f"{key} should be int"
            assert value >= 0, f"{key} should be non-negative"

    @pytest.mark.asyncio
    async def test_stats_requires_auth(
        self,
        client: AsyncClient,
    ):
        """Stats endpoint requires authentication."""
        response = await client.get("/api/stories/stats")
        assert response.status_code == 401
```

**Step 5: Run the tests**

```bash
cd services/core-api && uv run pytest tests/test_story_stats.py -v
```

Expected: PASS

**Step 6: Run validation**

```bash
just validate-backend
```

Expected: PASS

**Step 7: Commit**

```bash
git add services/core-api/app/schemas/story.py services/core-api/app/services/story.py services/core-api/app/routes/story.py services/core-api/tests/test_story_stats.py
git commit -m "feat(api): add story stats endpoint"
```

---

## Task 2: Add Top Legacies Backend Endpoint

Add `GET /api/stories/top-legacies` returning legacies the user has written the most stories about.

**Files:**
- Modify: `services/core-api/app/schemas/story.py` (add TopLegacyResponse schema)
- Modify: `services/core-api/app/services/story.py` (add get_top_legacies function)
- Modify: `services/core-api/app/routes/story.py` (add endpoint)
- Test: `services/core-api/tests/test_story_top_legacies.py`

**Step 1: Add the schema**

In `services/core-api/app/schemas/story.py`, add after `StoryStatsResponse` (the schema added in Task 1):

```python
class TopLegacyResponse(BaseModel):
    """A legacy ranked by story count for the user."""

    legacy_id: UUID
    legacy_name: str
    profile_image_url: str | None
    story_count: int
```

**Step 2: Add the service function**

In `services/core-api/app/services/story.py`, add after `get_story_stats` (the function added in Task 1):

```python
async def get_top_legacies(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 6,
) -> list[dict]:
    """Get legacies the user has written the most stories about.

    Returns legacy_id, legacy_name, profile_image_url, and story_count,
    ordered by story_count descending.
    """
    from ..services.legacy import get_profile_image_url

    # Count stories per legacy for this author
    result = await db.execute(
        select(
            StoryLegacy.legacy_id,
            func.count(StoryLegacy.story_id).label("story_count"),
        )
        .join(Story, StoryLegacy.story_id == Story.id)
        .where(Story.author_id == user_id)
        .group_by(StoryLegacy.legacy_id)
        .order_by(func.count(StoryLegacy.story_id).desc())
        .limit(limit)
    )
    rows = result.all()

    if not rows:
        return []

    # Fetch legacy details
    legacy_ids = [row[0] for row in rows]
    legacy_result = await db.execute(
        select(Legacy)
        .options(selectinload(Legacy.profile_image))
        .where(Legacy.id.in_(legacy_ids))
    )
    legacies_by_id = {leg.id: leg for leg in legacy_result.scalars().all()}

    items = []
    for legacy_id, story_count in rows:
        legacy = legacies_by_id.get(legacy_id)
        if legacy:
            items.append(
                {
                    "legacy_id": legacy.id,
                    "legacy_name": legacy.name,
                    "profile_image_url": get_profile_image_url(legacy),
                    "story_count": story_count,
                }
            )

    logger.info(
        "story.top_legacies",
        extra={"user_id": str(user_id), "count": len(items)},
    )

    return items
```

**Step 3: Add the route**

In `services/core-api/app/routes/story.py`, add `TopLegacyResponse` to the schema imports. Then add this endpoint after the `get_story_stats` endpoint (added in Task 1) and before `list_stories` (line 115):

```python
@router.get(
    "/top-legacies",
    response_model=list[TopLegacyResponse],
    summary="Get top legacies by story count",
    description="Get legacies the user has written the most stories about.",
)
async def get_top_legacies(
    request: Request,
    limit: int = Query(default=6, ge=1, le=20, description="Max results"),
    db: AsyncSession = Depends(get_db),
) -> list[TopLegacyResponse]:
    """Get top legacies by story count for the current user."""
    session = require_auth(request)

    items = await story_service.get_top_legacies(
        db=db,
        user_id=session.user_id,
        limit=limit,
    )
    return [TopLegacyResponse(**item) for item in items]
```

**Step 4: Write the test**

Create `services/core-api/tests/test_story_top_legacies.py`:

```python
"""Tests for GET /api/stories/top-legacies endpoint."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestTopLegacies:
    """Tests for GET /api/stories/top-legacies."""

    @pytest.mark.asyncio
    async def test_returns_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Top legacies returns a list."""
        response = await client.get(
            "/api/stories/top-legacies", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_respects_limit_parameter(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Limit parameter constrains results."""
        response = await client.get(
            "/api/stories/top-legacies?limit=2", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 2

    @pytest.mark.asyncio
    async def test_items_have_required_fields(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Each item has legacy_id, legacy_name, profile_image_url, story_count."""
        response = await client.get(
            "/api/stories/top-legacies", headers=auth_headers
        )
        assert response.status_code == 200
        for item in response.json():
            assert "legacy_id" in item
            assert "legacy_name" in item
            assert "profile_image_url" in item
            assert "story_count" in item
            assert isinstance(item["story_count"], int)

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
    ):
        """Top legacies endpoint requires authentication."""
        response = await client.get("/api/stories/top-legacies")
        assert response.status_code == 401
```

**Step 5: Run the tests**

```bash
cd services/core-api && uv run pytest tests/test_story_top_legacies.py -v
```

Expected: PASS

**Step 6: Run validation**

```bash
just validate-backend
```

Expected: PASS

**Step 7: Commit**

```bash
git add services/core-api/app/schemas/story.py services/core-api/app/services/story.py services/core-api/app/routes/story.py services/core-api/tests/test_story_top_legacies.py
git commit -m "feat(api): add top legacies by story count endpoint"
```

---

## Task 3: Add `all` and `drafts` Scopes + Wrapped Response to Stories Endpoint

Extend `GET /api/stories/` with `all` and `drafts` scopes. When `scope` is provided, return a `StoryScopedResponse` with items and counts. When `scope` is NOT provided (legacy_id/orphaned), return `list[StorySummary]` for backward compatibility.

**Files:**
- Modify: `services/core-api/app/schemas/story.py` (add StoryScopeCounts, StoryScopedResponse)
- Modify: `services/core-api/app/services/story.py:585-690` (rewrite list_stories_scoped)
- Modify: `services/core-api/app/routes/story.py:115-145` (update list_stories route)
- Modify: `services/core-api/tests/test_story_scope.py` (update existing tests)

**Step 1: Add the schemas**

In `services/core-api/app/schemas/story.py`, add after `TopLegacyResponse` (added in Task 2):

```python
class StoryScopeCounts(BaseModel):
    """Filter counts for stories hub."""

    all: int
    mine: int
    shared: int


class StoryScopedResponse(BaseModel):
    """Stories list with scope filter counts."""

    items: list[StorySummary]
    counts: StoryScopeCounts
```

**Step 2: Rewrite list_stories_scoped**

Replace the existing `list_stories_scoped` function in `services/core-api/app/services/story.py` (lines 585-690) with a version that:
- Accepts `all` and `drafts` as new scopes
- Returns a dict with `items` and `counts` (instead of `list[StorySummary]`)
- Computes counts for all/mine/shared to power filter badges

```python
async def list_stories_scoped(
    db: AsyncSession,
    user_id: UUID,
    scope: str = "all",
) -> dict:
    """List stories by scope with filter counts.

    Scopes:
        all: all stories the user can see (authored + shared)
        mine: stories authored by the user
        shared: stories by others on legacies the user is a member of
        favorites: stories the user has favorited
        drafts: user's own draft stories
    """
    from app.models.favorite import UserFavorite

    # Query user's own stories
    mine_result = await db.execute(
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
        .where(Story.author_id == user_id)
        .order_by(Story.created_at.desc())
    )
    mine_stories = list(mine_result.scalars().unique().all())

    # Query shared stories (by others on legacies user is a member of)
    user_legacy_ids = select(LegacyMember.legacy_id).where(
        LegacyMember.user_id == user_id,
        LegacyMember.role != "pending",
    )
    shared_result = await db.execute(
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
        .join(StoryLegacy, Story.id == StoryLegacy.story_id)
        .where(
            StoryLegacy.legacy_id.in_(user_legacy_ids),
            Story.author_id != user_id,
            Story.status == "published",
            or_(
                Story.visibility == "public",
                Story.visibility == "private",
            ),
        )
        .order_by(Story.created_at.desc())
    )
    shared_stories = list(shared_result.scalars().unique().all())

    # Compute counts (published only for mine count to match visible items)
    mine_published = [s for s in mine_stories if s.status == "published"]
    counts = {
        "all": len(mine_published) + len(shared_stories),
        "mine": len(mine_published),
        "shared": len(shared_stories),
    }

    # Resolve legacy names for all stories
    all_stories_combined = mine_stories + shared_stories
    all_legacy_ids: set[UUID] = set()
    for story in all_stories_combined:
        all_legacy_ids.update(assoc.legacy_id for assoc in story.legacy_associations)
    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    def to_summary(story: Story) -> StorySummary:
        return StorySummary(
            id=story.id,
            title=story.title,
            content_preview=create_content_preview(story.content),
            author_id=story.author_id,
            author_name=story.author.name,
            visibility=story.visibility,
            status=story.status,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
            ],
            favorite_count=story.favorite_count or 0,
            created_at=story.created_at,
            updated_at=story.updated_at,
        )

    # Select items based on scope
    if scope == "mine":
        items = [to_summary(s) for s in mine_published]
    elif scope == "shared":
        items = [to_summary(s) for s in shared_stories]
    elif scope == "favorites":
        fav_result = await db.execute(
            select(UserFavorite.entity_id).where(
                UserFavorite.user_id == user_id,
                UserFavorite.entity_type == "story",
            )
        )
        fav_ids = {row[0] for row in fav_result.all()}
        all_summaries = [to_summary(s) for s in mine_published + shared_stories]
        items = [s for s in all_summaries if s.id in fav_ids]
    elif scope == "drafts":
        drafts = [s for s in mine_stories if s.status == "draft"]
        items = [to_summary(s) for s in drafts]
    else:
        # "all" — mine (published) + shared
        items = [to_summary(s) for s in mine_published + shared_stories]

    logger.info(
        "story.list_scoped",
        extra={"user_id": str(user_id), "scope": scope, "count": len(items)},
    )

    return {"items": items, "counts": counts}
```

**Step 3: Update the route handler**

In `services/core-api/app/routes/story.py`, update the `list_stories` endpoint (lines 115-145). The endpoint now needs to handle two response types: `StoryScopedResponse` when scope is provided, and `list[StorySummary]` when it's not. Use `Union` return type:

Add `StoryScopeCounts` and `StoryScopedResponse` to the schema imports.

Replace the endpoint:

```python
@router.get(
    "/",
    response_model=StoryScopedResponse | list[StorySummary],
    summary="List stories",
    description="List stories filtered by visibility rules. Filter by legacy_id, orphaned flag, or scope.",
)
async def list_stories(
    request: Request,
    legacy_id: UUID | None = Query(None, description="Filter by legacy"),
    orphaned: bool = Query(False, description="Return only orphaned stories"),
    scope: Literal["all", "mine", "shared", "favorites", "drafts"] | None = Query(
        None, description="Filter scope (alternative to legacy_id/orphaned)"
    ),
    db: AsyncSession = Depends(get_db),
) -> StoryScopedResponse | list[StorySummary]:
    """List stories with optional filtering."""
    session = require_auth(request)

    if scope:
        result = await story_service.list_stories_scoped(
            db=db,
            user_id=session.user_id,
            scope=scope,
        )
        return StoryScopedResponse(
            items=result["items"],
            counts=StoryScopeCounts(**result["counts"]),
        )

    return await story_service.list_legacy_stories(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        orphaned=orphaned,
    )
```

**Step 4: Update existing tests**

Replace `services/core-api/tests/test_story_scope.py` to test the new wrapped response:

```python
"""Tests for story scope filtering on GET /api/stories/."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestStoryScope:
    """Tests for GET /api/stories/?scope=..."""

    @pytest.mark.asyncio
    async def test_scope_all_returns_items_and_counts(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'all' returns items list and counts object."""
        response = await client.get(
            "/api/stories/?scope=all", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "counts" in data
        assert "all" in data["counts"]
        assert "mine" in data["counts"]
        assert "shared" in data["counts"]

    @pytest.mark.asyncio
    async def test_scope_mine_returns_authored_stories(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'mine' returns only stories authored by user."""
        response = await client.get(
            "/api/stories/?scope=mine", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        for item in data["items"]:
            assert item["author_id"] == str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_shared_excludes_own(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'shared' excludes user's own stories."""
        response = await client.get(
            "/api/stories/?scope=shared", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["author_id"] != str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_favorites_returns_wrapped(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Scope 'favorites' returns wrapped response."""
        response = await client.get(
            "/api/stories/?scope=favorites", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "counts" in data

    @pytest.mark.asyncio
    async def test_scope_drafts_returns_only_drafts(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'drafts' returns only draft stories by the user."""
        response = await client.get(
            "/api/stories/?scope=drafts", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        for item in data["items"]:
            assert item["status"] == "draft"
            assert item["author_id"] == str(test_user.id)

    @pytest.mark.asyncio
    async def test_no_scope_returns_plain_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """No scope parameter returns plain list (backward compat)."""
        response = await client.get("/api/stories/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
```

**Step 5: Run the tests**

```bash
cd services/core-api && uv run pytest tests/test_story_scope.py -v
```

Expected: PASS

**Step 6: Run validation**

```bash
just validate-backend
```

Expected: PASS

**Step 7: Commit**

```bash
git add services/core-api/app/schemas/story.py services/core-api/app/services/story.py services/core-api/app/routes/story.py services/core-api/tests/test_story_scope.py
git commit -m "feat(api): add all/drafts scopes and wrapped response to stories endpoint"
```

---

## Task 4: Update Frontend Story API & Hooks

Update the frontend API functions and hooks to support the new scoped response shape and new endpoints.

**Files:**
- Modify: `apps/web/src/features/story/api/stories.ts:73,75-89`
- Modify: `apps/web/src/features/story/hooks/useStories.ts:16-28,38-43`
- Modify: `apps/web/src/components/legacies-hub/StoriesTabContent.tsx:21,23,36`

**Step 1: Update the API types and functions**

In `apps/web/src/features/story/api/stories.ts`:

Replace line 73 (`StoryScope` type):
```typescript
export type StoryScope = 'all' | 'mine' | 'shared' | 'favorites' | 'drafts';
```

Add after the `StoryScope` type (after line 73):
```typescript
export interface StoryScopeCounts {
  all: number;
  mine: number;
  shared: number;
}

export interface StoryScopedResponse {
  items: StorySummary[];
  counts: StoryScopeCounts;
}

export interface StoryStatsResponse {
  my_stories_count: number;
  favorites_given_count: number;
  stories_evolved_count: number;
  legacies_written_for_count: number;
}

export interface TopLegacy {
  legacy_id: string;
  legacy_name: string;
  profile_image_url: string | null;
  story_count: number;
}
```

Replace the `getStories` function (lines 75-89):
```typescript
export async function getStories(
  legacyId?: string,
  orphaned?: boolean,
  scope?: StoryScope,
): Promise<StoryScopedResponse | StorySummary[]> {
  const params = new URLSearchParams();
  if (scope) {
    params.append('scope', scope);
  } else {
    if (legacyId) params.append('legacy_id', legacyId);
    if (orphaned !== undefined) params.append('orphaned', String(orphaned));
  }
  const queryString = params.toString();
  return apiGet<StoryScopedResponse | StorySummary[]>(
    `/api/stories/${queryString ? `?${queryString}` : ''}`,
  );
}

export async function getScopedStories(scope: StoryScope): Promise<StoryScopedResponse> {
  return apiGet<StoryScopedResponse>(`/api/stories/?scope=${scope}`);
}

export async function getStoryStats(): Promise<StoryStatsResponse> {
  return apiGet<StoryStatsResponse>('/api/stories/stats');
}

export async function getTopLegacies(limit: number = 6): Promise<TopLegacy[]> {
  return apiGet<TopLegacy[]>(`/api/stories/top-legacies?limit=${limit}`);
}
```

**Step 2: Update the hooks**

In `apps/web/src/features/story/hooks/useStories.ts`:

Update imports (lines 3-13) to include new types and functions:
```typescript
import {
  getStories,
  getScopedStories,
  getStory,
  getStoryStats,
  getTopLegacies,
  getPublicStories,
  createStory,
  updateStory,
  deleteStory,
  type CreateStoryInput,
  type UpdateStoryInput,
  type StoryScope,
  type StoryScopedResponse,
} from '@/features/story/api/stories';
```

Add `stats` and `topLegacies` keys to `storyKeys` (lines 16-28):
```typescript
export const storyKeys = {
  all: ['stories'] as const,
  lists: () => [...storyKeys.all, 'list'] as const,
  list: (filters?: { legacyId?: string; orphaned?: boolean }) => {
    if (!filters) return [...storyKeys.lists()];
    if (filters.orphaned) return [...storyKeys.lists(), 'orphaned'];
    if (filters.legacyId) return [...storyKeys.lists(), filters.legacyId];
    return [...storyKeys.lists()];
  },
  scoped: (scope: string) => [...storyKeys.lists(), { scope }] as const,
  stats: () => [...storyKeys.all, 'stats'] as const,
  topLegacies: (limit: number) => [...storyKeys.all, 'top-legacies', limit] as const,
  details: () => [...storyKeys.all, 'detail'] as const,
  detail: (storyId: string) => [...storyKeys.details(), storyId] as const,
};
```

Replace `useScopedStories` (lines 38-43) to return `StoryScopedResponse`:
```typescript
export function useScopedStories(scope: StoryScope) {
  return useQuery<StoryScopedResponse>({
    queryKey: storyKeys.scoped(scope),
    queryFn: () => getScopedStories(scope),
  });
}
```

Add new hooks after `useScopedStories`:
```typescript
export function useStoryStats() {
  return useQuery({
    queryKey: storyKeys.stats(),
    queryFn: getStoryStats,
  });
}

export function useTopLegacies(limit: number = 6) {
  return useQuery({
    queryKey: storyKeys.topLegacies(limit),
    queryFn: () => getTopLegacies(limit),
  });
}
```

**Step 3: Update StoriesTabContent in legacies hub**

In `apps/web/src/components/legacies-hub/StoriesTabContent.tsx`, update the data access to handle the new `StoryScopedResponse`:

Replace line 21:
```typescript
  const { data, isLoading } = useScopedStories(activeFilter as StoryScope);
```

Replace line 23:
```typescript
  const storyIds = data?.items?.map((s) => s.id) ?? [];
```

Replace line 36:
```typescript
      {!isLoading && data && data.items.length > 0 && (
```

Replace line 38-43:
```typescript
          {data.items.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              isFavorited={favoriteData?.favorites[story.id] ?? false}
            />
          ))}
```

Replace line 48:
```typescript
      {!isLoading && (!data || data.items.length === 0) && (
```

**Step 4: Commit**

```bash
git add apps/web/src/features/story/api/stories.ts apps/web/src/features/story/hooks/useStories.ts apps/web/src/components/legacies-hub/StoriesTabContent.tsx
git commit -m "feat(web): update story API and hooks for scoped responses and new endpoints"
```

---

## Task 5: Build StoryStatsBar Component

Create the story-specific stats bar showing My Stories, Favorites Given, Stories Evolved, and Legacies Written For.

**Files:**
- Create: `apps/web/src/components/stories-hub/StoryStatsBar.tsx`
- Test: `apps/web/src/components/stories-hub/StoryStatsBar.test.tsx`

**Step 1: Create the component**

```typescript
import { FileText, Heart, Sparkles, Landmark, Loader2 } from 'lucide-react';
import { useStoryStats } from '@/features/story/hooks/useStories';

interface StatItemProps {
  icon: React.ReactNode;
  count: number;
  label: string;
}

function StatItem({ icon, count, label }: StatItemProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="text-neutral-400">{icon}</div>
      <div>
        <p className="text-lg font-semibold text-neutral-900">{count}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

export default function StoryStatsBar() {
  const { data: stats, isLoading } = useStoryStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="size-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex flex-wrap gap-2 divide-x divide-neutral-200">
      <StatItem icon={<FileText className="size-5" />} count={stats.my_stories_count} label="My Stories" />
      <StatItem icon={<Heart className="size-5" />} count={stats.favorites_given_count} label="Favorites" />
      <StatItem icon={<Sparkles className="size-5" />} count={stats.stories_evolved_count} label="Evolved" />
      <StatItem icon={<Landmark className="size-5" />} count={stats.legacies_written_for_count} label="Legacies" />
    </div>
  );
}
```

**Step 2: Write the test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StoryStatsBar from './StoryStatsBar';

vi.mock('@/features/story/hooks/useStories', () => ({
  useStoryStats: () => ({
    data: {
      my_stories_count: 12,
      favorites_given_count: 8,
      stories_evolved_count: 3,
      legacies_written_for_count: 5,
    },
    isLoading: false,
  }),
}));

function renderStatsBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StoryStatsBar />
    </QueryClientProvider>,
  );
}

describe('StoryStatsBar', () => {
  it('renders all four stat items', () => {
    renderStatsBar();
    expect(screen.getByText('My Stories')).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('Evolved')).toBeInTheDocument();
    expect(screen.getByText('Legacies')).toBeInTheDocument();
  });

  it('displays the correct counts', () => {
    renderStatsBar();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
```

**Step 3: Run the test**

```bash
cd apps/web && npm run test -- --run src/components/stories-hub/StoryStatsBar.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/stories-hub/StoryStatsBar.tsx apps/web/src/components/stories-hub/StoryStatsBar.test.tsx
git commit -m "feat(web): add StoryStatsBar component for stories hub"
```

---

## Task 6: Build TopLegaciesChips Component

Create the horizontal chip row showing legacies the user has written the most stories about.

**Files:**
- Create: `apps/web/src/components/stories-hub/TopLegaciesChips.tsx`
- Test: `apps/web/src/components/stories-hub/TopLegaciesChips.test.tsx`

**Step 1: Create the component**

```typescript
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useTopLegacies } from '@/features/story/hooks/useStories';
import { rewriteBackendUrlForDev } from '@/lib/url';

export default function TopLegaciesChips() {
  const navigate = useNavigate();
  const { data, isLoading } = useTopLegacies(6);

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-500">Top Legacies</h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((item) => (
          <button
            key={item.legacy_id}
            onClick={() => navigate(`/legacy/${item.legacy_id}`)}
            className="flex flex-col items-center gap-1.5 min-w-0 group"
          >
            <div className="relative">
              <div className="size-12 rounded-full overflow-hidden bg-neutral-100 ring-2 ring-transparent group-hover:ring-theme-primary transition-all">
                {item.profile_image_url ? (
                  <img
                    src={rewriteBackendUrlForDev(item.profile_image_url)}
                    alt={item.legacy_name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <Users className="size-5 text-neutral-300" />
                  </div>
                )}
              </div>
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-theme-primary text-white text-xs flex items-center justify-center font-medium">
                {item.story_count}
              </span>
            </div>
            <span className="text-xs text-neutral-600 truncate max-w-[72px]">
              {item.legacy_name.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Write the test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TopLegaciesChips from './TopLegaciesChips';

vi.mock('@/features/story/hooks/useStories', () => ({
  useTopLegacies: () => ({
    data: [
      { legacy_id: '1', legacy_name: 'Margaret Chen', profile_image_url: null, story_count: 7 },
      { legacy_id: '2', legacy_name: 'James Torres', profile_image_url: null, story_count: 4 },
    ],
    isLoading: false,
  }),
}));

function renderChips() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TopLegaciesChips />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TopLegaciesChips', () => {
  it('renders section title', () => {
    renderChips();
    expect(screen.getByText('Top Legacies')).toBeInTheDocument();
  });

  it('renders chips with first names', () => {
    renderChips();
    expect(screen.getByText('Margaret')).toBeInTheDocument();
    expect(screen.getByText('James')).toBeInTheDocument();
  });

  it('renders story count badges', () => {
    renderChips();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
```

**Step 3: Run the test**

```bash
cd apps/web && npm run test -- --run src/components/stories-hub/TopLegaciesChips.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/stories-hub/TopLegaciesChips.tsx apps/web/src/components/stories-hub/TopLegaciesChips.test.tsx
git commit -m "feat(web): add TopLegaciesChips component for stories hub"
```

---

## Task 7: Build AllStoriesTabContent Component

Create the All Stories tab with All/Mine/Shared/Favorites quick filters and story card grid.

**Files:**
- Create: `apps/web/src/components/stories-hub/AllStoriesTabContent.tsx`

**Step 1: Create the component**

```typescript
import { useNavigate } from 'react-router-dom';
import { Loader2, BookOpen } from 'lucide-react';
import StoryCard from '@/features/legacy/components/StoryCard';
import { useScopedStories } from '@/features/story/hooks/useStories';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import type { StoryScope } from '@/features/story/api/stories';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface AllStoriesTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export default function AllStoriesTabContent({ activeFilter, onFilterChange }: AllStoriesTabContentProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useScopedStories(activeFilter as StoryScope);

  const storyIds = data?.items?.map((s) => s.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('story', storyIds);

  const filterOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: data?.counts?.all },
    { key: 'mine', label: 'My Stories', count: data?.counts?.mine },
    { key: 'shared', label: 'Shared', count: data?.counts?.shared },
    { key: 'favorites', label: 'Favorites' },
  ];

  const handleStoryClick = (storyId: string, legacyId?: string) => {
    if (legacyId) {
      navigate(`/legacy/${legacyId}/story/${storyId}`);
    }
  };

  return (
    <div className="space-y-6">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.items.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onClick={() => handleStoryClick(story.id, story.legacies[0]?.legacy_id)}
              isFavorited={favoriteData?.favorites[story.id] ?? false}
            />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-center py-12">
          <BookOpen className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter === 'favorites'
              ? "You haven't favorited any stories yet."
              : activeFilter === 'shared'
                ? 'No shared stories from your connected legacies.'
                : activeFilter === 'mine'
                  ? "You haven't written any stories yet."
                  : 'No stories found.'}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/stories-hub/AllStoriesTabContent.tsx
git commit -m "feat(web): add AllStoriesTabContent component for stories hub"
```

---

## Task 8: Build DraftsTabContent Component

Create the Drafts tab showing the user's draft stories.

**Files:**
- Create: `apps/web/src/components/stories-hub/DraftsTabContent.tsx`

**Step 1: Create the component**

```typescript
import { useNavigate } from 'react-router-dom';
import { Loader2, FileEdit } from 'lucide-react';
import StoryCard from '@/features/legacy/components/StoryCard';
import { useScopedStories } from '@/features/story/hooks/useStories';
import type { StoryScope } from '@/features/story/api/stories';

export default function DraftsTabContent() {
  const navigate = useNavigate();
  const { data, isLoading } = useScopedStories('drafts' as StoryScope);

  const handleStoryClick = (storyId: string, legacyId?: string) => {
    if (legacyId) {
      navigate(`/legacy/${legacyId}/story/${storyId}`);
    }
  };

  return (
    <div className="space-y-6">
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.items.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onClick={() => handleStoryClick(story.id, story.legacies[0]?.legacy_id)}
            />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-center py-12">
          <FileEdit className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">No drafts in progress.</p>
          <p className="text-sm text-neutral-500 mt-1">Start writing a new story!</p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/stories-hub/DraftsTabContent.tsx
git commit -m "feat(web): add DraftsTabContent component for stories hub"
```

---

## Task 9: Build StoryActivityTabContent Component

Create the Activity tab filtered to story-related events.

**Files:**
- Create: `apps/web/src/components/stories-hub/StoryActivityTabContent.tsx`

**Step 1: Create the component**

```typescript
import { Loader2, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ActivityFeedItem from '@/features/activity/components/ActivityFeedItem';
import { useSocialFeed } from '@/features/activity/hooks/useActivity';
import { useAuth } from '@/contexts/AuthContext';
import type { SocialFeedItem } from '@/features/activity/api/activity';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface StoryActivityTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

const filterOptions: FilterOption[] = [
  { key: 'all', label: 'All Activity' },
  { key: 'mine', label: 'My Activity' },
];

export default function StoryActivityTabContent({ activeFilter, onFilterChange }: StoryActivityTabContentProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: feedData, isLoading } = useSocialFeed(20);

  // Filter to story events and by scope
  const items = feedData?.items?.filter((item) => {
    if (item.entity_type !== 'story') return false;
    if (activeFilter === 'mine') {
      return item.actor.id === user?.id;
    }
    return true;
  }) ?? [];

  const handleActivityClick = (item: SocialFeedItem) => {
    if (item.entity_type === 'story') {
      const legacyId = (item.metadata as Record<string, string> | null)?.legacy_id;
      if (legacyId) {
        navigate(`/legacy/${legacyId}/story/${item.entity_id}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <ActivityFeedItem
              key={item.id}
              item={item}
              currentUserId={user?.id}
              onClick={() => handleActivityClick(item)}
            />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-12">
          <Activity className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">No story activity to show yet.</p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/stories-hub/StoryActivityTabContent.tsx
git commit -m "feat(web): add StoryActivityTabContent component for stories hub"
```

---

## Task 10: Build LegacyPickerDialog Component

Create the dialog triggered by "Write a Story" that lets users pick which legacy to write for.

**Files:**
- Create: `apps/web/src/components/stories-hub/LegacyPickerDialog.tsx`
- Test: `apps/web/src/components/stories-hub/LegacyPickerDialog.test.tsx`

**Step 1: Create the component**

Check the existing dialog/modal pattern first. The project uses Radix UI. Look at `apps/web/src/components/ui/dialog.tsx` for the Dialog primitives.

```typescript
import { useNavigate } from 'react-router-dom';
import { Users, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import { rewriteBackendUrlForDev } from '@/lib/url';

interface LegacyPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LegacyPickerDialog({ open, onOpenChange }: LegacyPickerDialogProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useLegacies('all', { enabled: open });

  const handleSelect = (legacyId: string) => {
    onOpenChange(false);
    navigate(`/legacy/${legacyId}/story/new`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a Legacy</DialogTitle>
          <DialogDescription>
            Select which legacy this story is about.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {!isLoading && data && (
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {data.items.map((legacy) => (
              <button
                key={legacy.id}
                onClick={() => handleSelect(legacy.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-100 transition-colors text-left"
              >
                <div className="size-10 rounded-full overflow-hidden bg-neutral-100 flex-shrink-0">
                  {legacy.profile_image_url ? (
                    <img
                      src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                      alt={legacy.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center">
                      <Users className="size-4 text-neutral-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{legacy.name}</p>
                </div>
              </button>
            ))}

            {data.items.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-4">
                No legacies found. Create a legacy first.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Write the test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LegacyPickerDialog from './LegacyPickerDialog';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({
    data: {
      items: [
        { id: '1', name: 'Margaret Chen', profile_image_url: null },
        { id: '2', name: 'James Torres', profile_image_url: null },
      ],
      counts: { all: 2, created: 2, connected: 0 },
    },
    isLoading: false,
  }),
}));

function renderDialog(open = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegacyPickerDialog open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('LegacyPickerDialog', () => {
  it('renders dialog title when open', () => {
    renderDialog();
    expect(screen.getByText('Choose a Legacy')).toBeInTheDocument();
  });

  it('renders legacy options', () => {
    renderDialog();
    expect(screen.getByText('Margaret Chen')).toBeInTheDocument();
    expect(screen.getByText('James Torres')).toBeInTheDocument();
  });

  it('navigates to story creation on legacy click', async () => {
    renderDialog();
    await userEvent.click(screen.getByText('Margaret Chen'));
    expect(mockNavigate).toHaveBeenCalledWith('/legacy/1/story/new');
  });
});
```

**Step 3: Run the test**

```bash
cd apps/web && npm run test -- --run src/components/stories-hub/LegacyPickerDialog.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/stories-hub/LegacyPickerDialog.tsx apps/web/src/components/stories-hub/LegacyPickerDialog.test.tsx
git commit -m "feat(web): add LegacyPickerDialog component for stories hub"
```

---

## Task 11: Rewrite StoriesPage

Compose all new components into the rewritten stories hub page.

**Files:**
- Modify: `apps/web/src/pages/StoriesPage.tsx` (full rewrite)
- Modify: `apps/web/src/pages/PlaceholderPages.test.tsx` (remove StoriesPage tests, create separate test file)
- Create: `apps/web/src/pages/StoriesPage.test.tsx`

**Step 1: Rewrite the page**

Replace the entire content of `apps/web/src/pages/StoriesPage.tsx`:

```typescript
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Footer from '@/components/Footer';
import StoryStatsBar from '@/components/stories-hub/StoryStatsBar';
import TopLegaciesChips from '@/components/stories-hub/TopLegaciesChips';
import AllStoriesTabContent from '@/components/stories-hub/AllStoriesTabContent';
import DraftsTabContent from '@/components/stories-hub/DraftsTabContent';
import StoryActivityTabContent from '@/components/stories-hub/StoryActivityTabContent';
import LegacyPickerDialog from '@/components/stories-hub/LegacyPickerDialog';

const DEFAULT_TAB = 'all-stories';
const DEFAULT_FILTERS: Record<string, string> = {
  'all-stories': 'all',
  drafts: 'all',
  activity: 'all',
};
const VALID_FILTERS: Record<string, string[]> = {
  'all-stories': ['all', 'mine', 'shared', 'favorites'],
  drafts: ['all'],
  activity: ['all', 'mine'],
};

export default function StoriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeTab = searchParams.get('tab') || DEFAULT_TAB;
  const rawFilter = searchParams.get('filter');
  const defaultFilter = DEFAULT_FILTERS[activeTab] || 'all';
  const validFilters = VALID_FILTERS[activeTab] ?? [];
  const activeFilter = rawFilter && validFilters.includes(rawFilter) ? rawFilter : defaultFilter;

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab, filter: DEFAULT_FILTERS[tab] || 'all' });
  };

  const handleFilterChange = (filter: string) => {
    setSearchParams({ tab: activeTab, filter });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-neutral-900">Stories</h1>
              <p className="text-neutral-600 text-sm">
                Your stories, drafts, and writing activity.
              </p>
            </div>
            <Button
              onClick={() => setPickerOpen(true)}
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
            >
              <PenLine className="size-4" />
              Write a Story
            </Button>
          </div>

          {/* Stats */}
          <StoryStatsBar />

          {/* Top Legacies */}
          <TopLegaciesChips />

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="all-stories">All Stories</TabsTrigger>
              <TabsTrigger value="drafts">Drafts</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="all-stories">
              <AllStoriesTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="drafts">
              <DraftsTabContent />
            </TabsContent>

            <TabsContent value="activity">
              <StoryActivityTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <LegacyPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      <Footer />
    </div>
  );
}
```

**Step 2: Update PlaceholderPages.test.tsx**

Remove the StoriesPage tests from `apps/web/src/pages/PlaceholderPages.test.tsx`. The file should only keep the `ConversationsPage` tests. Remove the `StoriesPage` import and its describe block.

**Step 3: Create StoriesPage.test.tsx**

Create `apps/web/src/pages/StoriesPage.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

vi.mock('@/features/story/hooks/useStories', () => ({
  useStoryStats: () => ({
    data: {
      my_stories_count: 12,
      favorites_given_count: 8,
      stories_evolved_count: 3,
      legacies_written_for_count: 5,
    },
    isLoading: false,
  }),
  useTopLegacies: () => ({
    data: [],
    isLoading: false,
  }),
  useScopedStories: () => ({
    data: { items: [], counts: { all: 0, mine: 0, shared: 0 } },
    isLoading: false,
  }),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useSocialFeed: () => ({
    data: { items: [], next_cursor: null, has_more: false },
    isLoading: false,
  }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({
    data: { items: [], counts: { all: 0, created: 0, connected: 0 } },
    isLoading: false,
  }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

vi.mock('@/components/Footer', () => ({
  default: () => <footer data-testid="footer" />,
}));

import StoriesPage from './StoriesPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoriesPage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Stories' })).toBeInTheDocument();
  });

  it('renders the Write a Story button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /write a story/i })).toBeInTheDocument();
  });

  it('renders stats bar', () => {
    renderPage();
    expect(screen.getByText('My Stories')).toBeInTheDocument();
    expect(screen.getByText('Evolved')).toBeInTheDocument();
  });

  it('renders tab triggers', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /all stories/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /drafts/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });
});
```

**Step 4: Run the tests**

```bash
cd apps/web && npm run test -- --run src/pages/StoriesPage.test.tsx src/pages/PlaceholderPages.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/pages/StoriesPage.tsx apps/web/src/pages/StoriesPage.test.tsx apps/web/src/pages/PlaceholderPages.test.tsx
git commit -m "feat(web): rewrite StoriesPage as stories hub"
```

---

## Task 12: Fix Callers & Run Full Test Suite

Find and fix all callers affected by the `useScopedStories` response shape change, then run the full test suite.

**Files:**
- Possibly modify: Any file importing `useScopedStories`
- Possibly modify: `apps/web/src/pages/LegaciesPage.test.tsx` (update mock)

**Step 1: Search for all `useScopedStories` callers**

```bash
cd apps/web && grep -rn "useScopedStories" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

The main callers should be:
1. `StoriesTabContent.tsx` (legacies hub) — already updated in Task 4
2. `AllStoriesTabContent.tsx` (stories hub) — new component
3. `DraftsTabContent.tsx` (stories hub) — new component
4. Test files — mocks need updating

Update the `LegaciesPage.test.tsx` mock (line 42-44) from:
```typescript
useScopedStories: () => ({ data: [], isLoading: false }),
```
to:
```typescript
useScopedStories: () => ({ data: { items: [], counts: { all: 0, mine: 0, shared: 0 } }, isLoading: false }),
```

**Step 2: Run the full frontend test suite**

```bash
cd apps/web && npm run test -- --run
```

Fix any failures.

**Step 3: Run the full backend test suite**

```bash
cd services/core-api && uv run pytest -v
```

Fix any failures.

**Step 4: Run backend validation**

```bash
just validate-backend
```

**Step 5: Run frontend lint**

```bash
cd apps/web && npm run lint
```

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: update callers and tests for stories hub integration"
```
