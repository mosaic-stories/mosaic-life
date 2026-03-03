# Activity Tracking System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a personal activity tracking system that records user interactions (CRUD, views, social, AI) across Legacy, Story, Media, and Conversation entities, with privacy opt-out and tiered data retention.

**Architecture:** Single `user_activity` table with polymorphic entity references (matching existing `user_favorites` and `notifications` patterns). Activity recording at the service layer with a privacy guard. Tiered retention cleanup via a scheduled internal endpoint.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, PostgreSQL JSONB, pytest + pytest-asyncio

**Design Doc:** `docs/plans/2026-03-02-activity-tracking-design.md`

---

### Task 1: SQLAlchemy Model — `UserActivity`

**Files:**
- Create: `services/core-api/app/models/activity.py`
- Modify: `services/core-api/app/models/__init__.py`

**Step 1: Create the model file**

Create `services/core-api/app/models/activity.py`:

```python
"""UserActivity model for tracking user activity."""

from datetime import datetime
from typing import Any, TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSON as PG_JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .user import User


class UserActivity(Base):
    """Polymorphic activity tracking table for all entity types."""

    __tablename__ = "user_activity"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )

    entity_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    entity_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
    )

    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata",
        PG_JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_user_activity_feed", "user_id", created_at.desc()),
        Index(
            "ix_user_activity_dedup",
            "user_id",
            "entity_type",
            "entity_id",
            created_at.desc(),
        ),
    )

    def __repr__(self) -> str:
        return f"<UserActivity(user_id={self.user_id}, action={self.action}, entity_type={self.entity_type})>"
```

**Note on `metadata_`:** The Python attribute is named `metadata_` to avoid shadowing SQLAlchemy's `MetaData`, but the DB column is `metadata` via the first positional arg to `mapped_column`. Follow the same technique used elsewhere in SQLAlchemy docs for reserved names.

**Step 2: Register the model in `__init__.py`**

Modify `services/core-api/app/models/__init__.py` — add `UserActivity` import and to `__all__`:

```python
from .activity import UserActivity
```

Add `"UserActivity"` to the `__all__` list (alphabetically, after `"AIMessage"`).

**Step 3: Verify model loads without errors**

Run: `cd services/core-api && uv run python -c "from app.models.activity import UserActivity; print(UserActivity.__tablename__)"`
Expected: `user_activity`

**Step 4: Commit**

```bash
git add services/core-api/app/models/activity.py services/core-api/app/models/__init__.py
git commit -m "feat(activity): add UserActivity SQLAlchemy model"
```

---

### Task 2: Alembic Migration

**Files:**
- Create: `services/core-api/alembic/versions/<hash>_add_user_activity.py` (via autogenerate)

**Step 1: Generate the migration**

Run: `cd services/core-api && uv run alembic revision --autogenerate -m "add user_activity table"`

**Step 2: Review the generated migration**

Open the generated file and verify it creates:
- `user_activity` table with all columns (id, user_id, action, entity_type, entity_id, metadata, created_at)
- FK on `user_id` → `users.id` with `CASCADE`
- Individual indexes on `user_id`, `action`, `entity_type`
- Composite indexes `ix_user_activity_feed` and `ix_user_activity_dedup`

If the composite indexes aren't auto-detected, add them manually in the `upgrade()` function:

```python
op.create_index("ix_user_activity_feed", "user_activity", ["user_id", sa.text("created_at DESC")])
op.create_index("ix_user_activity_dedup", "user_activity", ["user_id", "entity_type", "entity_id", sa.text("created_at DESC")])
```

**Step 3: Test the migration against the local database**

Run: `cd services/core-api && uv run alembic upgrade head`
Expected: Migration applies successfully.

Run: `cd services/core-api && uv run alembic downgrade -1`
Run: `cd services/core-api && uv run alembic upgrade head`
Expected: Both directions work cleanly.

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(activity): add user_activity migration"
```

---

### Task 3: Pydantic Schemas

**Files:**
- Create: `services/core-api/app/schemas/activity.py`

**Step 1: Create the schemas file**

Create `services/core-api/app/schemas/activity.py`:

```python
"""Pydantic schemas for Activity Tracking API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


EntityType = Literal["legacy", "story", "media", "conversation"]

Action = Literal[
    "viewed",
    "created",
    "updated",
    "deleted",
    "favorited",
    "unfavorited",
    "shared",
    "joined",
    "invited",
    "ai_conversation_started",
    "ai_story_evolved",
]


class ActivityItem(BaseModel):
    """A single activity entry."""

    id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    metadata: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityFeedResponse(BaseModel):
    """Response from the activity feed endpoint."""

    items: list[ActivityItem]
    next_cursor: str | None = Field(
        default=None, description="ISO timestamp cursor for next page"
    )
    has_more: bool = False
    tracking_enabled: bool = True


class RecentItem(BaseModel):
    """A deduplicated recent item."""

    entity_type: str
    entity_id: UUID
    last_action: str
    last_activity_at: datetime
    metadata: dict[str, Any] | None = None


class RecentItemsResponse(BaseModel):
    """Response from the recent items endpoint."""

    items: list[RecentItem]
    tracking_enabled: bool = True


class CleanupResponse(BaseModel):
    """Response from the cleanup endpoint."""

    deleted_count: int
```

**Step 2: Verify schemas load**

Run: `cd services/core-api && uv run python -c "from app.schemas.activity import ActivityFeedResponse; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add services/core-api/app/schemas/activity.py
git commit -m "feat(activity): add Pydantic schemas for activity API"
```

---

### Task 4: Activity Service — Core Recording Logic

**Files:**
- Create: `services/core-api/app/services/activity.py`
- Create: `services/core-api/tests/test_activity_service.py`

**Step 1: Write the failing tests for `record_activity`**

Create `services/core-api/tests/test_activity_service.py`:

```python
"""Tests for activity service."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import UserActivity
from app.models.user import User
from app.services import activity as activity_service


