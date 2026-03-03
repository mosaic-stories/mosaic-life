# Legacies Hub Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Legacies page into a hub with stats bar, recently viewed chips, and tabbed browsing across legacies, stories, and activity.

**Architecture:** Rewrite `LegaciesPage.tsx` to compose new child components (StatsBar, RecentlyViewedChips, QuickFilters, tab content components) using existing Radix Tabs. Backend changes add `scope` parameters to existing endpoints and extend the stats response.

**Tech Stack:** React 18, TypeScript, TanStack Query, Radix UI Tabs, Tailwind CSS, FastAPI, SQLAlchemy, Pydantic

**Design doc:** `docs/plans/2026-03-03-legacies-hub-redesign-design.md`

**Status:**
- [x] Task 1: Extend Stats Backend — Schema & Service
- [x] Task 2: Add Scope Parameter to Legacies Endpoint
- [x] Task 3: Add Scope Parameter to Stories Endpoint
- [x] Task 4: Update Frontend Legacy API & Hooks
- [x] Task 5: Update Frontend Story API & Hooks
- [x] Task 6: Build QuickFilters Component
- [x] Task 7: Build StatsBar Component
- [x] Task 8: Build RecentlyViewedChips Component
- [x] Task 9: Build Tab Content Components
- [x] Task 10: Rewrite LegaciesPage
- [ ] Task 11: Fix Callers & Run Full Test Suite
- [ ] Task 12: Manual Smoke Test

---

## Task 1: Extend Stats Backend — Schema & Service

Add `legacy_links_count` and `favorites_count` to the user stats endpoint.

**Files:**
- Modify: `services/core-api/app/schemas/stats.py:8-18`
- Modify: `services/core-api/app/services/settings.py:172-236`

**Step 1: Update the stats schema**

In `services/core-api/app/schemas/stats.py`, add two fields to `UserStatsResponse`:

```python
class UserStatsResponse(BaseModel):
    """Response containing user statistics."""

    member_since: datetime
    legacies_count: int
    stories_count: int
    media_count: int
    storage_used_bytes: int
    chat_sessions_count: int
    legacy_views_total: int
    collaborators_count: int
    legacy_links_count: int
    favorites_count: int
```

**Step 2: Add queries to the stats service**

In `services/core-api/app/services/settings.py`, inside `get_user_stats()`, add two new queries before the return statement (after line 222). You'll need to import `UserFavorite` and `LegacyLink` at the top of the file.

Add these imports at the top of `settings.py`:
```python
from app.models.favorite import UserFavorite
from app.models.legacy_link import LegacyLink
```

Add these queries before the return statement:

```python
    # Count active legacy links accessible to user
    links_result = await db.execute(
        select(func.count(LegacyLink.id)).where(
            LegacyLink.status == "active",
            or_(
                LegacyLink.source_legacy_id.in_(
                    select(Legacy.id).where(Legacy.created_by == user_id)
                ),
                LegacyLink.target_legacy_id.in_(
                    select(Legacy.id).where(Legacy.created_by == user_id)
                ),
            ),
        )
    )
    legacy_links_count = links_result.scalar() or 0

    # Count user's favorites
    favorites_result = await db.execute(
        select(func.count(UserFavorite.id)).where(
            UserFavorite.user_id == user_id,
        )
    )
    favorites_count = favorites_result.scalar() or 0
```

And update the return statement to include the two new fields:

```python
    return UserStatsResponse(
        member_since=user.created_at,
        legacies_count=legacies_count,
        stories_count=stories_count,
        media_count=media_count,
        storage_used_bytes=storage_used,
        chat_sessions_count=0,
        legacy_views_total=0,
        collaborators_count=collaborators_count,
        legacy_links_count=legacy_links_count,
        favorites_count=favorites_count,
    )
```

You'll also need the `or_` import from SQLAlchemy. Check if it's already imported; if not, add it.

**Step 3: Write the test**

Create test in `services/core-api/tests/test_stats_extended.py`:

```python
"""Tests for extended user stats (legacy_links_count, favorites_count)."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestExtendedStats:
    """Tests for GET /api/users/me/stats extended fields."""

    @pytest.mark.asyncio
    async def test_stats_includes_legacy_links_count(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Stats response includes legacy_links_count field."""
        response = await client.get("/api/users/me/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "legacy_links_count" in data
        assert isinstance(data["legacy_links_count"], int)

    @pytest.mark.asyncio
    async def test_stats_includes_favorites_count(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Stats response includes favorites_count field."""
        response = await client.get("/api/users/me/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "favorites_count" in data
        assert isinstance(data["favorites_count"], int)
```

**Step 4: Run the tests**

```bash
cd services/core-api && uv run pytest tests/test_stats_extended.py -v
```

Expected: PASS

**Step 5: Run validation**

```bash
just validate-backend
```

Expected: PASS (ruff + mypy)

**Step 6: Commit**

