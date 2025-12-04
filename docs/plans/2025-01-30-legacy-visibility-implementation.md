# Legacy Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add public/private visibility to legacies, with private legacies only visible to invited members.

**Architecture:** Add `visibility` field to Legacy model. Modify explore/search/detail endpoints to filter by visibility. Update frontend to display visibility indicators and add creation/edit controls.

**Tech Stack:** Python/FastAPI, SQLAlchemy, Alembic, React/TypeScript, TanStack Query

---

## Task 1: Add Visibility Field to Legacy Model

**Files:**
- Modify: `services/core-api/app/models/legacy.py:20-82`

**Step 1: Write the failing test**

Create test file `services/core-api/tests/test_legacy_visibility.py`:

```python
"""Tests for legacy visibility feature."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.user import User


class TestLegacyVisibilityModel:
    """Tests for Legacy model visibility field."""

    @pytest.mark.asyncio
    async def test_legacy_default_visibility_is_private(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test that new legacies default to private visibility."""
        legacy = Legacy(
            name="Test Legacy",
            created_by=test_user.id,
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        assert legacy.visibility == "private"

    @pytest.mark.asyncio
    async def test_legacy_can_be_created_as_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test that legacies can be created with public visibility."""
        legacy = Legacy(
            name="Public Legacy",
            created_by=test_user.id,
            visibility="public",
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        assert legacy.visibility == "public"
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py -v
```

Expected: FAIL with `TypeError: __init__() got an unexpected keyword argument 'visibility'`

**Step 3: Add visibility field to Legacy model**

Edit `services/core-api/app/models/legacy.py`, add after line 34 (after `biography`):

```python
    visibility: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="private",
        index=True,
    )
```

Also add `String` to the imports on line 7 if not present (it should already be there).

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/models/legacy.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(model): add visibility field to Legacy model"
```

---

## Task 2: Create Database Migration

**Files:**
- Create: `services/core-api/alembic/versions/xxxx_add_legacy_visibility.py`

**Step 1: Generate migration**

```bash
cd services/core-api && uv run alembic revision --autogenerate -m "add_legacy_visibility"
```

**Step 2: Edit migration to set existing legacies to public**

Open the generated migration file and modify the `upgrade()` function:

```python
def upgrade() -> None:
    # Add visibility column with default 'private' for new legacies
    op.add_column(
        'legacies',
        sa.Column('visibility', sa.String(length=20), server_default='private', nullable=False)
    )
    op.create_index(op.f('ix_legacies_visibility'), 'legacies', ['visibility'], unique=False)

    # Set all existing legacies to 'public' to preserve current behavior
    op.execute("UPDATE legacies SET visibility = 'public'")


def downgrade() -> None:
    op.drop_index(op.f('ix_legacies_visibility'), table_name='legacies')
    op.drop_column('legacies', 'visibility')
```

**Step 3: Run migration locally**

```bash
cd services/core-api && uv run alembic upgrade head
```

Expected: Migration completes successfully

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(db): add migration for legacy visibility column"
```

---

## Task 3: Update Pydantic Schemas

**Files:**
- Modify: `services/core-api/app/schemas/legacy.py`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_legacy_visibility.py`:

```python
from app.schemas.legacy import LegacyCreate, LegacyUpdate, LegacyResponse


class TestLegacyVisibilitySchemas:
    """Tests for legacy visibility in Pydantic schemas."""

    def test_legacy_create_defaults_to_private(self):
        """Test LegacyCreate defaults visibility to private."""
        data = LegacyCreate(name="Test")
        assert data.visibility == "private"

    def test_legacy_create_accepts_public(self):
        """Test LegacyCreate accepts public visibility."""
        data = LegacyCreate(name="Test", visibility="public")
        assert data.visibility == "public"

    def test_legacy_create_rejects_invalid_visibility(self):
        """Test LegacyCreate rejects invalid visibility values."""
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            LegacyCreate(name="Test", visibility="invalid")

    def test_legacy_update_visibility_optional(self):
        """Test LegacyUpdate has optional visibility field."""
        data = LegacyUpdate()
        assert data.visibility is None

    def test_legacy_response_includes_visibility(self):
        """Test LegacyResponse includes visibility field."""
        from datetime import datetime
        from uuid import uuid4

        response = LegacyResponse(
            id=uuid4(),
            name="Test",
            birth_date=None,
            death_date=None,
            biography=None,
            created_by=uuid4(),
            created_at=datetime.now(),
            updated_at=datetime.now(),
            visibility="public",
        )
        assert response.visibility == "public"
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestLegacyVisibilitySchemas -v
```

Expected: FAIL with `unexpected keyword argument 'visibility'`

**Step 3: Update schemas**

Edit `services/core-api/app/schemas/legacy.py`:

Add `Literal` to imports:

```python
from typing import Literal
```

Add to `LegacyCreate` class (after `biography` field):

```python
    visibility: Literal["public", "private"] = Field(
        default="private",
        description="Legacy visibility: 'public' (anyone can view) or 'private' (members only)",
    )
```

Add to `LegacyUpdate` class (after `biography` field):

```python
    visibility: Literal["public", "private"] | None = Field(
        default=None,
        description="Legacy visibility: 'public' or 'private'",
    )
```

Add to `LegacyResponse` class (after `updated_at` field):

```python
    # Visibility
    visibility: str = "private"