@pytest_asyncio.fixture
async def tracking_user(db_session: AsyncSession) -> User:
    """Create a user with activity tracking enabled (default)."""
    user = User(
        email="tracker@example.com",
        google_id="google_tracker_123",
        name="Tracker User",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def opted_out_user(db_session: AsyncSession) -> User:
    """Create a user with activity tracking disabled."""
    user = User(
        email="private@example.com",
        google_id="google_private_123",
        name="Private User",
        preferences={"activity_tracking_enabled": False},
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


class TestRecordActivity:
    @pytest.mark.asyncio
    async def test_records_activity(
        self, db_session: AsyncSession, tracking_user: User
    ):
        entity_id = uuid4()
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="created",
            entity_type="story",
            entity_id=entity_id,
            metadata={"title": "Test Story"},
        )
        result = await db_session.execute(
            select(UserActivity).where(UserActivity.user_id == tracking_user.id)
        )
        activity = result.scalar_one()
        assert activity.action == "created"
        assert activity.entity_type == "story"
        assert activity.entity_id == entity_id
        assert activity.metadata_["title"] == "Test Story"

    @pytest.mark.asyncio
    async def test_skips_when_tracking_disabled(
        self, db_session: AsyncSession, opted_out_user: User
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=opted_out_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        result = await db_session.execute(
            select(func.count()).select_from(UserActivity).where(
                UserActivity.user_id == opted_out_user.id
            )
        )
        assert result.scalar_one() == 0

    @pytest.mark.asyncio
    async def test_deduplicates_views(
        self, db_session: AsyncSession, tracking_user: User
    ):
        entity_id = uuid4()
        # First view should record
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="viewed",
            entity_type="story",
            entity_id=entity_id,
            deduplicate_minutes=5,
        )
        # Second view within window should be skipped
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="viewed",
            entity_type="story",
            entity_id=entity_id,
            deduplicate_minutes=5,
        )
        result = await db_session.execute(
            select(func.count()).select_from(UserActivity).where(
                UserActivity.user_id == tracking_user.id
            )
        )
        assert result.scalar_one() == 1

    @pytest.mark.asyncio
    async def test_records_without_metadata(
        self, db_session: AsyncSession, tracking_user: User
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="deleted",
            entity_type="legacy",
            entity_id=uuid4(),
        )
        result = await db_session.execute(
            select(UserActivity).where(UserActivity.user_id == tracking_user.id)
        )
        activity = result.scalar_one()
        assert activity.metadata_ is None
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/test_activity_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.activity'`

**Step 3: Write the activity service**

Create `services/core-api/app/services/activity.py`:

```python
"""Activity tracking service — record, query, and cleanup user activity."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.activity import UserActivity
from ..models.user import User

logger = logging.getLogger(__name__)

# Retention tiers: action -> max age in days
RETENTION_TIERS: dict[str, int] = {
    # Ephemeral
    "viewed": 30,
    # Standard
    "favorited": 90,
    "unfavorited": 90,
    "shared": 90,
    "joined": 90,
    "invited": 90,
    "ai_conversation_started": 90,
    "ai_story_evolved": 90,
    # Durable
    "created": 365,
    "updated": 365,
    "deleted": 365,
}

# Group actions by tier for batch cleanup
EPHEMERAL_ACTIONS = ["viewed"]
STANDARD_ACTIONS = [
    "favorited", "unfavorited", "shared", "joined",
    "invited", "ai_conversation_started", "ai_story_evolved",
]
DURABLE_ACTIONS = ["created", "updated", "deleted"]


async def record_activity(
    db: AsyncSession,
    user_id: UUID,
    action: str,
    entity_type: str,
    entity_id: UUID,
    metadata: dict[str, Any] | None = None,
    deduplicate_minutes: int = 0,
) -> None:
    """Record a user activity event.

    Respects privacy preference — skips recording if tracking is disabled.
    Optionally deduplicates by checking for a recent identical event.
    Failures are logged but never raised.
    """
    try:
        # Check privacy preference
        result = await db.execute(
            select(User.preferences).where(User.id == user_id)
        )
        prefs = result.scalar_one_or_none()
        if prefs and not prefs.get("activity_tracking_enabled", True):
            return

        # Deduplication check for views
        if deduplicate_minutes > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=deduplicate_minutes)
            dup_result = await db.execute(
                select(UserActivity.id)
                .where(
                    UserActivity.user_id == user_id,
                    UserActivity.action == action,
                    UserActivity.entity_type == entity_type,
                    UserActivity.entity_id == entity_id,
                    UserActivity.created_at > cutoff,
                )
                .limit(1)
            )
            if dup_result.scalar_one_or_none() is not None:
                return

        activity = UserActivity(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_=metadata,
        )
        db.add(activity)
        await db.flush()

        logger.info(
            "activity.recorded",
            extra={
                "user_id": str(user_id),
                "action": action,
                "entity_type": entity_type,
                "entity_id": str(entity_id),
            },
        )
    except Exception:
        logger.warning(
            "activity.record_failed",
            extra={
                "user_id": str(user_id),
                "action": action,
                "entity_type": entity_type,
                "entity_id": str(entity_id),
            },
            exc_info=True,
        )


async def get_activity_feed(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str | None = None,
    action: str | None = None,
    cursor: datetime | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Get paginated activity feed for a user."""
    # Check if tracking is enabled
    user_result = await db.execute(
        select(User.preferences).where(User.id == user_id)
    )
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {
            "items": [],
            "next_cursor": None,
            "has_more": False,
            "tracking_enabled": False,
        }

    filters = [UserActivity.user_id == user_id]
    if entity_type:
        filters.append(UserActivity.entity_type == entity_type)
    if action:
        filters.append(UserActivity.action == action)
    if cursor:
        filters.append(UserActivity.created_at < cursor)

    query = (
        select(UserActivity)
        .where(*filters)
        .order_by(UserActivity.created_at.desc())
        .limit(limit + 1)  # fetch one extra to check has_more
    )

    result = await db.execute(query)
    activities = list(result.scalars().all())

    has_more = len(activities) > limit
    if has_more:
        activities = activities[:limit]

    next_cursor = activities[-1].created_at.isoformat() if activities and has_more else None

    return {
        "items": activities,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "tracking_enabled": True,
    }


async def get_recent_items(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Get deduplicated recent items grouped by entity."""
    # Check if tracking is enabled
    user_result = await db.execute(
        select(User.preferences).where(User.id == user_id)
    )
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {"items": [], "tracking_enabled": False}

    # Subquery: latest activity per (entity_type, entity_id)
    filters = [UserActivity.user_id == user_id]
    if entity_type:
        filters.append(UserActivity.entity_type == entity_type)

    # Use a window function or distinct on for dedup
    # For SQLite compat in tests, use group_by approach
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

    # Join back to get the actual activity record for metadata
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
    activities = list(result.scalars().all())

    items = [
        {
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "last_action": a.action,
            "last_activity_at": a.created_at,
            "metadata": a.metadata_,
        }
        for a in activities
    ]

    return {"items": items, "tracking_enabled": True}


async def clear_user_activity(db: AsyncSession, user_id: UUID) -> int:
    """Delete all activity data for a user. Returns count of deleted rows."""
    result = await db.execute(
        delete(UserActivity).where(UserActivity.user_id == user_id)
    )
    await db.flush()
    return result.rowcount  # type: ignore[return-value]


async def run_retention_cleanup(db: AsyncSession, batch_size: int = 1000) -> int:
    """Run tiered retention cleanup. Returns total rows deleted."""
    now = datetime.now(timezone.utc)
    total_deleted = 0

    tiers = [
        ("ephemeral", EPHEMERAL_ACTIONS, 30),
        ("standard", STANDARD_ACTIONS, 90),
        ("durable", DURABLE_ACTIONS, 365),
    ]

    for tier_name, actions, days in tiers:
        cutoff = now - timedelta(days=days)
        deleted_in_tier = 0

        # Batch delete loop
        while True:
            # Use a subquery to limit the delete batch
            subq = (
                select(UserActivity.id)
                .where(
                    UserActivity.action.in_(actions),
                    UserActivity.created_at < cutoff,
                )
                .limit(batch_size)
                .subquery()
            )
            result = await db.execute(
                delete(UserActivity).where(UserActivity.id.in_(select(subq.c.id)))
            )
            batch_count: int = result.rowcount  # type: ignore[assignment]
            deleted_in_tier += batch_count
            await db.flush()

            if batch_count < batch_size:
                break

        total_deleted += deleted_in_tier
        if deleted_in_tier > 0:
            logger.info(
                "activity.cleanup.tier_complete",
                extra={
                    "tier": tier_name,
                    "deleted_count": deleted_in_tier,
                    "cutoff": cutoff.isoformat(),
                },
            )

    return total_deleted
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/test_activity_service.py -v`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add services/core-api/app/services/activity.py services/core-api/tests/test_activity_service.py
git commit -m "feat(activity): add activity service with recording, querying, and cleanup"
```

---

### Task 5: Tests for Feed, Recent Items, Clear, and Cleanup

**Files:**
- Modify: `services/core-api/tests/test_activity_service.py`

**Step 1: Add tests for feed query**

Append to `services/core-api/tests/test_activity_service.py`:

```python
class TestGetActivityFeed:
    @pytest.mark.asyncio
    async def test_returns_activities_in_reverse_chronological_order(
        self, db_session: AsyncSession, tracking_user: User
    ):
        entity_id = uuid4()
        for action in ["created", "viewed", "updated"]:
            await activity_service.record_activity(
                db=db_session,
                user_id=tracking_user.id,
                action=action,
                entity_type="story",
                entity_id=entity_id,
            )

        result = await activity_service.get_activity_feed(
            db=db_session, user_id=tracking_user.id
        )
        assert result["tracking_enabled"] is True
        assert len(result["items"]) == 3
        # Most recent first
        actions = [a.action for a in result["items"]]
        assert actions == ["updated", "viewed", "created"]

    @pytest.mark.asyncio
    async def test_filters_by_entity_type(
        self, db_session: AsyncSession, tracking_user: User
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="created",
            entity_type="legacy",
            entity_id=uuid4(),
        )

        result = await activity_service.get_activity_feed(
            db=db_session, user_id=tracking_user.id, entity_type="story"
        )
        assert len(result["items"]) == 1
        assert result["items"][0].entity_type == "story"

    @pytest.mark.asyncio
    async def test_returns_empty_when_tracking_disabled(
        self, db_session: AsyncSession, opted_out_user: User
    ):
        result = await activity_service.get_activity_feed(
            db=db_session, user_id=opted_out_user.id
        )
        assert result["items"] == []
        assert result["tracking_enabled"] is False

    @pytest.mark.asyncio
    async def test_pagination_with_cursor(
        self, db_session: AsyncSession, tracking_user: User
    ):
        # Create 5 activities
        for i in range(5):
            await activity_service.record_activity(
                db=db_session,
                user_id=tracking_user.id,
                action="created",
                entity_type="story",
                entity_id=uuid4(),
                metadata={"index": i},
            )

        # Get first page (limit 2)
        page1 = await activity_service.get_activity_feed(
            db=db_session, user_id=tracking_user.id, limit=2
        )
        assert len(page1["items"]) == 2
        assert page1["has_more"] is True
        assert page1["next_cursor"] is not None

        # Get second page
        cursor_dt = datetime.fromisoformat(page1["next_cursor"])
        page2 = await activity_service.get_activity_feed(
            db=db_session, user_id=tracking_user.id, limit=2, cursor=cursor_dt
        )
        assert len(page2["items"]) == 2
        assert page2["has_more"] is True