```bash
git add services/core-api/app/schemas/stats.py services/core-api/app/services/settings.py services/core-api/tests/test_stats_extended.py
git commit -m "feat(api): add legacy_links_count and favorites_count to user stats"
```

---

## Task 2: Add Scope Parameter to Legacies Endpoint

Add a `scope` query parameter to `GET /api/legacies/` that filters by `all` (default), `created`, `connected`, or `favorites`. Return filter counts alongside results.

**Files:**
- Modify: `services/core-api/app/schemas/legacy.py`
- Modify: `services/core-api/app/services/legacy.py:249-304`
- Modify: `services/core-api/app/routes/legacy.py:70-89`
- Test: `services/core-api/tests/test_legacy_scope.py`

**Step 1: Add a new response schema with counts**

In `services/core-api/app/schemas/legacy.py`, add a new response model:

```python
class LegacyScopeCounts(BaseModel):
    """Filter counts for legacies hub."""
    all: int
    created: int
    connected: int

class LegacyScopedResponse(BaseModel):
    """Legacies list with scope filter counts."""
    items: list[LegacyResponse]
    counts: LegacyScopeCounts
```

**Step 2: Add `list_user_legacies_scoped` to the legacy service**

In `services/core-api/app/services/legacy.py`, add a new function after `list_user_legacies` (after line 304). This function queries all member legacies, computes counts, and filters by scope:

```python
async def list_user_legacies_scoped(
    db: AsyncSession,
    user_id: UUID,
    scope: str = "all",
) -> dict:
    """List legacies with scope filtering and counts.

    Scopes:
        all: all legacies where user has membership
        created: legacies user created
        connected: legacies where user is member but not creator
        favorites: user's favorited legacies

    Returns dict with 'items' (list of LegacyResponse) and 'counts'.
    """
    from app.models.favorite import UserFavorite

    # Query all member legacies (base set)
    result = await db.execute(
        select(Legacy, LegacyMember.role)
        .join(LegacyMember)
        .options(
            selectinload(Legacy.creator),
            selectinload(Legacy.profile_image),
        )
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .order_by(Legacy.created_at.desc())
    )
    rows = result.all()

    # Compute counts
    all_legacies = []
    created_legacies = []
    connected_legacies = []

    for legacy, role in rows:
        resp = LegacyResponse(
            id=legacy.id,
            name=legacy.name,
            birth_date=legacy.birth_date,
            death_date=legacy.death_date,
            biography=legacy.biography,
            visibility=legacy.visibility,
            created_by=legacy.created_by,
            created_at=legacy.created_at,
            updated_at=legacy.updated_at,
            creator_email=legacy.creator.email,
            creator_name=legacy.creator.name,
            person_id=legacy.person_id,
            profile_image_id=legacy.profile_image_id,
            profile_image_url=get_profile_image_url(legacy),
            favorite_count=legacy.favorite_count or 0,
        )
        all_legacies.append(resp)
        if role == "creator":
            created_legacies.append(resp)
        else:
            connected_legacies.append(resp)

    counts = {
        "all": len(all_legacies),
        "created": len(created_legacies),
        "connected": len(connected_legacies),
    }

    # Select items based on scope
    if scope == "created":
        items = created_legacies
    elif scope == "connected":
        items = connected_legacies
    elif scope == "favorites":
        # Query user's favorited legacy IDs
        fav_result = await db.execute(
            select(UserFavorite.entity_id).where(
                UserFavorite.user_id == user_id,
                UserFavorite.entity_type == "legacy",
            )
        )
        fav_ids = {row[0] for row in fav_result.all()}
        items = [l for l in all_legacies if l.id in fav_ids]
    else:
        items = all_legacies

    logger.info(
        "legacy.list_scoped",
        extra={
            "user_id": str(user_id),
            "scope": scope,
            "count": len(items),
        },
    )

    return {"items": items, "counts": counts}
```

**Step 3: Update the route handler**

In `services/core-api/app/routes/legacy.py`, modify the `list_legacies` endpoint (lines 70-89) to accept a `scope` parameter and return the new response model:

```python
from ..schemas.legacy import LegacyResponse, LegacyScopedResponse, LegacyScopeCounts

@router.get(
    "/",
    response_model=LegacyScopedResponse,
    summary="List user's legacies",
    description="List legacies where the user is a member, with scope filtering.",
)
async def list_legacies(
    request: Request,
    scope: Literal["all", "created", "connected", "favorites"] = Query(
        default="all", description="Filter scope"
    ),
    db: AsyncSession = Depends(get_db),
) -> LegacyScopedResponse:
    """List legacies with scope filtering and counts."""
    session = require_auth(request)

    result = await legacy_service.list_user_legacies_scoped(
        db=db,
        user_id=session.user_id,
        scope=scope,
    )
    return LegacyScopedResponse(
        items=result["items"],
        counts=LegacyScopeCounts(**result["counts"]),
    )
```

Add `Literal` import from `typing` if not already present.

**Step 4: Write the test**