```

Add to `LegacySearchResponse` class (after `created_at` field):

```python
    # Visibility
    visibility: str = "private"
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestLegacyVisibilitySchemas -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/schemas/legacy.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(schema): add visibility field to legacy schemas"
```

---

## Task 4: Update Create Legacy Service

**Files:**
- Modify: `services/core-api/app/services/legacy.py:158-221`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_legacy_visibility.py`:

```python
from app.services import legacy as legacy_service
from app.schemas.legacy import LegacyCreate


class TestCreateLegacyVisibility:
    """Tests for creating legacies with visibility."""

    @pytest.mark.asyncio
    async def test_create_legacy_default_private(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test creating legacy defaults to private."""
        data = LegacyCreate(name="Test Legacy")
        result = await legacy_service.create_legacy(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )
        assert result.visibility == "private"

    @pytest.mark.asyncio
    async def test_create_legacy_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test creating public legacy."""
        data = LegacyCreate(name="Public Legacy", visibility="public")
        result = await legacy_service.create_legacy(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )
        assert result.visibility == "public"
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestCreateLegacyVisibility -v
```

Expected: FAIL - response doesn't include visibility

**Step 3: Update create_legacy service**

Edit `services/core-api/app/services/legacy.py`:

In `create_legacy` function, update the `Legacy` creation (around line 176):

```python
    legacy = Legacy(
        name=data.name,
        birth_date=data.birth_date,
        death_date=data.death_date,
        biography=data.biography,
        visibility=data.visibility,  # Add this line
        created_by=user_id,
    )
```

Update the return `LegacyResponse` (around line 210):

```python
    return LegacyResponse(
        id=legacy.id,
        name=legacy.name,
        birth_date=legacy.birth_date,
        death_date=legacy.death_date,
        biography=legacy.biography,
        visibility=legacy.visibility,  # Add this line
        created_by=legacy.created_by,
        created_at=legacy.created_at,
        updated_at=legacy.updated_at,
        creator_email=creator.email,
        creator_name=creator.name,
    )
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestCreateLegacyVisibility -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(service): support visibility in create_legacy"
```

---

## Task 5: Update All Service Functions to Return Visibility

**Files:**
- Modify: `services/core-api/app/services/legacy.py`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_legacy_visibility.py`:

```python
from app.models.legacy import LegacyMember