class TestGetRecentItems:
    @pytest.mark.asyncio
    async def test_deduplicates_by_entity(
        self, db_session: AsyncSession, tracking_user: User
    ):
        entity_id = uuid4()
        # Multiple actions on same entity
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="created",
            entity_type="story",
            entity_id=entity_id,
            metadata={"title": "My Story"},
        )
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="updated",
            entity_type="story",
            entity_id=entity_id,
            metadata={"title": "My Story"},
        )

        result = await activity_service.get_recent_items(
            db=db_session, user_id=tracking_user.id
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["last_action"] == "updated"

    @pytest.mark.asyncio
    async def test_returns_empty_when_tracking_disabled(
        self, db_session: AsyncSession, opted_out_user: User
    ):
        result = await activity_service.get_recent_items(
            db=db_session, user_id=opted_out_user.id
        )
        assert result["items"] == []
        assert result["tracking_enabled"] is False


class TestClearUserActivity:
    @pytest.mark.asyncio
    async def test_clears_all_activity(
        self, db_session: AsyncSession, tracking_user: User
    ):
        for _ in range(3):
            await activity_service.record_activity(
                db=db_session,
                user_id=tracking_user.id,
                action="created",
                entity_type="story",
                entity_id=uuid4(),
            )
        deleted = await activity_service.clear_user_activity(
            db=db_session, user_id=tracking_user.id
        )
        assert deleted == 3

        result = await db_session.execute(
            select(func.count()).select_from(UserActivity).where(
                UserActivity.user_id == tracking_user.id
            )
        )
        assert result.scalar_one() == 0


class TestRetentionCleanup:
    @pytest.mark.asyncio
    async def test_deletes_old_ephemeral_events(
        self, db_session: AsyncSession, tracking_user: User
    ):
        # Create an old view event
        old_activity = UserActivity(
            user_id=tracking_user.id,
            action="viewed",
            entity_type="story",
            entity_id=uuid4(),
        )
        db_session.add(old_activity)
        await db_session.flush()

        # Manually set created_at to 31 days ago
        old_activity.created_at = datetime.now(timezone.utc) - timedelta(days=31)
        await db_session.flush()

        deleted = await activity_service.run_retention_cleanup(db=db_session)
        assert deleted == 1

    @pytest.mark.asyncio
    async def test_keeps_recent_events(
        self, db_session: AsyncSession, tracking_user: User
    ):
        # Create a recent view event
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="viewed",
            entity_type="story",
            entity_id=uuid4(),
        )

        deleted = await activity_service.run_retention_cleanup(db=db_session)
        assert deleted == 0
```

**Step 2: Run all tests**

Run: `cd services/core-api && uv run pytest tests/test_activity_service.py -v`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add services/core-api/tests/test_activity_service.py
git commit -m "test(activity): add tests for feed, recent items, clear, and cleanup"
```