Create `services/core-api/tests/test_legacy_scope.py`:

```python
"""Tests for legacy scope filtering on GET /api/legacies/."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestLegacyScope:
    """Tests for GET /api/legacies/?scope=..."""

    @pytest.mark.asyncio
    async def test_default_scope_returns_all_with_counts(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Default scope returns all legacies and counts object."""
        response = await client.get("/api/legacies/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "counts" in data
        assert "all" in data["counts"]
        assert "created" in data["counts"]
        assert "connected" in data["counts"]

    @pytest.mark.asyncio
    async def test_scope_created_filters_to_own_legacies(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'created' returns only legacies created by user."""
        response = await client.get(
            "/api/legacies/?scope=created", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["created_by"] == str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_connected_excludes_created(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'connected' returns only legacies user did not create."""
        response = await client.get(
            "/api/legacies/?scope=connected", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["created_by"] != str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_favorites_returns_empty_when_none(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Scope 'favorites' returns empty when user has no favorites."""
        response = await client.get(
            "/api/legacies/?scope=favorites", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
```

**Step 5: Run the tests**

```bash
cd services/core-api && uv run pytest tests/test_legacy_scope.py -v
```

Expected: PASS

**Step 6: Run validation**

```bash
just validate-backend
```

Expected: PASS

**Step 7: Commit**

```bash
git add services/core-api/app/schemas/legacy.py services/core-api/app/services/legacy.py services/core-api/app/routes/legacy.py services/core-api/tests/test_legacy_scope.py
git commit -m "feat(api): add scope parameter to legacies list endpoint"
```

---

## Task 3: Add Scope Parameter to Stories Endpoint

Add a `scope` query parameter to `GET /api/stories/` supporting `mine`, `shared`, and `favorites`.

**Files:**
- Modify: `services/core-api/app/routes/story.py:115-140`
- Modify: `services/core-api/app/services/story.py`
- Test: `services/core-api/tests/test_story_scope.py`

**Step 1: Add a new service function**

In `services/core-api/app/services/story.py`, add a new function `list_stories_scoped`:

```python
async def list_stories_scoped(
    db: AsyncSession,
    user_id: UUID,
    scope: str = "mine",
) -> list[StorySummary]:
    """List stories by scope.

    Scopes:
        mine: stories authored by the user
        shared: stories by others on legacies the user is a member of
        favorites: stories the user has favorited
    """
    from app.models.favorite import UserFavorite

    if scope == "mine":
        # Stories authored by user
        query = (
            select(Story)
            .options(
                selectinload(Story.author),
                selectinload(Story.legacy_associations),
            )
            .where(Story.author_id == user_id)
            .order_by(Story.created_at.desc())
        )
    elif scope == "shared":
        # Stories by others on legacies user is a member of
        user_legacy_ids = select(LegacyMember.legacy_id).where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        query = (
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
    elif scope == "favorites":
        fav_ids_subquery = select(UserFavorite.entity_id).where(
            UserFavorite.user_id == user_id,
            UserFavorite.entity_type == "story",
        )
        query = (
            select(Story)
            .options(
                selectinload(Story.author),
                selectinload(Story.legacy_associations),
            )
            .where(Story.id.in_(fav_ids_subquery))
            .order_by(Story.created_at.desc())
        )
    else:
        return []

    story_result = await db.execute(query)
    stories = story_result.scalars().unique().all()

    # Resolve legacy names
    all_legacy_ids: set[UUID] = set()
    for story in stories:
        all_legacy_ids.update(assoc.legacy_id for assoc in story.legacy_associations)
    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    summaries = [
        StorySummary(
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
        for story in stories
    ]

    logger.info(
        "story.list_scoped",
        extra={"user_id": str(user_id), "scope": scope, "count": len(summaries)},
    )

    return summaries
```

**Step 2: Update the route handler**

In `services/core-api/app/routes/story.py`, modify `list_stories` (lines 115-140) to accept an optional `scope` parameter. When `scope` is provided, use the scoped function; otherwise fall through to existing behavior for backward compatibility:

```python
@router.get(
    "/",
    response_model=list[StorySummary],
    summary="List stories",
    description="List stories filtered by visibility rules. Filter by legacy_id, orphaned flag, or scope.",
)
async def list_stories(
    request: Request,
    legacy_id: UUID | None = Query(None, description="Filter by legacy"),
    orphaned: bool = Query(False, description="Return only orphaned stories"),
    scope: Literal["mine", "shared", "favorites"] | None = Query(
        None, description="Filter scope (alternative to legacy_id/orphaned)"
    ),
    db: AsyncSession = Depends(get_db),
) -> list[StorySummary]:
    """List stories with optional filtering."""
    session = require_auth(request)

    if scope:
        return await story_service.list_stories_scoped(
            db=db,
            user_id=session.user_id,
            scope=scope,
        )

    return await story_service.list_legacy_stories(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        orphaned=orphaned,
    )
```

Add `Literal` import from `typing` if not already present.