class TestServiceFunctionsReturnVisibility:
    """Tests that all service functions return visibility."""

    @pytest.mark.asyncio
    async def test_list_user_legacies_includes_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test list_user_legacies includes visibility."""
        # Create a legacy
        legacy = Legacy(name="Test", created_by=test_user.id, visibility="public")
        db_session.add(legacy)
        await db_session.flush()

        member = LegacyMember(legacy_id=legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.list_user_legacies(db=db_session, user_id=test_user.id)
        assert len(result) >= 1
        assert result[0].visibility == "public"

    @pytest.mark.asyncio
    async def test_get_legacy_detail_includes_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test get_legacy_detail includes visibility."""
        legacy = Legacy(name="Test", created_by=test_user.id, visibility="private")
        db_session.add(legacy)
        await db_session.flush()

        member = LegacyMember(legacy_id=legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.get_legacy_detail(
            db=db_session,
            user_id=test_user.id,
            legacy_id=legacy.id,
        )
        assert result.visibility == "private"

    @pytest.mark.asyncio
    async def test_explore_legacies_includes_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test explore_legacies includes visibility."""
        legacy = Legacy(name="Test", created_by=test_user.id, visibility="public")
        db_session.add(legacy)
        await db_session.commit()

        result = await legacy_service.explore_legacies(db=db_session)
        assert len(result) >= 1
        # Find our legacy
        our_legacy = next((l for l in result if l.name == "Test"), None)
        assert our_legacy is not None
        assert our_legacy.visibility == "public"

    @pytest.mark.asyncio
    async def test_search_legacies_includes_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test search_legacies includes visibility."""
        legacy = Legacy(name="Searchable", created_by=test_user.id, visibility="public")
        db_session.add(legacy)
        await db_session.commit()

        result = await legacy_service.search_legacies_by_name(db=db_session, query="Searchable")
        assert len(result) >= 1
        assert result[0].visibility == "public"
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestServiceFunctionsReturnVisibility -v
```

Expected: FAIL - visibility not in responses

**Step 3: Update all service functions**

Edit `services/core-api/app/services/legacy.py`:

**In `list_user_legacies` (around line 260-276):** Add `visibility=legacy.visibility,` to the LegacyResponse constructor.

**In `search_legacies_by_name` (around line 309-318):** Add `visibility=legacy.visibility,` to the LegacySearchResponse constructor.

**In `explore_legacies` (around line 355-384):** Add `visibility=legacy.visibility,` to the LegacyResponse constructor.

**In `get_legacy_public` (around line 447-461):** Add `visibility=legacy.visibility,` to the LegacyResponse constructor.

**In `get_legacy_detail` (around line 532-546):** Add `visibility=legacy.visibility,` to the LegacyResponse constructor.

**In `update_legacy` (around line 744-755):** Add `visibility=legacy.visibility,` to the LegacyResponse constructor.

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestServiceFunctionsReturnVisibility -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(service): return visibility in all legacy service functions"
```

---

## Task 6: Update Explore Legacies to Filter by Visibility

**Files:**
- Modify: `services/core-api/app/services/legacy.py:321-384`
- Modify: `services/core-api/app/routes/legacy.py:80-101`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_legacy_visibility.py`:

```python
class TestExploreVisibilityFiltering:
    """Tests for explore endpoint visibility filtering."""

    @pytest.mark.asyncio
    async def test_explore_unauthenticated_only_shows_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test unauthenticated explore only returns public legacies."""
        # Create public and private legacies
        public_legacy = Legacy(name="Public One", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="Private One", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.commit()

        # Explore without user_id (unauthenticated)
        result = await legacy_service.explore_legacies(db=db_session, user_id=None)

        names = [l.name for l in result]
        assert "Public One" in names
        assert "Private One" not in names

    @pytest.mark.asyncio
    async def test_explore_authenticated_shows_public_and_accessible_private(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ):
        """Test authenticated explore shows public + private legacies user is member of."""
        # Create public legacy by user 2
        public_legacy = Legacy(name="Public By Other", created_by=test_user_2.id, visibility="public")
        db_session.add(public_legacy)

        # Create private legacy user is member of
        private_member = Legacy(name="Private Member", created_by=test_user_2.id, visibility="private")
        db_session.add(private_member)
        await db_session.flush()
        member = LegacyMember(legacy_id=private_member.id, user_id=test_user.id, role="advocate")
        db_session.add(member)

        # Create private legacy user is NOT member of
        private_other = Legacy(name="Private Other", created_by=test_user_2.id, visibility="private")
        db_session.add(private_other)
        await db_session.commit()

        result = await legacy_service.explore_legacies(db=db_session, user_id=test_user.id)

        names = [l.name for l in result]
        assert "Public By Other" in names
        assert "Private Member" in names
        assert "Private Other" not in names

    @pytest.mark.asyncio
    async def test_explore_filter_public_only(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test explore with visibility_filter='public'."""
        public_legacy = Legacy(name="Filter Public", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="Filter Private", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.flush()

        # Add user as member of private legacy
        member = LegacyMember(legacy_id=private_legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.explore_legacies(
            db=db_session,
            user_id=test_user.id,
            visibility_filter="public",
        )

        names = [l.name for l in result]
        assert "Filter Public" in names
        assert "Filter Private" not in names

    @pytest.mark.asyncio
    async def test_explore_filter_private_only(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test explore with visibility_filter='private'."""
        public_legacy = Legacy(name="Filter Public 2", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="Filter Private 2", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.flush()

        member = LegacyMember(legacy_id=private_legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.explore_legacies(
            db=db_session,
            user_id=test_user.id,
            visibility_filter="private",
        )

        names = [l.name for l in result]
        assert "Filter Public 2" not in names
        assert "Filter Private 2" in names
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestExploreVisibilityFiltering -v
```

Expected: FAIL - function signature doesn't accept user_id or visibility_filter

**Step 3: Update explore_legacies service function**

Edit `services/core-api/app/services/legacy.py`, replace the `explore_legacies` function:

```python
async def explore_legacies(
    db: AsyncSession,
    limit: int = 20,
    user_id: UUID | None = None,
    visibility_filter: str = "all",
) -> list[LegacyResponse]:
    """Get legacies for exploration.

    Args:
        db: Database session
        limit: Maximum number of legacies to return
        user_id: Current user ID (None if unauthenticated)
        visibility_filter: Filter by visibility ('all', 'public', 'private')

    Returns:
        List of legacies with creator info
    """
    from sqlalchemy import or_

    # Build base query
    query = (
        select(Legacy)
        .options(
            selectinload(Legacy.creator),
            selectinload(Legacy.members).selectinload(LegacyMember.user),
            selectinload(Legacy.profile_image),
        )
    )

    # Apply visibility filtering
    if user_id is None:
        # Unauthenticated: only public legacies
        query = query.where(Legacy.visibility == "public")
    elif visibility_filter == "public":
        # Authenticated, filter public only
        query = query.where(Legacy.visibility == "public")
    elif visibility_filter == "private":
        # Authenticated, filter private only (must be member)
        query = query.join(LegacyMember).where(
            Legacy.visibility == "private",
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    else:
        # 'all': public legacies + private legacies user is member of
        # Use subquery to check membership for private legacies
        member_subquery = (
            select(LegacyMember.legacy_id)
            .where(
                LegacyMember.user_id == user_id,
                LegacyMember.role != "pending",
            )
            .scalar_subquery()
        )
        query = query.where(
            or_(
                Legacy.visibility == "public",
                Legacy.id.in_(member_subquery),
            )
        )

    query = query.order_by(Legacy.created_at.desc()).limit(limit)

    result = await db.execute(query)
    legacies = result.scalars().unique().all()

    logger.info(
        "legacy.explore",
        extra={
            "count": len(legacies),
            "user_id": str(user_id) if user_id else None,
            "visibility_filter": visibility_filter,
        },
    )

    return [
        LegacyResponse(
            id=legacy.id,
            name=legacy.name,
            birth_date=legacy.birth_date,
            death_date=legacy.death_date,
            biography=legacy.biography,
            visibility=legacy.visibility,
            created_by=legacy.created_by,
            created_at=legacy.created_at,
            updated_at=legacy.updated_at,
            creator_email=legacy.creator.email if legacy.creator else None,
            creator_name=legacy.creator.name if legacy.creator else None,
            members=[
                LegacyMemberResponse(
                    user_id=member.user_id,
                    email=member.user.email if member.user else "",
                    name=member.user.name if member.user else "",
                    role=member.role,
                    joined_at=member.joined_at,
                )
                for member in legacy.members
                if member.role != "pending"
            ]
            if legacy.members
            else [],
            profile_image_id=legacy.profile_image_id,
            profile_image_url=get_profile_image_url(legacy),
        )
        for legacy in legacies
    ]
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestExploreVisibilityFiltering -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(service): filter explore_legacies by visibility"
```

---

## Task 7: Update Explore Route to Accept Filter Parameters

**Files:**
- Modify: `services/core-api/app/routes/legacy.py:80-101`

**Step 1: Write the failing API test**

Add to `services/core-api/tests/test_legacy_visibility.py`:

```python
from httpx import AsyncClient
from tests.conftest import create_auth_headers_for_user


class TestExploreAPI:
    """Tests for explore API endpoint with visibility."""

    @pytest.mark.asyncio
    async def test_explore_unauthenticated_returns_public_only(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test explore without auth returns only public legacies."""
        # Create public and private legacies
        public_legacy = Legacy(name="API Public", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="API Private", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.commit()

        response = await client.get("/api/legacies/explore")
        assert response.status_code == 200

        names = [l["name"] for l in response.json()]
        assert "API Public" in names
        assert "API Private" not in names

    @pytest.mark.asyncio
    async def test_explore_authenticated_with_filter(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test explore with visibility_filter parameter."""
        public_legacy = Legacy(name="API Filter Public", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="API Filter Private", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.flush()

        member = LegacyMember(legacy_id=private_legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        headers = create_auth_headers_for_user(test_user)

        # Filter public only
        response = await client.get("/api/legacies/explore?visibility_filter=public", headers=headers)
        assert response.status_code == 200
        names = [l["name"] for l in response.json()]
        assert "API Filter Public" in names
        assert "API Filter Private" not in names

        # Filter private only
        response = await client.get("/api/legacies/explore?visibility_filter=private", headers=headers)
        assert response.status_code == 200
        names = [l["name"] for l in response.json()]
        assert "API Filter Public" not in names
        assert "API Filter Private" in names
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestExploreAPI -v
```

Expected: FAIL - route doesn't pass user_id or visibility_filter

**Step 3: Update explore route**

Edit `services/core-api/app/routes/legacy.py`, update the explore endpoint:

```python
from typing import Literal

@router.get(
    "/explore",
    response_model=list[LegacyResponse],
    summary="Explore legacies",
    description="Get legacies for exploration. Returns public legacies for unauthenticated users, or filtered results for authenticated users.",
)
async def explore_legacies(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(
        default=20, ge=1, le=100, description="Maximum number of legacies to return"
    ),
    visibility_filter: Literal["all", "public", "private"] = Query(
        default="all", description="Filter by visibility (authenticated users only)"
    ),
) -> list[LegacyResponse]:
    """Get legacies for exploration.

    Returns public legacies for unauthenticated users.
    Authenticated users can filter by visibility.
    """
    from ..auth.middleware import get_optional_session

    session = get_optional_session(request)
    user_id = session.user_id if session else None

    return await legacy_service.explore_legacies(
        db=db,
        limit=limit,
        user_id=user_id,
        visibility_filter=visibility_filter if user_id else "public",
    )
```

Also add the `get_optional_session` function to `services/core-api/app/auth/middleware.py` if it doesn't exist:

```python
def get_optional_session(request: Request) -> SessionData | None:
    """Get session data if authenticated, None otherwise."""
    return getattr(request.state, "session", None)
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestExploreAPI -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/routes/legacy.py services/core-api/app/auth/middleware.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(api): add visibility_filter to explore endpoint"
```

---

## Task 8: Update Search to Filter by Visibility

**Files:**
- Modify: `services/core-api/app/services/legacy.py:279-318`
- Modify: `services/core-api/app/routes/legacy.py:103-127`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_legacy_visibility.py`:

```python
class TestSearchVisibility:
    """Tests for search with visibility filtering."""

    @pytest.mark.asyncio
    async def test_search_unauthenticated_only_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test unauthenticated search returns only public legacies."""
        public_legacy = Legacy(name="Search Public", created_by=test_user.id, visibility="public")
        private_legacy = Legacy(name="Search Private", created_by=test_user.id, visibility="private")
        db_session.add_all([public_legacy, private_legacy])
        await db_session.commit()

        result = await legacy_service.search_legacies_by_name(
            db=db_session,
            query="Search",
            user_id=None,
        )

        names = [l.name for l in result]
        assert "Search Public" in names
        assert "Search Private" not in names

    @pytest.mark.asyncio
    async def test_search_authenticated_shows_accessible(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ):
        """Test authenticated search shows public + accessible private."""
        public_legacy = Legacy(name="Search2 Public", created_by=test_user_2.id, visibility="public")
        private_member = Legacy(name="Search2 Private Member", created_by=test_user_2.id, visibility="private")
        private_other = Legacy(name="Search2 Private Other", created_by=test_user_2.id, visibility="private")

        db_session.add_all([public_legacy, private_member, private_other])
        await db_session.flush()

        member = LegacyMember(legacy_id=private_member.id, user_id=test_user.id, role="advocate")
        db_session.add(member)
        await db_session.commit()

        result = await legacy_service.search_legacies_by_name(
            db=db_session,
            query="Search2",
            user_id=test_user.id,
        )

        names = [l.name for l in result]
        assert "Search2 Public" in names
        assert "Search2 Private Member" in names
        assert "Search2 Private Other" not in names
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestSearchVisibility -v
```

Expected: FAIL - function doesn't accept user_id

**Step 3: Update search_legacies_by_name service**

Edit `services/core-api/app/services/legacy.py`, update the function:

```python
async def search_legacies_by_name(
    db: AsyncSession,
    query: str,
    user_id: UUID | None = None,
) -> list[LegacySearchResponse]:
    """Search legacies by name (case-insensitive).

    Args:
        db: Database session
        query: Search query string
        user_id: Current user ID (None if unauthenticated)

    Returns:
        List of matching legacies user can access
    """
    from sqlalchemy import or_

    # Build base query
    base_query = select(Legacy).where(Legacy.name.ilike(f"%{query}%"))

    # Apply visibility filtering
    if user_id is None:
        # Unauthenticated: only public legacies
        base_query = base_query.where(Legacy.visibility == "public")
    else:
        # Authenticated: public + private legacies user is member of
        member_subquery = (
            select(LegacyMember.legacy_id)
            .where(
                LegacyMember.user_id == user_id,
                LegacyMember.role != "pending",
            )
            .scalar_subquery()
        )
        base_query = base_query.where(
            or_(
                Legacy.visibility == "public",
                Legacy.id.in_(member_subquery),
            )
        )

    base_query = base_query.order_by(Legacy.created_at.desc()).limit(50)

    result = await db.execute(base_query)
    legacies = result.scalars().all()

    logger.info(
        "legacy.search",
        extra={
            "query": query,
            "count": len(legacies),
            "user_id": str(user_id) if user_id else None,
        },
    )

    return [
        LegacySearchResponse(
            id=legacy.id,
            name=legacy.name,
            birth_date=legacy.birth_date,
            death_date=legacy.death_date,
            created_at=legacy.created_at,
            visibility=legacy.visibility,
        )
        for legacy in legacies
    ]
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestSearchVisibility -v
```

Expected: PASS

**Step 5: Update search route**

Edit `services/core-api/app/routes/legacy.py`, update the search endpoint:

```python
@router.get(
    "/search",
    response_model=list[LegacySearchResponse],
    summary="Search legacies by name",
    description="Search for legacies by name. Returns only accessible legacies.",
)
async def search_legacies(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query"),
    db: AsyncSession = Depends(get_db),
) -> list[LegacySearchResponse]:
    """Search legacies by name.

    Returns public legacies for unauthenticated users.
    Authenticated users also see private legacies they are members of.
    """
    from ..auth.middleware import get_optional_session

    session = get_optional_session(request)
    user_id = session.user_id if session else None

    return await legacy_service.search_legacies_by_name(
        db=db,
        query=q,
        user_id=user_id,
    )
```

**Step 6: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/app/routes/legacy.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(api): filter search results by visibility"
```

---

## Task 9: Enforce Visibility on Legacy Detail Endpoints

**Files:**
- Modify: `services/core-api/app/services/legacy.py:387-461`
- Modify: `services/core-api/app/routes/legacy.py:129-173`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_legacy_visibility.py`:

```python
from fastapi import HTTPException


class TestLegacyDetailVisibility:
    """Tests for legacy detail endpoint visibility enforcement."""

    @pytest.mark.asyncio
    async def test_get_legacy_public_returns_public_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test get_legacy_public returns public legacy."""
        legacy = Legacy(name="Detail Public", created_by=test_user.id, visibility="public")
        db_session.add(legacy)
        await db_session.commit()

        result = await legacy_service.get_legacy_public(db=db_session, legacy_id=legacy.id)
        assert result.name == "Detail Public"

    @pytest.mark.asyncio
    async def test_get_legacy_public_rejects_private_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test get_legacy_public returns 403 for private legacy."""
        legacy = Legacy(name="Detail Private", created_by=test_user.id, visibility="private")
        db_session.add(legacy)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            await legacy_service.get_legacy_public(db=db_session, legacy_id=legacy.id)

        assert exc_info.value.status_code == 403
        assert "private" in exc_info.value.detail.lower() or "access" in exc_info.value.detail.lower()
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestLegacyDetailVisibility -v
```

Expected: FAIL - get_legacy_public doesn't check visibility

**Step 3: Update get_legacy_public service**

Edit `services/core-api/app/services/legacy.py`, update `get_legacy_public`:

After loading the legacy (around line 413), add visibility check:

```python
    if not legacy:
        logger.warning(
            "legacy.not_found.public",
            extra={
                "legacy_id": str(legacy_id),
            },
        )
        raise HTTPException(
            status_code=404,
            detail="Legacy not found",
        )

    # Check visibility - private legacies cannot be accessed via public endpoint
    if legacy.visibility == "private":
        logger.warning(
            "legacy.access_denied.private",
            extra={
                "legacy_id": str(legacy_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="This legacy is private. Please log in to request access.",
        )
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestLegacyDetailVisibility -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(service): enforce visibility on get_legacy_public"
```

---

## Task 10: Update Legacy Visibility (Creator Only)

**Files:**
- Modify: `services/core-api/app/services/legacy.py:682-755`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_legacy_visibility.py`:

```python
class TestUpdateVisibility:
    """Tests for updating legacy visibility."""

    @pytest.mark.asyncio
    async def test_creator_can_change_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test creator can change visibility."""
        legacy = Legacy(name="Update Vis", created_by=test_user.id, visibility="private")
        db_session.add(legacy)
        await db_session.flush()

        member = LegacyMember(legacy_id=legacy.id, user_id=test_user.id, role="creator")
        db_session.add(member)
        await db_session.commit()

        from app.schemas.legacy import LegacyUpdate
        result = await legacy_service.update_legacy(
            db=db_session,
            user_id=test_user.id,
            legacy_id=legacy.id,
            data=LegacyUpdate(visibility="public"),
        )

        assert result.visibility == "public"

    @pytest.mark.asyncio
    async def test_admin_cannot_change_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ):
        """Test admin cannot change visibility."""
        legacy = Legacy(name="Admin Vis", created_by=test_user.id, visibility="private")
        db_session.add(legacy)
        await db_session.flush()

        creator_member = LegacyMember(legacy_id=legacy.id, user_id=test_user.id, role="creator")
        admin_member = LegacyMember(legacy_id=legacy.id, user_id=test_user_2.id, role="admin")
        db_session.add_all([creator_member, admin_member])
        await db_session.commit()

        from app.schemas.legacy import LegacyUpdate
        with pytest.raises(HTTPException) as exc_info:
            await legacy_service.update_legacy(
                db=db_session,
                user_id=test_user_2.id,
                legacy_id=legacy.id,
                data=LegacyUpdate(visibility="public"),
            )

        assert exc_info.value.status_code == 403
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestUpdateVisibility -v
```

Expected: FAIL - visibility update not implemented

**Step 3: Update update_legacy service**

Edit `services/core-api/app/services/legacy.py`, in the `update_legacy` function:

After line 705 where fields are updated, add visibility update with creator check:

```python
    # Update fields
    if data.name is not None:
        legacy.name = data.name
    if data.birth_date is not None:
        legacy.birth_date = data.birth_date
    if data.death_date is not None:
        legacy.death_date = data.death_date
    if data.biography is not None:
        legacy.biography = data.biography

    # Visibility can only be changed by creator
    if data.visibility is not None:
        # Verify user is creator (not just admin)
        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == user_id,
            )
        )
        member = member_result.scalar_one_or_none()

        if not member or member.role != "creator":
            raise HTTPException(
                status_code=403,
                detail="Only the creator can change legacy visibility",
            )

        legacy.visibility = data.visibility
```

**Step 4: Run test to verify it passes**

```bash
cd services/core-api && uv run pytest tests/test_legacy_visibility.py::TestUpdateVisibility -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/tests/test_legacy_visibility.py
git commit -m "feat(service): allow only creator to change visibility"
```

---

## Task 11: Run All Backend Tests

**Step 1: Run full test suite**

```bash
cd services/core-api && uv run pytest -v
```

Expected: All tests pass

**Step 2: Run type checking**

```bash
cd services/core-api && uv run mypy app/
```

Expected: No type errors

**Step 3: Run linting**

```bash
cd services/core-api && uv run ruff check app/
```

Expected: No linting errors

**Step 4: Commit any fixes**

If any issues found, fix them and commit.

---

## Task 12: Update Frontend Types

**Files:**
- Modify: `apps/web/src/lib/api/legacies.ts`

**Step 1: Update Legacy interface**

Edit `apps/web/src/lib/api/legacies.ts`, add `visibility` to the `Legacy` interface:

```typescript
export interface Legacy {
  id: string;
  name: string;
  birth_date: string | null;
  death_date: string | null;
  biography: string | null;
  visibility: 'public' | 'private';  // Add this line
  created_by: string;
  created_at: string;
  updated_at: string;
  creator_email?: string | null;
  creator_name?: string | null;
  members?: LegacyMember[] | null;
  profile_image_id?: string | null;
  profile_image_url?: string | null;
}
```

**Step 2: Update CreateLegacyInput**

```typescript
export interface CreateLegacyInput {
  name: string;
  birth_date?: string | null;
  death_date?: string | null;
  biography?: string | null;
  visibility?: 'public' | 'private';  // Add this line
}
```

**Step 3: Update UpdateLegacyInput**

```typescript
export interface UpdateLegacyInput {
  name?: string;
  birth_date?: string | null;
  death_date?: string | null;
  biography?: string | null;
  visibility?: 'public' | 'private';  // Add this line
}
```

**Step 4: Update LegacySearchResult**

```typescript
export interface LegacySearchResult {
  id: string;
  name: string;
  birth_date: string | null;
  death_date: string | null;
  created_at: string;
  visibility: 'public' | 'private';  // Add this line
  similarity?: number | null;
}
```

**Step 5: Update exploreLegacies function**

```typescript
export type VisibilityFilter = 'all' | 'public' | 'private';

export async function exploreLegacies(
  limit: number = 20,
  visibilityFilter: VisibilityFilter = 'all'
): Promise<Legacy[]> {
  return apiGet<Legacy[]>(`/api/legacies/explore?limit=${limit}&visibility_filter=${visibilityFilter}`);
}
```

**Step 6: Commit**

```bash
git add apps/web/src/lib/api/legacies.ts
git commit -m "feat(frontend): add visibility to legacy types"
```

---

## Task 13: Update Frontend Hooks

**Files:**
- Modify: `apps/web/src/lib/hooks/useLegacies.ts`

**Step 1: Update useExploreLegacies hook**

Edit `apps/web/src/lib/hooks/useLegacies.ts`:

```typescript
import {
  // ... existing imports
  exploreLegacies,
  type VisibilityFilter,
} from '@/lib/api/legacies';

// Update legacyKeys
export const legacyKeys = {
  all: ['legacies'] as const,
  lists: () => [...legacyKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...legacyKeys.lists(), filters] as const,
  details: () => [...legacyKeys.all, 'detail'] as const,
  detail: (id: string) => [...legacyKeys.details(), id] as const,
  explore: (filter?: VisibilityFilter) => [...legacyKeys.all, 'explore', filter] as const,
};

// Update hook
export function useExploreLegacies(limit: number = 20, visibilityFilter: VisibilityFilter = 'all') {
  return useQuery({
    queryKey: legacyKeys.explore(visibilityFilter),
    queryFn: () => exploreLegacies(limit, visibilityFilter),
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/hooks/useLegacies.ts
git commit -m "feat(frontend): add visibility filter to useExploreLegacies"
```

---

## Task 14: Update Legacy Creation Form

**Files:**
- Modify: `apps/web/src/components/LegacyCreation.tsx`

**Step 1: Add visibility selector to form**

Edit `apps/web/src/components/LegacyCreation.tsx`:

Add state for visibility:

```typescript
const [visibility, setVisibility] = useState<'public' | 'private'>('private');
```

Update handleSubmit to include visibility:

```typescript
const legacy = await createLegacy.mutateAsync({
  name: name.trim(),
  birth_date: birthDate || null,
  death_date: deathDate || null,
  biography: biography.trim() || null,
  visibility,  // Add this
});
```

Add visibility selector after biography field (around line 136):

```tsx
<div className="space-y-2">
  <Label>Visibility</Label>
  <div className="flex gap-4">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name="visibility"
        value="private"
        checked={visibility === 'private'}
        onChange={() => setVisibility('private')}
        className="w-4 h-4 text-[rgb(var(--theme-primary))]"
      />
      <span className="text-sm">Private</span>
    </label>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name="visibility"
        value="public"
        checked={visibility === 'public'}
        onChange={() => setVisibility('public')}
        className="w-4 h-4 text-[rgb(var(--theme-primary))]"
      />
      <span className="text-sm">Public</span>
    </label>
  </div>
  <p className="text-xs text-neutral-500">
    {visibility === 'private'
      ? 'Only invited members can view this legacy.'
      : 'Anyone can view and request to join this legacy.'}
  </p>
</div>
```

**Step 2: Commit**

```bash
git add apps/web/src/components/LegacyCreation.tsx
git commit -m "feat(frontend): add visibility selector to legacy creation"
```

---

## Task 15: Update Explore Page with Visibility Filter

**Files:**
- Modify: `apps/web/src/components/ExploreMinimal.tsx`

**Step 1: Add visibility filter and indicators**

Edit `apps/web/src/components/ExploreMinimal.tsx`:

Add imports:

```typescript
import { Lock, Globe } from 'lucide-react';
import { useExploreLegacies } from '@/lib/hooks/useLegacies';
import { useAuth } from '@/contexts/AuthContext';
import type { VisibilityFilter } from '@/lib/api/legacies';
```

Update state and data fetching:

```typescript
const { user } = useAuth();
const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
const { data: legacies = [], isLoading } = useExploreLegacies(50, visibilityFilter);
```

Add visibility filter buttons (only for authenticated users):

```tsx
{/* Visibility Filter - only for authenticated users */}
{user && (
  <div className="flex gap-2 mb-4">
    {(['all', 'public', 'private'] as const).map((filter) => (
      <button
        key={filter}
        onClick={() => setVisibilityFilter(filter)}
        className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${
          visibilityFilter === filter
            ? 'bg-[rgb(var(--theme-primary))] text-white'
            : 'border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))]'
        }`}
      >
        {filter}
      </button>
    ))}
  </div>
)}
```

Add visibility indicator to legacy cards:

```tsx
<div className="flex items-start justify-between mb-2">
  <h3 className="text-neutral-900">{legacy.name}</h3>
  <div className="flex items-center gap-2 ml-2">
    {legacy.visibility === 'private' ? (
      <Lock className="size-4 text-neutral-400" />
    ) : (
      <Globe className="size-4 text-neutral-400" />
    )}
    <Badge variant="outline" className="text-xs">
      {legacy.context?.replace('-', ' ') || 'memorial'}
    </Badge>
  </div>
</div>
```

**Step 2: Commit**

```bash
git add apps/web/src/components/ExploreMinimal.tsx
git commit -m "feat(frontend): add visibility filter and indicators to explore page"
```

---

## Task 16: Update My Legacies Page with Visibility Indicator

**Files:**
- Modify: `apps/web/src/components/MyLegaciesMinimal.tsx`

**Step 1: Add visibility indicator**

Edit `apps/web/src/components/MyLegaciesMinimal.tsx`:

Add imports:

```typescript
import { Lock, Globe } from 'lucide-react';
```

Add visibility indicator to legacy cards (similar to explore page):

```tsx
{legacy.visibility === 'private' ? (
  <Lock className="size-4 text-neutral-400" title="Private" />
) : (
  <Globe className="size-4 text-neutral-400" title="Public" />
)}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/MyLegaciesMinimal.tsx
git commit -m "feat(frontend): add visibility indicator to my legacies page"
```

---

## Task 17: Update Legacy Profile with Visibility Badge and Edit

**Files:**
- Modify: `apps/web/src/components/LegacyProfileMinimal.tsx`

**Step 1: Add visibility badge and edit control**

Edit `apps/web/src/components/LegacyProfileMinimal.tsx`:

Add imports:

```typescript
import { Lock, Globe } from 'lucide-react';
```

Add visibility badge near the legacy name:

```tsx
<div className="flex items-center gap-2">
  <h1 className="text-neutral-900">{legacy.name}</h1>
  {legacy.visibility === 'private' ? (
    <Badge variant="outline" className="flex items-center gap-1">
      <Lock className="size-3" />
      Private
    </Badge>
  ) : (
    <Badge variant="outline" className="flex items-center gap-1">
      <Globe className="size-3" />
      Public
    </Badge>
  )}
</div>
```

For the edit/settings section (if user is creator), add visibility toggle:

```tsx
{isCreator && (
  <div className="space-y-2">
    <Label>Legacy Visibility</Label>
    <div className="flex gap-4">
      <Button
        variant={legacy.visibility === 'private' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleVisibilityChange('private')}
      >
        <Lock className="size-4 mr-2" />
        Private
      </Button>
      <Button
        variant={legacy.visibility === 'public' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleVisibilityChange('public')}
      >
        <Globe className="size-4 mr-2" />
        Public
      </Button>
    </div>
  </div>
)}
```

Add the handler:

```typescript
const handleVisibilityChange = async (newVisibility: 'public' | 'private') => {
  if (newVisibility === 'public' && legacy.visibility === 'private') {
    // Confirm before making public
    if (!confirm('This will make the legacy visible to everyone. Continue?')) {
      return;
    }
  }
  await updateLegacy.mutateAsync({
    id: legacy.id,
    data: { visibility: newVisibility },
  });
};
```

**Step 2: Commit**

```bash
git add apps/web/src/components/LegacyProfileMinimal.tsx
git commit -m "feat(frontend): add visibility badge and edit to legacy profile"
```

---

## Task 18: Handle Private Legacy Access Denied

**Files:**
- Modify: `apps/web/src/components/LegacyProfileMinimal.tsx`

**Step 1: Add access denied state**

When a user tries to view a private legacy they don't have access to, show "Request Access" button:

```tsx
// In the component, handle 403 error from query
const { data: legacy, isLoading, error } = useLegacyWithFallback(legacyId, isAuthenticated);

// Check for access denied
const isAccessDenied = error instanceof ApiError && error.status === 403;

if (isAccessDenied) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))]">
      {/* Navigation */}
      <nav>...</nav>

      {/* Access Denied Content */}
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="size-20 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center mx-auto mb-6">
          <Lock className="size-10 text-[rgb(var(--theme-primary))]" />
        </div>
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          This Legacy is Private
        </h1>
        <p className="text-neutral-600 mb-8">
          {isAuthenticated
            ? 'You need to be invited to view this legacy.'
            : 'Please sign in to request access to this legacy.'}
        </p>
        {isAuthenticated ? (
          <Button onClick={handleRequestAccess}>
            Request Access
          </Button>
        ) : (
          <Button onClick={onAuthClick}>
            Sign In
          </Button>
        )}
      </div>
    </div>
  );
}
```

Add the request access handler:

```typescript
const handleRequestAccess = async () => {
  try {
    await joinLegacy(legacyId);
    toast.success('Access request sent! The legacy creator will be notified.');
  } catch (error) {
    toast.error('Failed to send access request.');
  }
};
```

**Step 2: Commit**

```bash
git add apps/web/src/components/LegacyProfileMinimal.tsx
git commit -m "feat(frontend): handle private legacy access denied with request access"
```

---

## Task 19: Run Frontend Build and Tests

**Step 1: Run type check**

```bash
cd apps/web && npm run typecheck
```

Expected: No type errors

**Step 2: Run lint**

```bash
cd apps/web && npm run lint
```

Expected: No lint errors

**Step 3: Run build**

```bash
cd apps/web && npm run build
```

Expected: Build succeeds

**Step 4: Fix any issues and commit**

---

## Task 20: Final Integration Test

**Step 1: Start local environment**

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

**Step 2: Run backend migrations**

```bash
cd services/core-api && uv run alembic upgrade head
```

**Step 3: Manual testing checklist**

- [ ] Create a new legacy - defaults to private
- [ ] Create a public legacy
- [ ] Explore page shows filter buttons when logged in
- [ ] Explore page filters correctly by visibility
- [ ] Private legacies show lock icon
- [ ] Public legacies show globe icon
- [ ] Can change visibility from legacy settings (creator only)
- [ ] Non-creators cannot see visibility edit controls
- [ ] Unauthenticated users only see public legacies
- [ ] Accessing private legacy without membership shows "Request Access"
- [ ] Search only returns accessible legacies

**Step 4: Create final commit**

```bash
git add -A
git commit -m "feat: complete legacy visibility implementation"
```

---

## Summary

This plan implements legacy visibility in 20 tasks:

1. **Tasks 1-10**: Backend implementation (model, migration, schemas, services, routes)
2. **Tasks 11**: Backend verification
3. **Tasks 12-18**: Frontend implementation (types, hooks, components)
4. **Tasks 19-20**: Frontend verification and integration testing

Each task follows TDD with:
- Write failing test
- Implement minimal code
- Verify test passes
- Commit

Total estimated tasks: 20