---

### Task 6: API Routes

**Files:**
- Create: `services/core-api/app/routes/activity.py`
- Modify: `services/core-api/app/main.py`

**Step 1: Write the failing API tests**

Create `services/core-api/tests/test_activity_routes.py`:

```python
"""Tests for activity API routes."""

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import UserActivity
from app.models.user import User
from app.services import activity as activity_service
from tests.conftest import create_auth_headers_for_user


class TestGetActivityFeed:
    @pytest.mark.asyncio
    async def test_returns_feed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        # Record some activity directly
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
            metadata={"title": "Test Story"},
        )
        await db_session.commit()

        response = await client.get("/api/activity", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["action"] == "created"
        assert data["tracking_enabled"] is True

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/activity")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_filters_by_entity_type(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="legacy",
            entity_id=uuid4(),
        )
        await db_session.commit()

        response = await client.get(
            "/api/activity?entity_type=story", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1


class TestGetRecentItems:
    @pytest.mark.asyncio
    async def test_returns_recent_items(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        entity_id = uuid4()
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=entity_id,
            metadata={"title": "Test"},
        )
        await db_session.commit()

        response = await client.get("/api/activity/recent", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["entity_id"] == str(entity_id)

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/activity/recent")
        assert response.status_code == 401


class TestClearActivity:
    @pytest.mark.asyncio
    async def test_clears_all_activity(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        await db_session.commit()

        response = await client.delete("/api/activity", headers=auth_headers)
        assert response.status_code == 204

        # Verify cleared
        feed_response = await client.get("/api/activity", headers=auth_headers)
        assert len(feed_response.json()["items"]) == 0

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.delete("/api/activity")
        assert response.status_code == 401
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/test_activity_routes.py -v`
Expected: FAIL — routes don't exist yet.

**Step 3: Create the routes file**

Create `services/core-api/app/routes/activity.py`:

```python
"""Activity tracking API routes."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.activity import (
    ActivityFeedResponse,
    CleanupResponse,
    RecentItemsResponse,
)
from ..services import activity as activity_service

router = APIRouter(prefix="/api/activity", tags=["activity"])

EntityTypeParam = Literal["legacy", "story", "media", "conversation"]


@router.get("", response_model=ActivityFeedResponse)
async def get_activity_feed(
    request: Request,
    entity_type: EntityTypeParam | None = Query(None, description="Filter by entity type"),
    action: str | None = Query(None, description="Filter by action"),
    cursor: str | None = Query(None, description="ISO timestamp cursor for pagination"),
    limit: int = Query(20, ge=1, le=100, description="Max items to return"),
    db: AsyncSession = Depends(get_db),
) -> ActivityFeedResponse:
    """Get the current user's activity feed."""
    session = require_auth(request)

    cursor_dt = None
    if cursor:
        cursor_dt = datetime.fromisoformat(cursor)

    result = await activity_service.get_activity_feed(
        db=db,
        user_id=session.user_id,
        entity_type=entity_type,
        action=action,
        cursor=cursor_dt,
        limit=limit,
    )
    return ActivityFeedResponse(**result)


@router.get("/recent", response_model=RecentItemsResponse)
async def get_recent_items(
    request: Request,
    entity_type: EntityTypeParam | None = Query(None, description="Filter by entity type"),
    limit: int = Query(10, ge=1, le=50, description="Max items to return"),
    db: AsyncSession = Depends(get_db),
) -> RecentItemsResponse:
    """Get the current user's recently interacted-with items (deduplicated)."""
    session = require_auth(request)

    result = await activity_service.get_recent_items(
        db=db,
        user_id=session.user_id,
        entity_type=entity_type,
        limit=limit,
    )
    return RecentItemsResponse(**result)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_activity(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clear all activity history for the current user."""
    session = require_auth(request)
    await activity_service.clear_user_activity(db=db, user_id=session.user_id)
    await db.commit()
```

**Step 4: Register the router in `main.py`**

Modify `services/core-api/app/main.py`:

Add import:
```python
from .routes.activity import router as activity_router
```

Add at end of router registrations:
```python
app.include_router(activity_router)
```

**Step 5: Run route tests**