**Step 3: Write the test**

Create `services/core-api/tests/test_story_scope.py`:

```python
"""Tests for story scope filtering on GET /api/stories/."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestStoryScope:
    """Tests for GET /api/stories/?scope=..."""

    @pytest.mark.asyncio
    async def test_scope_mine_returns_authored_stories(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'mine' returns stories authored by the user."""
        response = await client.get(
            "/api/stories/?scope=mine", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for item in data:
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
        for item in data:
            assert item["author_id"] != str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_favorites_returns_empty_when_none(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Scope 'favorites' returns empty when no favorites."""
        response = await client.get(
            "/api/stories/?scope=favorites", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_existing_legacy_id_filter_still_works(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Backward compatibility: legacy_id filter still works without scope."""
        response = await client.get("/api/stories/", headers=auth_headers)
        assert response.status_code == 200
```

**Step 4: Run the tests**

```bash
cd services/core-api && uv run pytest tests/test_story_scope.py -v
```

Expected: PASS

**Step 5: Run validation**

```bash
just validate-backend
```

Expected: PASS

**Step 6: Commit**

```bash
git add services/core-api/app/routes/story.py services/core-api/app/services/story.py services/core-api/tests/test_story_scope.py
git commit -m "feat(api): add scope parameter to stories list endpoint"
```

---

## Task 4: Update Frontend Legacy API & Hooks

Update the frontend API functions and hooks to support the new scoped response.

**Files:**
- Modify: `apps/web/src/features/legacy/api/legacies.ts:81-83`
- Modify: `apps/web/src/features/legacy/hooks/useLegacies.ts:21-42`

**Step 1: Update the API types and function**

In `apps/web/src/features/legacy/api/legacies.ts`, add new types and update `getLegacies`:

```typescript
// Add after the Legacy interface (around line 32):
export type LegacyScope = 'all' | 'created' | 'connected' | 'favorites';

export interface LegacyScopeCounts {
  all: number;
  created: number;
  connected: number;
}

export interface LegacyScopedResponse {
  items: Legacy[];
  counts: LegacyScopeCounts;
}
```

Replace the existing `getLegacies` function (line 81-83):

```typescript
export async function getLegacies(scope: LegacyScope = 'all'): Promise<LegacyScopedResponse> {
  const params = new URLSearchParams({ scope });
  return apiGet<LegacyScopedResponse>(`/api/legacies/?${params.toString()}`);
}
```

**Step 2: Update the hooks**

In `apps/web/src/features/legacy/hooks/useLegacies.ts`, update the imports to include the new types and modify `useLegacies`:

Add `LegacyScope` and `LegacyScopedResponse` to the imports from `legacies.ts`.

Update the `legacyKeys` factory to include scope:

```typescript
export const legacyKeys = {
  all: ['legacies'] as const,
  lists: () => [...legacyKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...legacyKeys.lists(), filters] as const,
  scoped: (scope: string) => [...legacyKeys.lists(), { scope }] as const,
  details: () => [...legacyKeys.all, 'detail'] as const,
  detail: (id: string) => [...legacyKeys.details(), id] as const,
  explore: () => [...legacyKeys.all, 'explore'] as const,
};
```

Update `useLegacies` to accept a scope parameter:

```typescript
export function useLegacies(scope: LegacyScope = 'all', options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: legacyKeys.scoped(scope),
    queryFn: () => getLegacies(scope),
    enabled: options?.enabled ?? true,
  });
}
```

**Step 3: Fix callers of `useLegacies`**

Search for all existing callers of `useLegacies()` and update them. The main caller is `LegaciesPage.tsx` which will be rewritten later. Check for other callers (e.g., `DashboardPage.tsx`). If they call `useLegacies()` without arguments, they'll get the `all` scope by default — but they now receive `LegacyScopedResponse` instead of `Legacy[]`, so they need to access `.items`.

Find all files that import `useLegacies` and update their data access pattern from `data` to `data?.items`. Common pattern:

```typescript
// Before:
const { data: myLegacies } = useLegacies();
// myLegacies?.map(...)

// After:
const { data } = useLegacies();
// data?.items?.map(...)
```

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/api/legacies.ts apps/web/src/features/legacy/hooks/useLegacies.ts
# Also add any files updated in step 3
git commit -m "feat(web): update legacy API and hooks for scoped responses"
```

---

## Task 5: Update Frontend Story API & Hooks

Update the stories API and hooks to support the `scope` parameter.

**Files:**
- Modify: `apps/web/src/features/story/api/stories.ts:73-79`
- Modify: `apps/web/src/features/story/hooks/useStories.ts:15-34`

**Step 1: Update the API function**

In `apps/web/src/features/story/api/stories.ts`, add the scope type and update `getStories`:

```typescript
// Add near the top with other types:
export type StoryScope = 'mine' | 'shared' | 'favorites';
```

Update `getStories` to accept an optional scope parameter:

```typescript
export async function getStories(
  legacyId?: string,
  orphaned?: boolean,
  scope?: StoryScope,
): Promise<StorySummary[]> {
  const params = new URLSearchParams();
  if (scope) {
    params.append('scope', scope);
  } else {
    if (legacyId) params.append('legacy_id', legacyId);
    if (orphaned !== undefined) params.append('orphaned', String(orphaned));
  }
  const queryString = params.toString();
  return apiGet<StorySummary[]>(`/api/stories/${queryString ? `?${queryString}` : ''}`);
}
```

**Step 2: Update the hooks**

In `apps/web/src/features/story/hooks/useStories.ts`, add scope-aware query key and a new hook:

Add `StoryScope` to the imports from `stories.ts`.

Extend `storyKeys`:

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
  details: () => [...storyKeys.all, 'detail'] as const,
  detail: (storyId: string) => [...storyKeys.details(), storyId] as const,
};
```

Add a new hook for scoped story queries:

```typescript
export function useScopedStories(scope: StoryScope) {
  return useQuery({
    queryKey: storyKeys.scoped(scope),
    queryFn: () => getStories(undefined, undefined, scope),
  });
}
```

The existing `useStories` hook remains unchanged for backward compatibility.

**Step 3: Commit**

```bash
git add apps/web/src/features/story/api/stories.ts apps/web/src/features/story/hooks/useStories.ts
git commit -m "feat(web): update story API and hooks for scoped queries"
```

---

## Task 6: Build QuickFilters Component

Create the reusable pill-toggle filter component.

**Files:**
- Create: `apps/web/src/components/legacies-hub/QuickFilters.tsx`
- Test: `apps/web/src/components/legacies-hub/QuickFilters.test.tsx`

**Step 1: Create the component**

```typescript
import { cn } from '@/components/ui/utils';

export interface FilterOption {
  key: string;
  label: string;
  count?: number;
}

interface QuickFiltersProps {
  options: FilterOption[];
  activeKey: string;
  onChange: (key: string) => void;
}

export default function QuickFilters({ options, activeKey, onChange }: QuickFiltersProps) {
  return (
    <div className="flex gap-2 flex-wrap" role="group" aria-label="Quick filters">
      {options.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          aria-pressed={activeKey === option.key}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
            activeKey === option.key
              ? 'bg-theme-primary text-white'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="ml-1.5 text-xs opacity-75">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Write the test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickFilters from './QuickFilters';

const options = [
  { key: 'all', label: 'All', count: 8 },
  { key: 'mine', label: 'Mine', count: 3 },
  { key: 'shared', label: 'Shared', count: 5 },
];

describe('QuickFilters', () => {
  it('renders all filter options', () => {
    render(<QuickFilters options={options} activeKey="all" onChange={() => {}} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });

  it('sets aria-pressed on active filter', () => {
    render(<QuickFilters options={options} activeKey="mine" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /mine/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /all/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when a filter is clicked', async () => {
    const onChange = vi.fn();
    render(<QuickFilters options={options} activeKey="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /shared/i }));
    expect(onChange).toHaveBeenCalledWith('shared');
  });

  it('renders counts when provided', () => {
    render(<QuickFilters options={options} activeKey="all" onChange={() => {}} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
```

**Step 3: Run the test**

```bash
cd apps/web && npm run test -- --run src/components/legacies-hub/QuickFilters.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/legacies-hub/QuickFilters.tsx apps/web/src/components/legacies-hub/QuickFilters.test.tsx
git commit -m "feat(web): add QuickFilters component for legacies hub"
```

---

## Task 7: Build StatsBar Component

Create the stats bar showing legacies, stories, connections, and favorites counts.

**Files:**
- Create: `apps/web/src/components/legacies-hub/StatsBar.tsx`
- Test: `apps/web/src/components/legacies-hub/StatsBar.test.tsx`

**Step 1: Create the component**

```typescript
import { Landmark, BookOpen, Link, Heart, Loader2 } from 'lucide-react';
import { useStats } from '@/features/settings/hooks/useSettings';

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

export default function StatsBar() {
  const { data: stats, isLoading } = useStats();

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
      <StatItem icon={<Landmark className="size-5" />} count={stats.legacies_count} label="Legacies" />
      <StatItem icon={<BookOpen className="size-5" />} count={stats.stories_count} label="Stories" />
      <StatItem icon={<Link className="size-5" />} count={stats.legacy_links_count} label="Connections" />
      <StatItem icon={<Heart className="size-5" />} count={stats.favorites_count} label="Favorites" />
    </div>
  );
}
```

Note: The `useStats` hook returns the `UserStatsResponse` type. After Task 1, the backend returns the new fields. The frontend type in `apps/web/src/features/settings/api/settings.ts` will need updating to include `legacy_links_count` and `favorites_count`. Find the stats response type and add the two fields.

**Step 2: Update the frontend stats type**

Find the stats response type in `apps/web/src/features/settings/api/settings.ts` and add:

```typescript
legacy_links_count: number;
favorites_count: number;
```