Run: `cd services/core-api && uv run pytest tests/test_activity_routes.py -v`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add services/core-api/app/routes/activity.py services/core-api/app/main.py services/core-api/tests/test_activity_routes.py
git commit -m "feat(activity): add activity API routes (feed, recent, clear)"
```

---

### Task 7: Privacy Preference — Opt-Out with Purge

**Files:**
- Modify: `services/core-api/app/schemas/preferences.py`
- Modify: `services/core-api/app/services/settings.py`
- Create: `services/core-api/tests/test_activity_privacy.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/test_activity_privacy.py`:

```python
"""Tests for activity tracking privacy opt-out."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import UserActivity
from app.models.user import User
from app.services import activity as activity_service
from tests.conftest import create_auth_headers_for_user


class TestActivityPrivacyOptOut:
    @pytest.mark.asyncio
    async def test_disabling_tracking_purges_data(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        # Record some activity
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        await db_session.commit()

        # Verify activity exists
        count_result = await db_session.execute(
            select(func.count()).select_from(UserActivity).where(
                UserActivity.user_id == test_user.id
            )
        )
        assert count_result.scalar_one() == 1

        # Disable tracking
        response = await client.patch(
            "/api/users/me/preferences",
            json={"activity_tracking_enabled": False},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["activity_tracking_enabled"] is False

        # Verify activity was purged
        count_result2 = await db_session.execute(
            select(func.count()).select_from(UserActivity).where(
                UserActivity.user_id == test_user.id
            )
        )
        assert count_result2.scalar_one() == 0

    @pytest.mark.asyncio
    async def test_reenabling_tracking_starts_fresh(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        # Disable tracking
        await client.patch(
            "/api/users/me/preferences",
            json={"activity_tracking_enabled": False},
            headers=auth_headers,
        )

        # Re-enable tracking
        response = await client.patch(
            "/api/users/me/preferences",
            json={"activity_tracking_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["activity_tracking_enabled"] is True

        # Feed should be empty but tracking enabled
        feed_response = await client.get("/api/activity", headers=auth_headers)
        data = feed_response.json()
        assert data["items"] == []
        assert data["tracking_enabled"] is True
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/test_activity_privacy.py -v`
Expected: FAIL — `activity_tracking_enabled` not in schema.

**Step 3: Update preferences schema**

Modify `services/core-api/app/schemas/preferences.py`:

Add `activity_tracking_enabled` field to `UserPreferences`:
```python
activity_tracking_enabled: bool = Field(
    default=True, description="Whether activity tracking is enabled"
)
```

Add `activity_tracking_enabled` field to `PreferencesUpdateRequest`:
```python
activity_tracking_enabled: bool | None = Field(
    None, description="Enable or disable activity tracking"
)
```

Add `activity_tracking_enabled` field to `PreferencesResponse`:
```python
activity_tracking_enabled: bool
```

**Step 4: Update settings service to purge on opt-out**

Modify `services/core-api/app/services/settings.py`:

Add import at top:
```python
from .activity import clear_user_activity
```

In `update_user_preferences()`, after `user.preferences = current_prefs` and before `await db.commit()`, add:

```python
# If activity tracking was just disabled, purge existing activity data
if (
    "activity_tracking_enabled" in updates
    and not updates["activity_tracking_enabled"]
):
    await clear_user_activity(db, user_id)
    logger.info(
        "user.activity_tracking.disabled_and_purged",
        extra={"user_id": str(user_id)},
    )
```

Also update the `return PreferencesResponse(...)` in both `get_user_preferences` and `update_user_preferences` to include:
```python
activity_tracking_enabled=current_prefs.get(
    "activity_tracking_enabled", defaults["activity_tracking_enabled"]
),
```

(Use `prefs` instead of `current_prefs` in `get_user_preferences`, matching the existing variable name.)

**Step 5: Run the privacy tests**

Run: `cd services/core-api && uv run pytest tests/test_activity_privacy.py -v`
Expected: All tests PASS.

**Step 6: Run all existing tests to verify no regressions**

Run: `cd services/core-api && uv run pytest -v`
Expected: All tests PASS.

**Step 7: Commit**

```bash
git add services/core-api/app/schemas/preferences.py services/core-api/app/services/settings.py services/core-api/tests/test_activity_privacy.py
git commit -m "feat(activity): add privacy opt-out with data purge"
```

---

### Task 8: Internal Cleanup Endpoint

**Files:**
- Modify: `services/core-api/app/routes/activity.py`

**Step 1: Write the failing test**

Add to `services/core-api/tests/test_activity_routes.py`:

```python
class TestCleanupEndpoint:
    @pytest.mark.asyncio
    async def test_cleanup_returns_deleted_count(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        response = await client.get("/api/internal/activity/cleanup")
        assert response.status_code == 200
        data = response.json()
        assert "deleted_count" in data
```

**Step 2: Run test to verify it fails**

Run: `cd services/core-api && uv run pytest tests/test_activity_routes.py::TestCleanupEndpoint -v`
Expected: FAIL — endpoint doesn't exist.

**Step 3: Add the cleanup endpoint**

Add to `services/core-api/app/routes/activity.py`:

```python
# Internal cleanup endpoint — called by Kubernetes CronJob
internal_router = APIRouter(prefix="/api/internal/activity", tags=["activity-internal"])


@internal_router.get("/cleanup", response_model=CleanupResponse)
async def run_cleanup(
    db: AsyncSession = Depends(get_db),
) -> CleanupResponse:
    """Run tiered retention cleanup. Called by CronJob — no auth required."""
    deleted = await activity_service.run_retention_cleanup(db=db)
    await db.commit()
    return CleanupResponse(deleted_count=deleted)
```

Register the internal router in `main.py`:

Update the import:
```python
from .routes.activity import router as activity_router, internal_router as activity_internal_router
```

Add:
```python
app.include_router(activity_internal_router)
```

**Step 4: Run tests**

Run: `cd services/core-api && uv run pytest tests/test_activity_routes.py -v`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add services/core-api/app/routes/activity.py services/core-api/app/main.py services/core-api/tests/test_activity_routes.py
git commit -m "feat(activity): add internal cleanup endpoint for retention CronJob"
```

---

### Task 9: Instrument Story Routes

**Files:**
- Modify: `services/core-api/app/routes/story.py`

**Step 1: Add activity recording to story routes**

Modify `services/core-api/app/routes/story.py`:

Add import:
```python
from ..services import activity as activity_service
```

In `create_story()`, after `story = await story_service.create_story(...)` and before the background indexing block:
```python
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="created",
    entity_type="story",
    entity_id=story.id,
    metadata={
        "title": story.title,
        "legacy_id": str(story.legacies[0].legacy_id) if story.legacies else None,
    },
)
```

In `get_story()`, after the `return await story_service.get_story_detail(...)` call — restructure to capture the result:
```python
result = await story_service.get_story_detail(
    db=db, user_id=session.user_id, story_id=story_id,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="viewed",
    entity_type="story",
    entity_id=story_id,
    metadata={"title": result.title},
    deduplicate_minutes=5,
)
return result
```

In `update_story()`, after `story = await story_service.update_story(...)` and before the reindex block:
```python
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="updated",
    entity_type="story",
    entity_id=story_id,
    metadata={"title": story.title},
)
```

In `delete_story()`, before the `await story_service.delete_story(...)` call, capture the title for metadata (the entity will be deleted after):
```python
# Capture title before deletion for activity metadata
story_detail = await story_service.get_story_detail(
    db=db, user_id=session.user_id, story_id=story_id,
)
await story_service.delete_story(
    db=db, user_id=session.user_id, story_id=story_id,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="deleted",
    entity_type="story",
    entity_id=story_id,
    metadata={"title": story_detail.title},
)
```

**Step 2: Run existing story tests to verify no regressions**

Run: `cd services/core-api && uv run pytest tests/test_stories.py -v`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add services/core-api/app/routes/story.py
git commit -m "feat(activity): instrument story routes with activity recording"
```

---

### Task 10: Instrument Legacy Routes

**Files:**
- Modify: `services/core-api/app/routes/legacy.py`

**Step 1: Add activity recording to legacy routes**

Modify `services/core-api/app/routes/legacy.py`:

Add import:
```python
from ..services import activity as activity_service
```

In `create_legacy()`, after `return await legacy_service.create_legacy(...)` — restructure to capture result:
```python
result = await legacy_service.create_legacy(
    db=db, user_id=session.user_id, data=data,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="created",
    entity_type="legacy",
    entity_id=result.id,
    metadata={"name": result.name},
)
return result
```

In `get_legacy()`, restructure similarly:
```python
result = await legacy_service.get_legacy_detail(
    db=db, user_id=session.user_id, legacy_id=legacy_id,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="viewed",
    entity_type="legacy",
    entity_id=legacy_id,
    metadata={"name": result.name},
    deduplicate_minutes=5,
)
return result
```

In `update_legacy()`:
```python
result = await legacy_service.update_legacy(
    db=db, user_id=session.user_id, legacy_id=legacy_id, data=data,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="updated",
    entity_type="legacy",
    entity_id=legacy_id,
    metadata={"name": result.name},
)
return result
```

In `delete_legacy()`, capture name before deletion:
```python
legacy_detail = await legacy_service.get_legacy_detail(
    db=db, user_id=session.user_id, legacy_id=legacy_id,
)
await legacy_service.delete_legacy(
    db=db, user_id=session.user_id, legacy_id=legacy_id,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="deleted",
    entity_type="legacy",
    entity_id=legacy_id,
    metadata={"name": legacy_detail.name},
)
```

**Step 2: Run existing legacy tests**

Run: `cd services/core-api && uv run pytest tests/test_legacies.py -v`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add services/core-api/app/routes/legacy.py
git commit -m "feat(activity): instrument legacy routes with activity recording"
```

---

### Task 11: Instrument Media Routes

**Files:**
- Modify: `services/core-api/app/routes/media.py`

**Step 1: Add activity recording to media routes**

Modify `services/core-api/app/routes/media.py`:

Add import:
```python
from ..services import activity as activity_service
```

In `confirm_upload()` (this is the "created" moment for media — when the upload is confirmed):
```python
result = await media_service.confirm_upload(
    db=db, user_id=session.user_id, media_id=media_id,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="created",
    entity_type="media",
    entity_id=media_id,
    metadata={"filename": result.filename, "content_type": result.content_type},
)
return result
```

In `get_media()`:
```python
result = await media_service.get_media_detail(
    db=db, user_id=session.user_id, media_id=media_id,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="viewed",
    entity_type="media",
    entity_id=media_id,
    metadata={"filename": result.filename},
    deduplicate_minutes=5,
)
return result
```

In `delete_media()`, capture filename before deletion:
```python
media_detail = await media_service.get_media_detail(
    db=db, user_id=session.user_id, media_id=media_id,
)
await media_service.delete_media(
    db=db, user_id=session.user_id, media_id=media_id,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="deleted",
    entity_type="media",
    entity_id=media_id,
    metadata={"filename": media_detail.filename},
)
```

**Step 2: Run existing media tests**

Run: `cd services/core-api && uv run pytest tests/test_media.py -v`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add services/core-api/app/routes/media.py
git commit -m "feat(activity): instrument media routes with activity recording"
```

---

### Task 12: Instrument AI and Evolution Routes

**Files:**
- Modify: `services/core-api/app/routes/ai.py`
- Modify: `services/core-api/app/routes/story_evolution.py`

**Step 1: Instrument AI conversation routes**

Modify `services/core-api/app/routes/ai.py`:

Add import:
```python
from ..services import activity as activity_service
```

In `create_conversation()`:
```python
result = await ai_service.get_or_create_conversation(
    db=db, user_id=session.user_id, data=data,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="ai_conversation_started",
    entity_type="conversation",
    entity_id=result.id,
    metadata={"persona_id": result.persona_id, "title": result.title},
)
return result
```

In `create_new_conversation()`:
```python
result = await ai_service.create_conversation(
    db=db, user_id=session.user_id, data=data,
)
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action="ai_conversation_started",
    entity_type="conversation",
    entity_id=result.id,
    metadata={"persona_id": result.persona_id, "title": result.title},
)
return result
```

**Step 2: Instrument story evolution routes**

Modify `services/core-api/app/routes/story_evolution.py`:

Add import:
```python
from app.services import activity as activity_service
```

In `start_evolution()`, after the evolution session is created and before the return:
```python
await activity_service.record_activity(
    db=db,
    user_id=session_data.user_id,
    action="ai_story_evolved",
    entity_type="story",
    entity_id=story_id,
    metadata={"persona_id": data.persona_id},
)
```

**Step 3: Run existing AI and evolution tests**

Run: `cd services/core-api && uv run pytest tests/test_ai.py tests/test_story_evolution.py -v`
Expected: All tests PASS (or skip if those test files don't exist — check first).

**Step 4: Commit**

```bash
git add services/core-api/app/routes/ai.py services/core-api/app/routes/story_evolution.py
git commit -m "feat(activity): instrument AI conversation and story evolution routes"
```

---

### Task 13: Instrument Favorites Route

**Files:**
- Modify: `services/core-api/app/routes/favorite.py`

**Step 1: Add activity recording to favorite toggle**

Modify `services/core-api/app/routes/favorite.py`:

Add import:
```python
from ..services import activity as activity_service
```

In `toggle_favorite()`, after `result = await favorite_service.toggle_favorite(...)`:
```python
action = "favorited" if result["favorited"] else "unfavorited"
await activity_service.record_activity(
    db=db,
    user_id=session.user_id,
    action=action,
    entity_type=data.entity_type,
    entity_id=data.entity_id,
)
```

**Step 2: Run existing favorites tests**

Run: `cd services/core-api && uv run pytest tests/test_favorites.py -v`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add services/core-api/app/routes/favorite.py
git commit -m "feat(activity): instrument favorites route with activity recording"
```

---

### Task 14: Validate Backend (Ruff + MyPy)

**Files:** None — validation only.

**Step 1: Run backend validation**

Run: `just validate-backend`
Expected: All checks pass. If ruff or mypy issues arise, fix them in the relevant files.

Common issues to watch for:
- `metadata_` attribute access pattern may need `# type: ignore[attr-defined]` in some places
- Import ordering may need adjustment for ruff
- The `PG_JSON` import may need to be adjusted if mypy complains — use `from sqlalchemy.dialects.postgresql import JSON`

**Step 2: Fix any issues found and re-run validation**

Run: `just validate-backend`
Expected: Clean pass.

**Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix(activity): address linting and type checking issues"
```

---

### Task 15: Run Full Test Suite

**Files:** None — testing only.

**Step 1: Run all tests**

Run: `cd services/core-api && uv run pytest -v`
Expected: All tests PASS, including pre-existing tests (no regressions).

**Step 2: Fix any regressions found**

If any existing tests break:
- The most likely cause is the `conftest.py` `client` fixture — the activity routes don't use `get_db_for_background`, so they shouldn't need mocking.
- Check if any existing test relies on the `PreferencesResponse` schema shape (it now has `activity_tracking_enabled`).

**Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix(activity): address test regressions from activity tracking integration"
```

---

### Task 16: Final Review and Cleanup

**Step 1: Verify the full feature works end-to-end**

Run: `cd services/core-api && uv run pytest tests/test_activity_service.py tests/test_activity_routes.py tests/test_activity_privacy.py -v`
Expected: All activity-specific tests PASS.

**Step 2: Run backend validation one final time**

Run: `just validate-backend`
Expected: Clean pass.

**Step 3: Review the changes**

Run: `git log --oneline -15` to see the commit history.
Run: `git diff develop --stat` to see the total files changed.

Verify:
- New files: `models/activity.py`, `schemas/activity.py`, `routes/activity.py`, `services/activity.py`, 3 test files, 1 migration
- Modified files: `models/__init__.py`, `main.py`, `schemas/preferences.py`, `services/settings.py`, `routes/story.py`, `routes/legacy.py`, `routes/media.py`, `routes/ai.py`, `routes/story_evolution.py`, `routes/favorite.py`