**Step 3: Write the test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StatsBar from './StatsBar';

vi.mock('@/features/settings/hooks/useSettings', () => ({
  useStats: () => ({
    data: {
      legacies_count: 3,
      stories_count: 5,
      legacy_links_count: 72,
      favorites_count: 2,
    },
    isLoading: false,
  }),
}));

function renderStatsBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StatsBar />
    </QueryClientProvider>,
  );
}

describe('StatsBar', () => {
  it('renders all four stat items', () => {
    renderStatsBar();
    expect(screen.getByText('Legacies')).toBeInTheDocument();
    expect(screen.getByText('Stories')).toBeInTheDocument();
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });

  it('displays the correct counts', () => {
    renderStatsBar();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
```

**Step 4: Run the test**

```bash
cd apps/web && npm run test -- --run src/components/legacies-hub/StatsBar.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/legacies-hub/StatsBar.tsx apps/web/src/components/legacies-hub/StatsBar.test.tsx apps/web/src/features/settings/api/settings.ts
git commit -m "feat(web): add StatsBar component for legacies hub"
```

---

## Task 8: Build RecentlyViewedChips Component

Create the compact horizontal chip row for recently viewed legacies.

**Files:**
- Create: `apps/web/src/components/legacies-hub/RecentlyViewedChips.tsx`
- Test: `apps/web/src/components/legacies-hub/RecentlyViewedChips.test.tsx`

**Step 1: Create the component**

```typescript
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';
import { rewriteBackendUrlForDev } from '@/lib/url';
import type { EnrichedRecentItem } from '@/features/activity/api/activity';

function Chip({ item, onClick }: { item: EnrichedRecentItem; onClick: () => void }) {
  const entity = item.entity;
  if (!entity) return null;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 min-w-0 group"
    >
      <div className="size-12 rounded-full overflow-hidden bg-neutral-100 ring-2 ring-transparent group-hover:ring-theme-primary transition-all">
        {entity.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(entity.profile_image_url)}
            alt={entity.name || ''}
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full flex items-center justify-center">
            <Users className="size-5 text-neutral-300" />
          </div>
        )}
      </div>
      <span className="text-xs text-neutral-600 truncate max-w-[72px]">
        {entity.name?.split(' ')[0] || 'Unknown'}
      </span>
    </button>
  );
}

export default function RecentlyViewedChips() {
  const navigate = useNavigate();
  const { data, isLoading } = useRecentlyViewed('legacy', 6);

  if (isLoading) return null;
  if (!data || !data.tracking_enabled || data.items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-500">Recently Viewed</h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.items.map((item) => (
          <Chip
            key={item.entity_id}
            item={item}
            onClick={() => navigate(`/legacy/${item.entity_id}`)}
          />
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
import RecentlyViewedChips from './RecentlyViewedChips';

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({
    data: {
      tracking_enabled: true,
      items: [
        {
          entity_id: '1',
          entity_type: 'legacy',
          last_action: 'viewed',
          last_activity_at: '2026-01-01',
          metadata: null,
          entity: { name: 'Margaret Chen', profile_image_url: null },
        },
        {
          entity_id: '2',
          entity_type: 'legacy',
          last_action: 'viewed',
          last_activity_at: '2026-01-02',
          metadata: null,
          entity: { name: 'Captain Torres', profile_image_url: null },
        },
      ],
    },
    isLoading: false,
  }),
}));

function renderChips() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RecentlyViewedChips />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RecentlyViewedChips', () => {
  it('renders recently viewed section title', () => {
    renderChips();
    expect(screen.getByText('Recently Viewed')).toBeInTheDocument();
  });

  it('renders chips for each item', () => {
    renderChips();
    expect(screen.getByText('Margaret')).toBeInTheDocument();
    expect(screen.getByText('Captain')).toBeInTheDocument();
  });
});
```

**Step 3: Run the test**

```bash
cd apps/web && npm run test -- --run src/components/legacies-hub/RecentlyViewedChips.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/legacies-hub/RecentlyViewedChips.tsx apps/web/src/components/legacies-hub/RecentlyViewedChips.test.tsx
git commit -m "feat(web): add RecentlyViewedChips component for legacies hub"
```

---

## Task 9: Build Tab Content Components

Create the three tab content components: LegaciesTabContent, StoriesTabContent, ActivityTabContent.

**Files:**
- Create: `apps/web/src/components/legacies-hub/LegaciesTabContent.tsx`
- Create: `apps/web/src/components/legacies-hub/StoriesTabContent.tsx`
- Create: `apps/web/src/components/legacies-hub/ActivityTabContent.tsx`

**Step 1: Create LegaciesTabContent**

```typescript
import { useNavigate } from 'react-router-dom';
import { Loader2, BookHeart, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import LegacyCard from '@/components/legacy/LegacyCard';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import type { LegacyScope } from '@/features/legacy/api/legacies';
import QuickFilters from './QuickFilters';
import type { FilterOption } from './QuickFilters';

interface LegaciesTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export default function LegaciesTabContent({ activeFilter, onFilterChange }: LegaciesTabContentProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useLegacies(activeFilter as LegacyScope);

  const legacyIds = data?.items?.map((l) => l.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('legacy', legacyIds);

  const filterOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: data?.counts?.all },
    { key: 'created', label: 'My Legacies', count: data?.counts?.created },
    { key: 'connected', label: 'Connected', count: data?.counts?.connected },
    { key: 'favorites', label: 'Favorites' },
  ];

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
          {data.items.map((legacy) => (
            <LegacyCard
              key={legacy.id}
              legacy={legacy}
              trailingAction={
                <FavoriteButton
                  entityType="legacy"
                  entityId={legacy.id}
                  isFavorited={favoriteData?.favorites[legacy.id] ?? false}
                  favoriteCount={legacy.favorite_count ?? 0}
                />
              }
            />
          ))}

          {/* Create New Legacy Card */}
          <Card
            className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group border-2 border-dashed border-neutral-300 hover:border-theme-primary bg-neutral-50 hover:bg-white"
            onClick={() => navigate('/legacy/new')}
          >
            <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to">
              <div className="text-center space-y-3">
                <div className="size-16 rounded-full bg-white/80 flex items-center justify-center mx-auto">
                  <Plus className="size-8 text-theme-primary" />
                </div>
                <p className="text-neutral-700">Create New Legacy</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <h3 className="text-neutral-900 text-center">Start a New Tribute</h3>
              <p className="text-sm text-neutral-600 text-center">Honor someone special with a digital legacy</p>
            </div>
          </Card>
        </div>
      )}

      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-center py-12">
          <BookHeart className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter === 'favorites'
              ? "You haven't favorited any legacies yet."
              : activeFilter === 'connected'
                ? "You haven't joined any legacies yet."
                : 'No legacies found.'}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create StoriesTabContent**

```typescript
import { Loader2, BookOpen } from 'lucide-react';
import StoryCard from '@/features/legacy/components/StoryCard';
import { useScopedStories } from '@/features/story/hooks/useStories';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import type { StoryScope } from '@/features/story/api/stories';
import QuickFilters from './QuickFilters';
import type { FilterOption } from './QuickFilters';

interface StoriesTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

const filterOptions: FilterOption[] = [
  { key: 'mine', label: 'My Stories' },
  { key: 'shared', label: 'Shared' },
  { key: 'favorites', label: 'Favorites' },
];

export default function StoriesTabContent({ activeFilter, onFilterChange }: StoriesTabContentProps) {
  const { data: stories, isLoading } = useScopedStories(activeFilter as StoryScope);

  const storyIds = stories?.map((s) => s.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('story', storyIds);

  return (
    <div className="space-y-6">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && stories && stories.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              isFavorited={favoriteData?.favorites[story.id] ?? false}
            />
          ))}
        </div>
      )}

      {!isLoading && (!stories || stories.length === 0) && (
        <div className="text-center py-12">
          <BookOpen className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter === 'favorites'
              ? "You haven't favorited any stories yet."
              : activeFilter === 'shared'
                ? 'No shared stories from your connected legacies.'
                : "You haven't written any stories yet."}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create ActivityTabContent**

```typescript
import { Loader2, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ActivityFeedItem from '@/features/activity/components/ActivityFeedItem';
import { useSocialFeed } from '@/features/activity/hooks/useActivity';
import { useAuth } from '@/contexts/AuthContext';
import type { SocialFeedItem } from '@/features/activity/api/activity';
import QuickFilters from './QuickFilters';
import type { FilterOption } from './QuickFilters';

interface ActivityTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

const filterOptions: FilterOption[] = [
  { key: 'all', label: 'All Activity' },
  { key: 'mine', label: 'My Activity' },
];

export default function ActivityTabContent({ activeFilter, onFilterChange }: ActivityTabContentProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: feedData, isLoading } = useSocialFeed(20);

  // Filter items based on scope
  const items = feedData?.items?.filter((item) => {
    if (activeFilter === 'mine') {
      return item.actor.id === user?.id;
    }
    return true; // 'all' shows everything
  }) ?? [];

  const handleActivityClick = (item: SocialFeedItem) => {
    if (item.entity_type === 'legacy') {
      navigate(`/legacy/${item.entity_id}`);
    } else if (item.entity_type === 'story') {
      const legacyId = item.entity?.legacy_id;
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
          <p className="text-neutral-600">No activity to show yet.</p>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add apps/web/src/components/legacies-hub/LegaciesTabContent.tsx apps/web/src/components/legacies-hub/StoriesTabContent.tsx apps/web/src/components/legacies-hub/ActivityTabContent.tsx
git commit -m "feat(web): add tab content components for legacies hub"
```

---

## Task 10: Rewrite LegaciesPage

Compose all new components into the rewritten page.

**Files:**
- Modify: `apps/web/src/pages/LegaciesPage.tsx` (full rewrite)
- Modify: `apps/web/src/pages/LegaciesPage.test.tsx` (update tests)

**Step 1: Rewrite the page**

Replace the entire content of `apps/web/src/pages/LegaciesPage.tsx`:

```typescript
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Footer from '@/components/Footer';
import StatsBar from '@/components/legacies-hub/StatsBar';
import RecentlyViewedChips from '@/components/legacies-hub/RecentlyViewedChips';
import LegaciesTabContent from '@/components/legacies-hub/LegaciesTabContent';
import StoriesTabContent from '@/components/legacies-hub/StoriesTabContent';
import ActivityTabContent from '@/components/legacies-hub/ActivityTabContent';

const DEFAULT_TAB = 'legacies';
const DEFAULT_FILTERS: Record<string, string> = {
  legacies: 'all',
  stories: 'mine',
  activity: 'all',
};

export default function LegaciesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || DEFAULT_TAB;
  const activeFilter = searchParams.get('filter') || DEFAULT_FILTERS[activeTab] || 'all';

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
              <h1 className="text-2xl font-bold text-neutral-900">Legacies</h1>
              <p className="text-neutral-600 text-sm">
                Your collection of legacies, stories, and connections.
              </p>
            </div>
            <Button
              onClick={() => navigate('/legacy/new')}
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
            >
              <Plus className="size-4" />
              New Legacy
            </Button>
          </div>

          {/* Stats */}
          <StatsBar />

          {/* Recently Viewed */}
          <RecentlyViewedChips />

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="legacies">Legacies</TabsTrigger>
              <TabsTrigger value="stories">Stories</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="legacies">
              <LegaciesTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="stories">
              <StoriesTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Footer />
    </div>
  );
}
```

**Step 2: Update the tests**

Replace `apps/web/src/pages/LegaciesPage.test.tsx`:

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

vi.mock('@/features/settings/hooks/useSettings', () => ({
  useStats: () => ({
    data: {
      legacies_count: 3,
      stories_count: 5,
      legacy_links_count: 72,
      favorites_count: 2,
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({
    data: { tracking_enabled: false, items: [] },
    isLoading: false,
  }),
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

vi.mock('@/features/story/hooks/useStories', () => ({
  useScopedStories: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

vi.mock('@/components/Footer', () => ({
  default: () => <footer data-testid="footer" />,
}));

import LegaciesPage from './LegaciesPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegaciesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LegaciesPage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('Legacies')).toBeInTheDocument();
  });

  it('renders the New Legacy button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /new legacy/i })).toBeInTheDocument();
  });

  it('renders stats bar', () => {
    renderPage();
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });

  it('renders tab triggers', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /stories/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });
});
```

**Step 3: Run the tests**

```bash
cd apps/web && npm run test -- --run src/pages/LegaciesPage.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/pages/LegaciesPage.tsx apps/web/src/pages/LegaciesPage.test.tsx
git commit -m "feat(web): rewrite LegaciesPage as tabbed hub"
```

---

## Task 11: Fix Callers & Run Full Test Suite

Find and fix all callers affected by the `useLegacies` response shape change, then run the full test suite.

**Files:**
- Possibly modify: Any file importing `useLegacies` (search codebase)
- Possibly modify: `apps/web/src/pages/DashboardPage.tsx` and others

**Step 1: Search for all `useLegacies` callers**

```bash
cd apps/web && grep -rn "useLegacies" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

For each caller: the return type changed from `Legacy[]` to `LegacyScopedResponse`. Update data access from `data?.map(...)` to `data?.items?.map(...)`.

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
git commit -m "fix: update callers for new legacies scoped response"
```

---

## Task 12: Manual Smoke Test

Verify the redesigned page works end-to-end in the browser.

**Step 1: Start services**

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

**Step 2: Verify backend**

```bash
# Stats endpoint returns new fields
curl -s http://localhost:8080/api/users/me/stats -H "Authorization: Bearer <token>" | python3 -m json.tool

# Legacies endpoint returns scoped response
curl -s "http://localhost:8080/api/legacies/?scope=all" -H "Authorization: Bearer <token>" | python3 -m json.tool

# Stories endpoint accepts scope
curl -s "http://localhost:8080/api/stories/?scope=mine" -H "Authorization: Bearer <token>" | python3 -m json.tool
```

**Step 3: Verify frontend**

Open http://localhost:5173/legacies and verify:
- Stats bar displays with correct counts
- Recently viewed chips appear (if items exist)
- Legacies tab shows with All/My Legacies/Connected/Favorites filters
- Switching to Stories tab shows My Stories/Shared/Favorites
- Switching to Activity tab shows All Activity/My Activity
- URL updates with `?tab=...&filter=...` on tab/filter changes
- Browser back button restores previous tab/filter state

**Step 4: Final commit (if any small fixes needed)**

```bash
git add -A
git commit -m "fix: address smoke test findings"
```
