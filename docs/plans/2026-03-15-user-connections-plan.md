# User Connections, Profiles & Legacy Access Requests — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user profiles with visibility controls, user-to-user mutual-consent connections, and user-initiated legacy access requests to the Mosaic Life platform.

**Architecture:** Three-phase backend-first approach. Phase 1 builds the foundation (username, profile settings, shared relationship model with migration from legacy_members.profile JSON). Phase 2 adds the connection lifecycle (requests, acceptance, removal, Neptune sync). Phase 3 adds legacy access requests with admin approval. Each phase is independently deployable. Backend uses FastAPI + SQLAlchemy 2.x + Alembic; frontend uses React + shadcn/ui + TanStack Query.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy 2.x / Alembic / PostgreSQL / Neptune (graph) / React 18 / TypeScript / TanStack Query v5 / shadcn/ui / Zod / React Hook Form / Vitest

**Design doc:** [docs/plans/2026-03-15-user-connections-design.md](2026-03-15-user-connections-design.md)

---

## Implementation Status

| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|
| Phase 1: Foundation (Tasks 1-9) | ✅ Complete | `415ab46` | Username, profiles, visibility, relationships |
| Phase 2: Connections (Tasks 10-17) | ✅ Complete | `83a18a7` | Connection requests, lifecycle, graph sync, notifications |
| Phase 3: Legacy Access (Tasks 18-22) | ✅ Complete | `197f7aa` | Access request workflow, admin approval, connected member context |
| Phase 4: Frontend (Tasks 23-30) | 🔄 In progress | — | Detailed plan: [2026-03-16-user-connections-frontend-plan.md](2026-03-16-user-connections-frontend-plan.md) |

| Alembic Migration (Tasks 4-5, 11) | ✅ Complete | `c265747` | Single migration covering all schema changes + data backfill |

**Deferred items:**
- Task 22: Enhanced duplicate detection — basic implementation in place, advanced matching deferred
- Task 28: Enhanced legacy creation with connection-aware duplicate suggestions — requires backend endpoint

**Phase 4 approach changes:**
- Task 25: `/connections` page extended with new tabs (Option A: coexist with AI Connections Hub) instead of full replacement
- Task 24: Settings tab named "Connections & Privacy" — includes username, discoverability, visibility controls
- Task 30: Not needed — backend migration already renamed fields, existing components use API responses directly

---

## Phase 1: Foundation ✅

### Task 1: Add Username Column to Users Model

**Files:**
- Modify: `services/core-api/app/models/user.py`
- Test: `services/core-api/tests/test_user_model.py`

**Step 1: Write failing test for username field on User model**

```python
# tests/test_user_model.py
"""Tests for User model username field."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
class TestUserUsername:
    async def test_user_has_username_field(self, db_session: AsyncSession) -> None:
        user = User(
            email="username@example.com",
            google_id="google_uname_1",
            name="Jane Doe",
            username="jane-doe-a1b2",
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        assert user.username == "jane-doe-a1b2"

    async def test_username_must_be_unique(self, db_session: AsyncSession) -> None:
        user1 = User(
            email="u1@example.com",
            google_id="g1",
            name="User One",
            username="unique-name-x1y2",
        )
        user2 = User(
            email="u2@example.com",
            google_id="g2",
            name="User Two",
            username="unique-name-x1y2",
        )
        db_session.add(user1)
        await db_session.commit()
        db_session.add(user2)
        with pytest.raises(Exception):  # IntegrityError
            await db_session.commit()
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_user_model.py -v
```

Expected: FAIL — User model has no `username` parameter.

**Step 3: Add username field to User model**

In `services/core-api/app/models/user.py`, add after the `name` field:

```python
username: Mapped[str] = mapped_column(
    String(30), unique=True, nullable=False, index=True
)
```

**Step 4: Update test fixtures**

In `services/core-api/tests/conftest.py`, update `test_user` and `test_user_2` fixtures to include `username`:

```python
# test_user fixture
user = User(
    email="test@example.com",
    google_id="google_test_123",
    name="Test User",
    avatar_url="https://example.com/avatar.jpg",
    username="test-user-0001",
)

# test_user_2 fixture
user = User(
    email="test2@example.com",
    google_id="google_test_456",
    name="Test User 2",
    avatar_url="https://example.com/avatar2.jpg",
    username="test-user-2-0002",
)
```

**Step 5: Run tests to verify they pass**

```bash
cd services/core-api && uv run pytest tests/test_user_model.py -v
```

Expected: PASS

**Step 6: Validate and commit**

```bash
cd services/core-api && just validate-backend
git add services/core-api/app/models/user.py services/core-api/tests/conftest.py services/core-api/tests/test_user_model.py
git commit -m "feat(users): add username field to User model"
```

---

### Task 2: Username Validation Service

**Files:**
- Create: `services/core-api/app/services/username.py`
- Test: `services/core-api/tests/test_username_service.py`

**Step 1: Write failing tests for username validation and generation**

```python
# tests/test_username_service.py
"""Tests for username validation and generation."""

import pytest

from app.services.username import generate_username, validate_username


class TestValidateUsername:
    def test_valid_username(self) -> None:
        assert validate_username("joe-smith") is None

    def test_too_short(self) -> None:
        assert validate_username("ab") is not None

    def test_too_long(self) -> None:
        assert validate_username("a" * 31) is not None

    def test_uppercase_rejected(self) -> None:
        assert validate_username("JoeSmith") is not None

    def test_leading_hyphen_rejected(self) -> None:
        assert validate_username("-joe") is not None

    def test_trailing_hyphen_rejected(self) -> None:
        assert validate_username("joe-") is not None

    def test_special_chars_rejected(self) -> None:
        assert validate_username("joe_smith") is not None

    def test_reserved_word_rejected(self) -> None:
        assert validate_username("admin") is not None
        assert validate_username("settings") is not None
        assert validate_username("api") is not None

    def test_spaces_rejected(self) -> None:
        assert validate_username("joe smith") is not None


class TestGenerateUsername:
    def test_generates_from_name(self) -> None:
        username = generate_username("Joe Smith")
        assert username.startswith("joe-smith-")
        assert len(username) <= 30
        assert validate_username(username) is None

    def test_strips_special_chars(self) -> None:
        username = generate_username("José O'Brien-Smith")
        assert validate_username(username) is None

    def test_handles_empty_name(self) -> None:
        username = generate_username("")
        assert validate_username(username) is None
        assert len(username) >= 3
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_username_service.py -v
```

Expected: FAIL — module not found.

**Step 3: Implement username service**

```python
# services/core-api/app/services/username.py
"""Username validation and generation utilities."""

from __future__ import annotations

import re
import secrets
import string

RESERVED_WORDS: frozenset[str] = frozenset(
    {
        "admin",
        "api",
        "settings",
        "legacy",
        "legacies",
        "help",
        "support",
        "about",
        "auth",
        "login",
        "signup",
        "profile",
        "user",
        "users",
        "story",
        "stories",
        "media",
        "search",
        "explore",
        "notifications",
        "account",
        "privacy",
        "terms",
        "null",
        "undefined",
        "system",
        "connections",
        "favorites",
        "activity",
    }
)

_USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1}$")
_VALID_CHARS = re.compile(r"[^a-z0-9-]")
_SUFFIX_CHARS = string.ascii_lowercase + string.digits


def validate_username(username: str) -> str | None:
    """Validate a username. Returns error message or None if valid."""
    if len(username) < 3:
        return "Username must be at least 3 characters"
    if len(username) > 30:
        return "Username must be at most 30 characters"
    if not _USERNAME_PATTERN.match(username):
        return "Username must be lowercase alphanumeric and hyphens, cannot start or end with a hyphen"
    if username in RESERVED_WORDS:
        return "This username is reserved"
    return None


def generate_username(display_name: str) -> str:
    """Generate a username from a display name with random suffix."""
    # Normalize: lowercase, replace spaces/special chars with hyphens
    base = display_name.lower().strip()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = base.strip("-")

    if not base:
        base = "user"

    # Truncate to leave room for suffix (-xxxx = 5 chars)
    base = base[:24]
    base = base.rstrip("-")

    suffix = "".join(secrets.choice(_SUFFIX_CHARS) for _ in range(4))
    return f"{base}-{suffix}"
```

**Step 4: Run tests to verify they pass**

```bash
cd services/core-api && uv run pytest tests/test_username_service.py -v
```

Expected: PASS

**Step 5: Validate and commit**

```bash
cd services/core-api && just validate-backend
git add services/core-api/app/services/username.py services/core-api/tests/test_username_service.py
git commit -m "feat(users): add username validation and generation service"
```

---

### Task 3: Profile Settings and Relationships Models

**Files:**
- Create: `services/core-api/app/models/profile_settings.py`
- Create: `services/core-api/app/models/relationship.py`
- Modify: `services/core-api/app/models/__init__.py`
- Test: `services/core-api/tests/test_profile_relationship_models.py`

**Step 1: Write failing tests**

```python
# tests/test_profile_relationship_models.py
"""Tests for ProfileSettings and Relationship models."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile_settings import ProfileSettings, VisibilityTier
from app.models.relationship import Relationship
from app.models.user import User
from app.models.legacy import Legacy, LegacyMember


@pytest.mark.asyncio
class TestProfileSettings:
    async def test_create_profile_settings(self, db_session: AsyncSession, test_user: User) -> None:
        settings = ProfileSettings(user_id=test_user.id)
        db_session.add(settings)
        await db_session.commit()
        await db_session.refresh(settings)

        assert settings.discoverable is False
        assert settings.visibility_legacies == VisibilityTier.NOBODY.value
        assert settings.visibility_bio == VisibilityTier.CONNECTIONS.value


@pytest.mark.asyncio
class TestRelationship:
    async def test_create_legacy_membership_relationship(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ) -> None:
        rel = Relationship(
            owner_user_id=test_user.id,
            legacy_member_legacy_id=test_legacy.id,
            legacy_member_user_id=test_user.id,
            relationship_type="parent",
            who_they_are_to_me="my father",
        )
        db_session.add(rel)
        await db_session.commit()
        await db_session.refresh(rel)

        assert rel.relationship_type == "parent"
        assert rel.who_they_are_to_me == "my father"
        assert rel.connection_id is None
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_profile_relationship_models.py -v
```

Expected: FAIL — modules not found.

**Step 3: Create ProfileSettings model**

```python
# services/core-api/app/models/profile_settings.py
"""Profile settings model for user visibility controls."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base


class VisibilityTier(str, Enum):
    """Audience tiers for profile content visibility."""

    NOBODY = "nobody"
    CONNECTIONS = "connections"
    AUTHENTICATED = "authenticated"
    PUBLIC = "public"


class ProfileSettings(Base):
    """User profile visibility settings."""

    __tablename__ = "profile_settings"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    discoverable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    visibility_legacies: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=VisibilityTier.NOBODY.value
    )
    visibility_stories: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=VisibilityTier.NOBODY.value
    )
    visibility_media: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=VisibilityTier.NOBODY.value
    )
    visibility_connections: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=VisibilityTier.NOBODY.value
    )
    visibility_bio: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=VisibilityTier.CONNECTIONS.value
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User")  # type: ignore[name-defined]  # noqa: F821

    def __repr__(self) -> str:
        return f"<ProfileSettings(user_id={self.user_id}, discoverable={self.discoverable})>"
```

**Step 4: Create Relationship model**

```python
# services/core-api/app/models/relationship.py
"""Shared relationship model for connections and legacy memberships."""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class Relationship(Base):
    """Relationship data owned by a user, in the context of a connection or legacy membership."""

    __tablename__ = "relationships"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    owner_user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Context: connection (nullable)
    connection_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        # FK added after connections table exists (Phase 2 migration)
        nullable=True,
        index=True,
    )

    # Context: legacy membership (nullable composite FK)
    legacy_member_legacy_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )
    legacy_member_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )

    # Relationship data
    relationship_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    who_they_are_to_me: Mapped[str | None] = mapped_column(Text, nullable=True)
    who_i_am_to_them: Mapped[str | None] = mapped_column(Text, nullable=True)
    nicknames: Mapped[list[str] | None] = mapped_column(
        ARRAY(String(100)), nullable=True
    )
    character_traits: Mapped[list[str] | None] = mapped_column(
        ARRAY(String(100)), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["legacy_member_legacy_id", "legacy_member_user_id"],
            ["legacy_members.legacy_id", "legacy_members.user_id"],
            ondelete="CASCADE",
            name="fk_relationship_legacy_member",
        ),
        CheckConstraint(
            """(
                (connection_id IS NOT NULL AND legacy_member_legacy_id IS NULL AND legacy_member_user_id IS NULL)
                OR
                (connection_id IS NULL AND legacy_member_legacy_id IS NOT NULL AND legacy_member_user_id IS NOT NULL)
            )""",
            name="ck_relationship_exactly_one_context",
        ),
    )

    def __repr__(self) -> str:
        return f"<Relationship(id={self.id}, owner={self.owner_user_id}, type={self.relationship_type})>"
```

**Note:** The CHECK constraint enforces exactly one context. The `connection_id` FK constraint will be added in the Phase 2 migration when the `connections` table is created. For Phase 1 tests using SQLite, the ARRAY type and CHECK may need adaptation — use JSON fallback in test setup if needed.

**Step 5: Update models __init__.py**

Add imports for the new models:

```python
from .profile_settings import ProfileSettings
from .relationship import Relationship
```

Add to `__all__`:

```python
"ProfileSettings",
"Relationship",
```

**Step 6: Run tests to verify they pass**

```bash
cd services/core-api && uv run pytest tests/test_profile_relationship_models.py -v
```

Expected: PASS (may need SQLite array compatibility — if so, adjust the ARRAY column to use JSON for test compatibility, following the pattern used elsewhere in the codebase).

**Step 7: Validate and commit**

```bash
cd services/core-api && just validate-backend
git add services/core-api/app/models/profile_settings.py services/core-api/app/models/relationship.py services/core-api/app/models/__init__.py services/core-api/tests/test_profile_relationship_models.py
git commit -m "feat(models): add ProfileSettings and Relationship models"
```

---

### Task 4: Alembic Migration — Username, Profile Settings, Relationships

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_add_usernames_profile_settings_relationships.py`

**Step 1: Generate migration**

```bash
cd services/core-api && uv run alembic revision --autogenerate -m "add usernames profile settings relationships"
```

**Step 2: Review and edit the generated migration**

The migration must:
1. Add `username` column to `users` (initially nullable for backfill)
2. Create `profile_settings` table
3. Create `relationships` table with composite FK to `legacy_members` and CHECK constraint
4. Backfill usernames for existing users using the `generate_username` function
5. Make `username` NOT NULL after backfill
6. Create default `profile_settings` rows for existing users

Edit the generated migration to include the data backfill steps:

```python
def upgrade() -> None:
    # 1. Add username as nullable first
    op.add_column("users", sa.Column("username", sa.String(30), nullable=True))
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # 2. Create profile_settings table
    op.create_table(
        "profile_settings",
        sa.Column("user_id", PG_UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("discoverable", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("visibility_legacies", sa.String(20), nullable=False, server_default="nobody"),
        sa.Column("visibility_stories", sa.String(20), nullable=False, server_default="nobody"),
        sa.Column("visibility_media", sa.String(20), nullable=False, server_default="nobody"),
        sa.Column("visibility_connections", sa.String(20), nullable=False, server_default="nobody"),
        sa.Column("visibility_bio", sa.String(20), nullable=False, server_default="connections"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
    )

    # 3. Create relationships table
    op.create_table(
        "relationships",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_user_id", PG_UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("connection_id", PG_UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("legacy_member_legacy_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("legacy_member_user_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("relationship_type", sa.String(50), nullable=True),
        sa.Column("who_they_are_to_me", sa.Text(), nullable=True),
        sa.Column("who_i_am_to_them", sa.Text(), nullable=True),
        sa.Column("nicknames", ARRAY(sa.String(100)), nullable=True),
        sa.Column("character_traits", ARRAY(sa.String(100)), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(
            ["legacy_member_legacy_id", "legacy_member_user_id"],
            ["legacy_members.legacy_id", "legacy_members.user_id"],
            ondelete="CASCADE",
            name="fk_relationship_legacy_member",
        ),
        sa.CheckConstraint(
            "(connection_id IS NOT NULL AND legacy_member_legacy_id IS NULL AND legacy_member_user_id IS NULL) "
            "OR (connection_id IS NULL AND legacy_member_legacy_id IS NOT NULL AND legacy_member_user_id IS NOT NULL)",
            name="ck_relationship_exactly_one_context",
        ),
    )

    # 4. Backfill usernames (inline Python — small user base)
    # Use raw SQL for the backfill
    conn = op.get_bind()
    users = conn.execute(sa.text("SELECT id, name FROM users WHERE username IS NULL"))
    for user_id, name in users:
        base = re.sub(r"[^a-z0-9]+", "-", (name or "user").lower().strip()).strip("-") or "user"
        base = base[:24].rstrip("-")
        suffix = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(4))
        username = f"{base}-{suffix}"
        conn.execute(sa.text("UPDATE users SET username = :username WHERE id = :id"), {"username": username, "id": user_id})

    # 5. Make username NOT NULL
    op.alter_column("users", "username", nullable=False)

    # 6. Backfill profile_settings for existing users
    conn.execute(sa.text("INSERT INTO profile_settings (user_id) SELECT id FROM users"))
```

**Step 3: Run migration locally**

```bash
cd services/core-api && uv run alembic upgrade head
```

**Step 4: Verify migration worked**

```bash
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\\d users" | head -20
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\\d profile_settings"
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\\d relationships"
```

**Step 5: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(db): add migration for usernames, profile_settings, relationships"
```

---

### Task 5: Migrate Legacy Member Profile Data to Relationships Table

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_migrate_member_profiles_to_relationships.py`

**Step 1: Create the data migration**

```bash
cd services/core-api && uv run alembic revision -m "migrate member profiles to relationships"
```

Edit the migration:

```python
def upgrade() -> None:
    # Migrate legacy_members.profile JSON → relationships rows
    conn = op.get_bind()
    members = conn.execute(sa.text(
        "SELECT legacy_id, user_id, profile FROM legacy_members WHERE profile IS NOT NULL"
    ))
    for legacy_id, user_id, profile_data in members:
        if not profile_data:
            continue
        # Map old field names to new
        conn.execute(
            sa.text("""
                INSERT INTO relationships (
                    id, owner_user_id, legacy_member_legacy_id, legacy_member_user_id,
                    relationship_type, who_they_are_to_me, who_i_am_to_them,
                    nicknames, character_traits
                ) VALUES (
                    gen_random_uuid(), :owner, :lm_legacy, :lm_user,
                    :rel_type, :who_they_are, :who_i_am,
                    :nicknames, :traits
                )
            """),
            {
                "owner": user_id,
                "lm_legacy": legacy_id,
                "lm_user": user_id,
                "rel_type": profile_data.get("relationship_type"),
                "who_they_are": profile_data.get("viewer_to_legacy"),  # "how I see them" → who_they_are_to_me
                "who_i_am": profile_data.get("legacy_to_viewer"),  # "how they see me" → who_i_am_to_them
                "nicknames": profile_data.get("nicknames"),
                "traits": profile_data.get("character_traits"),
            },
        )

    # Drop the profile column from legacy_members
    op.drop_column("legacy_members", "profile")


def downgrade() -> None:
    # Re-add profile column
    op.add_column("legacy_members", sa.Column("profile", JSONB, nullable=True))

    # Migrate data back from relationships
    conn = op.get_bind()
    rels = conn.execute(sa.text(
        "SELECT owner_user_id, legacy_member_legacy_id, legacy_member_user_id, "
        "relationship_type, who_they_are_to_me, who_i_am_to_them, nicknames, character_traits "
        "FROM relationships WHERE legacy_member_legacy_id IS NOT NULL"
    ))
    for row in rels:
        import json
        profile = {
            "relationship_type": row.relationship_type,
            "viewer_to_legacy": row.who_they_are_to_me,
            "legacy_to_viewer": row.who_i_am_to_them,
            "nicknames": row.nicknames,
            "character_traits": row.character_traits,
        }
        conn.execute(
            sa.text("UPDATE legacy_members SET profile = :profile WHERE legacy_id = :lid AND user_id = :uid"),
            {"profile": json.dumps(profile), "lid": row.legacy_member_legacy_id, "uid": row.legacy_member_user_id},
        )
```

**Step 2: Run migration**

```bash
cd services/core-api && uv run alembic upgrade head
```

**Step 3: Verify data migrated correctly**

```bash
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "SELECT count(*) FROM relationships WHERE legacy_member_legacy_id IS NOT NULL"
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\\d legacy_members"
```

Verify `profile` column no longer exists on `legacy_members`.

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(db): migrate legacy member profiles to relationships table"
```

---

### Task 6: Refactor Member Profile Service to Use Relationships Table

**Files:**
- Modify: `services/core-api/app/services/member_profile.py`
- Modify: `services/core-api/app/schemas/member_profile.py`
- Modify: `services/core-api/app/models/legacy.py` (remove profile field)
- Test: `services/core-api/tests/test_member_profile_service.py`

**Step 1: Write tests for the refactored service**

```python
# tests/test_member_profile_service.py
"""Tests for refactored member profile service using relationships table."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.user import User
from app.schemas.member_profile import MemberProfileUpdate
from app.services import member_profile as service


@pytest.mark.asyncio
class TestMemberProfileService:
    async def test_get_profile_returns_none_when_no_relationship(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ) -> None:
        result = await service.get_profile(db_session, test_legacy.id, test_user.id)
        assert result is None

    async def test_update_profile_creates_relationship(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ) -> None:
        data = MemberProfileUpdate(
            relationship_type="parent",
            who_they_are_to_me="my father",
        )
        result = await service.update_profile(db_session, test_legacy.id, test_user.id, data)
        assert result.relationship_type == "parent"
        assert result.who_they_are_to_me == "my father"

    async def test_update_profile_merges_partial_updates(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ) -> None:
        data1 = MemberProfileUpdate(relationship_type="friend")
        await service.update_profile(db_session, test_legacy.id, test_user.id, data1)

        data2 = MemberProfileUpdate(nicknames=["buddy"])
        result = await service.update_profile(db_session, test_legacy.id, test_user.id, data2)
        assert result.relationship_type == "friend"
        assert result.nicknames == ["buddy"]
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_member_profile_service.py -v
```

Expected: FAIL (service still reads from JSON profile column which no longer exists).

**Step 3: Update the schema**

In `services/core-api/app/schemas/member_profile.py`, rename the fields to match the new model:

```python
class MemberProfileUpdate(BaseModel):
    """Request to create or update a member's relationship profile."""

    relationship_type: str | None = Field(None, max_length=50)
    nicknames: list[str] | None = None
    who_they_are_to_me: str | None = Field(None, max_length=1000)
    who_i_am_to_them: str | None = Field(None, max_length=1000)
    character_traits: list[str] | None = None

    # ... validators unchanged ...


class MemberProfileResponse(BaseModel):
    """Response containing a member's relationship profile."""

    relationship_type: str | None = None
    nicknames: list[str] | None = None
    who_they_are_to_me: str | None = None
    who_i_am_to_them: str | None = None
    character_traits: list[str] | None = None
```

**Note:** This renames `legacy_to_viewer` → `who_i_am_to_them` and `viewer_to_legacy` → `who_they_are_to_me`. The frontend will need corresponding updates (Task in Phase 1 frontend work).

**Step 4: Refactor the service**

Rewrite `services/core-api/app/services/member_profile.py` to query/upsert the `relationships` table instead of the JSON `profile` field:

```python
"""Service for member relationship profiles."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.legacy import LegacyMember
from ..models.relationship import Relationship
from ..providers.registry import get_provider_registry
from ..schemas.member_profile import MemberProfileResponse, MemberProfileUpdate
from .graph_sync import categorize_relationship

if TYPE_CHECKING:
    from ..adapters.graph_adapter import GraphAdapter

logger = logging.getLogger(__name__)


async def _get_member(db: AsyncSession, legacy_id: UUID, user_id: UUID) -> LegacyMember:
    """Get a legacy member, raising 403 if not found or pending."""
    result = await db.execute(
        select(LegacyMember)
        .options(selectinload(LegacyMember.legacy))
        .where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()

    if not member or member.role == "pending":
        raise HTTPException(status_code=403, detail="Not a member of this legacy")

    return member


async def _get_relationship(
    db: AsyncSession, legacy_id: UUID, user_id: UUID
) -> Relationship | None:
    """Get the relationship record for a legacy membership."""
    result = await db.execute(
        select(Relationship).where(
            Relationship.owner_user_id == user_id,
            Relationship.legacy_member_legacy_id == legacy_id,
            Relationship.legacy_member_user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_profile(
    db: AsyncSession, legacy_id: UUID, user_id: UUID
) -> MemberProfileResponse | None:
    """Get a member's relationship profile."""
    await _get_member(db, legacy_id, user_id)
    rel = await _get_relationship(db, legacy_id, user_id)

    if rel is None:
        return None

    return MemberProfileResponse(
        relationship_type=rel.relationship_type,
        nicknames=rel.nicknames,
        who_they_are_to_me=rel.who_they_are_to_me,
        who_i_am_to_them=rel.who_i_am_to_them,
        character_traits=rel.character_traits,
    )


async def update_profile(
    db: AsyncSession, legacy_id: UUID, user_id: UUID, data: MemberProfileUpdate
) -> MemberProfileResponse:
    """Create or update a member's relationship profile."""
    member = await _get_member(db, legacy_id, user_id)
    rel = await _get_relationship(db, legacy_id, user_id)

    if rel is None:
        # Create new relationship
        rel = Relationship(
            owner_user_id=user_id,
            legacy_member_legacy_id=legacy_id,
            legacy_member_user_id=user_id,
        )
        db.add(rel)

    # Merge: update only explicitly provided fields
    for key in data.model_fields_set:
        setattr(rel, key, getattr(data, key))

    await db.commit()
    await db.refresh(rel)

    logger.info(
        "member_profile.updated",
        extra={"legacy_id": str(legacy_id), "user_id": str(user_id)},
    )

    # Best-effort graph sync
    try:
        registry = get_provider_registry()
        graph_adapter = registry.get_graph_adapter()
        if graph_adapter:
            await _sync_relationship_to_graph(
                graph_adapter,
                user_id=user_id,
                legacy_id=legacy_id,
                legacy_person_id=member.legacy.person_id,
                relationship_type=rel.relationship_type,
            )
    except Exception:
        logger.warning(
            "member_profile.graph_sync_failed",
            extra={"legacy_id": str(legacy_id), "user_id": str(user_id)},
            exc_info=True,
        )

    return MemberProfileResponse(
        relationship_type=rel.relationship_type,
        nicknames=rel.nicknames,
        who_they_are_to_me=rel.who_they_are_to_me,
        who_i_am_to_them=rel.who_i_am_to_them,
        character_traits=rel.character_traits,
    )


async def _sync_relationship_to_graph(
    graph_adapter: GraphAdapter,
    user_id: UUID,
    legacy_id: UUID,
    legacy_person_id: UUID,
    relationship_type: str | None,
) -> None:
    """Sync a declared member relationship to the graph as a Person->Person edge."""
    # Unchanged from existing implementation
    user_node_id = f"user-{user_id}"
    legacy_node_id = str(legacy_person_id)

    await graph_adapter.upsert_node(
        "Person", user_node_id,
        {"user_id": str(user_id), "is_user": "true", "source": "declared"},
    )
    await graph_adapter.upsert_node(
        "Person", legacy_node_id,
        {"legacy_id": str(legacy_id), "is_legacy": "true", "source": "declared"},
    )

    await graph_adapter.replace_relationship(
        "Person", user_node_id,
        ["FAMILY_OF", "WORKED_WITH", "FRIENDS_WITH", "KNEW"],
        "Person", legacy_node_id,
        new_rel_type=categorize_relationship(relationship_type) if relationship_type else None,
        properties={"relationship_type": relationship_type, "source": "declared"} if relationship_type else None,
    )
```

**Step 5: Remove profile field from LegacyMember model**

In `services/core-api/app/models/legacy.py`, remove line 147:

```python
# DELETE this line:
profile: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
```

Also remove the `JSON` import from the top if no longer used, and the `Any` import from typing if no longer used.

**Step 6: Run tests**

```bash
cd services/core-api && uv run pytest tests/test_member_profile_service.py -v
cd services/core-api && uv run pytest -v  # Run full suite to catch regressions
```

**Step 7: Validate and commit**

```bash
cd services/core-api && just validate-backend
git add services/core-api/app/services/member_profile.py services/core-api/app/schemas/member_profile.py services/core-api/app/models/legacy.py services/core-api/tests/test_member_profile_service.py
git commit -m "refactor(profiles): migrate member profiles from JSON to relationships table"
```

---

### Task 7: Profile Schemas and Service

**Files:**
- Create: `services/core-api/app/schemas/profile.py`
- Create: `services/core-api/app/services/profile.py`
- Test: `services/core-api/tests/test_profile_service.py`

**Step 1: Write failing tests**

```python
# tests/test_profile_service.py
"""Tests for user profile service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.profile_settings import ProfileSettings
from app.services import profile as profile_service


@pytest.mark.asyncio
class TestGetProfileByUsername:
    async def test_returns_profile_for_public_bio(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        settings = ProfileSettings(
            user_id=test_user.id,
            visibility_bio="public",
        )
        db_session.add(settings)
        await db_session.commit()

        result = await profile_service.get_profile_by_username(
            db_session, test_user.username, viewer_user_id=None
        )
        assert result is not None
        assert result.display_name == test_user.name
        assert result.bio == test_user.bio

    async def test_hides_bio_when_not_authorized(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        settings = ProfileSettings(
            user_id=test_user.id,
            visibility_bio="connections",
        )
        db_session.add(settings)
        await db_session.commit()

        result = await profile_service.get_profile_by_username(
            db_session, test_user.username, viewer_user_id=None
        )
        assert result is not None
        assert result.bio is None

    async def test_returns_none_for_unknown_username(
        self, db_session: AsyncSession
    ) -> None:
        result = await profile_service.get_profile_by_username(
            db_session, "nonexistent-user", viewer_user_id=None
        )
        assert result is None


@pytest.mark.asyncio
class TestUpdateUsername:
    async def test_update_username(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        await profile_service.update_username(db_session, test_user.id, "new-username")
        await db_session.refresh(test_user)
        assert test_user.username == "new-username"

    async def test_rejects_invalid_username(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        with pytest.raises(Exception):  # HTTPException 400
            await profile_service.update_username(db_session, test_user.id, "ab")

    async def test_rejects_reserved_username(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        with pytest.raises(Exception):  # HTTPException 400
            await profile_service.update_username(db_session, test_user.id, "admin")


@pytest.mark.asyncio
class TestUpdateVisibilitySettings:
    async def test_update_settings(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user.id)
        db_session.add(settings)
        await db_session.commit()

        result = await profile_service.update_visibility_settings(
            db_session, test_user.id, discoverable=True, visibility_bio="public"
        )
        assert result.discoverable is True
        assert result.visibility_bio == "public"
```

**Step 2: Run tests to verify they fail**

```bash
cd services/core-api && uv run pytest tests/test_profile_service.py -v
```

**Step 3: Create profile schemas**

```python
# services/core-api/app/schemas/profile.py
"""Pydantic schemas for user profiles."""

from uuid import UUID

from pydantic import BaseModel, Field


class ProfileResponse(BaseModel):
    """Public profile data, filtered by viewer authorization."""

    username: str
    display_name: str
    avatar_url: str | None = None
    bio: str | None = None  # None if viewer not authorized
    legacies: list["ProfileLegacyCard"] | None = None
    stories: list["ProfileStoryCard"] | None = None
    connections: list["ProfileConnectionCard"] | None = None
    visibility_context: "VisibilityContext"


class ProfileLegacyCard(BaseModel):
    id: UUID
    name: str
    subject_photo_url: str | None = None
    story_count: int = 0


class ProfileStoryCard(BaseModel):
    id: UUID
    title: str
    preview: str | None = None
    legacy_name: str | None = None


class ProfileConnectionCard(BaseModel):
    username: str
    display_name: str
    avatar_url: str | None = None


class VisibilityContext(BaseModel):
    """Tells the frontend which sections to render."""

    show_bio: bool = False
    show_legacies: bool = False
    show_stories: bool = False
    show_media: bool = False
    show_connections: bool = False


class ProfileSettingsResponse(BaseModel):
    discoverable: bool
    visibility_legacies: str
    visibility_stories: str
    visibility_media: str
    visibility_connections: str
    visibility_bio: str


class ProfileSettingsUpdate(BaseModel):
    discoverable: bool | None = None
    visibility_legacies: str | None = Field(None, pattern="^(nobody|connections|authenticated|public)$")
    visibility_stories: str | None = Field(None, pattern="^(nobody|connections|authenticated|public)$")
    visibility_media: str | None = Field(None, pattern="^(nobody|connections|authenticated|public)$")
    visibility_connections: str | None = Field(None, pattern="^(nobody|connections|authenticated|public)$")
    visibility_bio: str | None = Field(None, pattern="^(nobody|connections|authenticated|public)$")


class ProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    bio: str | None = Field(None, max_length=500)
    avatar_url: str | None = Field(None, max_length=2000)


# Rebuild forward refs
ProfileResponse.model_rebuild()
```

**Step 4: Create profile service**

```python
# services/core-api/app/services/profile.py
"""Service for user profiles and visibility settings."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.profile_settings import ProfileSettings, VisibilityTier
from ..models.user import User
from ..schemas.profile import (
    ProfileResponse,
    ProfileSettingsResponse,
    ProfileSettingsUpdate,
    ProfileUpdate,
    VisibilityContext,
)
from .username import validate_username

logger = logging.getLogger(__name__)


def _viewer_can_see(tier: str, is_authenticated: bool, is_connected: bool) -> bool:
    """Check if a viewer meets the visibility tier requirement."""
    if tier == VisibilityTier.PUBLIC.value:
        return True
    if tier == VisibilityTier.AUTHENTICATED.value:
        return is_authenticated
    if tier == VisibilityTier.CONNECTIONS.value:
        return is_connected
    return False  # NOBODY


async def get_profile_by_username(
    db: AsyncSession,
    username: str,
    viewer_user_id: UUID | None,
) -> ProfileResponse | None:
    """Get a user's profile filtered by viewer's authorization level."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        return None

    settings_result = await db.execute(
        select(ProfileSettings).where(ProfileSettings.user_id == user.id)
    )
    settings = settings_result.scalar_one_or_none()

    if settings is None:
        # No settings = everything hidden
        return ProfileResponse(
            username=user.username,
            display_name=user.name,
            avatar_url=user.avatar_url,
            visibility_context=VisibilityContext(),
        )

    is_authenticated = viewer_user_id is not None
    is_self = viewer_user_id == user.id if viewer_user_id else False
    # TODO: check actual connection status in Phase 2
    is_connected = is_self

    ctx = VisibilityContext(
        show_bio=is_self or _viewer_can_see(settings.visibility_bio, is_authenticated, is_connected),
        show_legacies=is_self or _viewer_can_see(settings.visibility_legacies, is_authenticated, is_connected),
        show_stories=is_self or _viewer_can_see(settings.visibility_stories, is_authenticated, is_connected),
        show_media=is_self or _viewer_can_see(settings.visibility_media, is_authenticated, is_connected),
        show_connections=is_self or _viewer_can_see(settings.visibility_connections, is_authenticated, is_connected),
    )

    return ProfileResponse(
        username=user.username,
        display_name=user.name,
        avatar_url=user.avatar_url,
        bio=user.bio if ctx.show_bio else None,
        visibility_context=ctx,
        # Legacies, stories, connections populated in route layer with separate queries
    )


async def update_username(db: AsyncSession, user_id: UUID, new_username: str) -> None:
    """Change a user's username."""
    error = validate_username(new_username)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # Check uniqueness
    existing = await db.execute(select(User).where(User.username == new_username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Username is already taken")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.username = new_username
    await db.commit()

    logger.info("profile.username_changed", extra={"user_id": str(user_id), "new_username": new_username})


async def update_profile(db: AsyncSession, user_id: UUID, data: ProfileUpdate) -> User:
    """Update user profile fields (name, bio, avatar)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if data.name is not None:
        user.name = data.name
    if data.bio is not None:
        user.bio = data.bio
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url

    await db.commit()
    await db.refresh(user)
    return user


async def update_visibility_settings(
    db: AsyncSession,
    user_id: UUID,
    **kwargs: bool | str | None,
) -> ProfileSettingsResponse:
    """Update profile visibility settings."""
    result = await db.execute(select(ProfileSettings).where(ProfileSettings.user_id == user_id))
    settings = result.scalar_one_or_none()
    if settings is None:
        raise HTTPException(status_code=404, detail="Profile settings not found")

    for key, value in kwargs.items():
        if value is not None and hasattr(settings, key):
            setattr(settings, key, value)

    await db.commit()
    await db.refresh(settings)

    return ProfileSettingsResponse(
        discoverable=settings.discoverable,
        visibility_legacies=settings.visibility_legacies,
        visibility_stories=settings.visibility_stories,
        visibility_media=settings.visibility_media,
        visibility_connections=settings.visibility_connections,
        visibility_bio=settings.visibility_bio,
    )
```

**Step 5: Run tests**

```bash
cd services/core-api && uv run pytest tests/test_profile_service.py -v
```

**Step 6: Validate and commit**

```bash
cd services/core-api && just validate-backend
git add services/core-api/app/schemas/profile.py services/core-api/app/services/profile.py services/core-api/tests/test_profile_service.py
git commit -m "feat(profiles): add profile service with visibility filtering"
```

---

### Task 8: Profile API Routes

**Files:**
- Create: `services/core-api/app/routes/profile.py`
- Modify: `services/core-api/app/main.py` (register router)
- Test: `services/core-api/tests/test_profile_routes.py`

**Step 1: Write failing route tests**

```python
# tests/test_profile_routes.py
"""Tests for profile API routes."""

import pytest
from httpx import AsyncClient

from app.models.profile_settings import ProfileSettings
from app.models.user import User


@pytest.mark.asyncio
class TestGetProfile:
    async def test_get_profile_by_username(
        self, client: AsyncClient, test_user: User, db_session, auth_headers: dict
    ) -> None:
        settings = ProfileSettings(user_id=test_user.id, visibility_bio="public")
        db_session.add(settings)
        await db_session.commit()

        response = await client.get(f"/api/users/{test_user.username}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == test_user.username
        assert data["display_name"] == test_user.name

    async def test_get_profile_unknown_username(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        response = await client.get("/api/users/nonexistent-user", headers=auth_headers)
        assert response.status_code == 404


@pytest.mark.asyncio
class TestUpdateUsername:
    async def test_change_username(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ) -> None:
        response = await client.patch(
            "/api/users/me/username",
            json={"username": "new-name-1234"},
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_reject_invalid_username(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        response = await client.patch(
            "/api/users/me/username",
            json={"username": "ab"},
            headers=auth_headers,
        )
        assert response.status_code == 400


@pytest.mark.asyncio
class TestUpdateVisibilitySettings:
    async def test_update_settings(
        self, client: AsyncClient, test_user: User, db_session, auth_headers: dict
    ) -> None:
        settings = ProfileSettings(user_id=test_user.id)
        db_session.add(settings)
        await db_session.commit()

        response = await client.patch(
            "/api/users/me/profile/settings",
            json={"discoverable": True, "visibility_bio": "public"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["discoverable"] is True
        assert data["visibility_bio"] == "public"
```

**Step 2: Run tests to verify they fail**

```bash
cd services/core-api && uv run pytest tests/test_profile_routes.py -v
```

**Step 3: Create profile routes**

```python
# services/core-api/app/routes/profile.py
"""User profile API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import get_current_session, require_auth
from ..database import get_db
from ..schemas.profile import (
    ProfileResponse,
    ProfileSettingsResponse,
    ProfileSettingsUpdate,
    ProfileUpdate,
)
from ..services import profile as profile_service

router = APIRouter(prefix="/api/users", tags=["profiles"])


class UsernameUpdate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)


@router.get("/{username}", response_model=ProfileResponse)
async def get_profile(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    """Get a user's profile page data, filtered by viewer authorization."""
    session = get_current_session(request)
    viewer_user_id = session.user_id if session else None

    result = await profile_service.get_profile_by_username(db, username, viewer_user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.patch("/me/profile", response_model=dict)
async def update_profile(
    data: ProfileUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update the current user's profile (name, bio, avatar)."""
    session = require_auth(request)
    user = await profile_service.update_profile(db, session.user_id, data)
    return {"name": user.name, "bio": user.bio, "avatar_url": user.avatar_url}


@router.patch("/me/username")
async def update_username(
    data: UsernameUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Change the current user's username."""
    session = require_auth(request)
    await profile_service.update_username(db, session.user_id, data.username)
    return {"username": data.username}


@router.patch("/me/profile/settings", response_model=ProfileSettingsResponse)
async def update_visibility_settings(
    data: ProfileSettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ProfileSettingsResponse:
    """Update profile visibility settings."""
    session = require_auth(request)
    update_kwargs = {k: v for k, v in data.model_dump().items() if v is not None}
    return await profile_service.update_visibility_settings(db, session.user_id, **update_kwargs)
```

**Step 4: Register router in main.py**

In `services/core-api/app/main.py`, add:

```python
from .routes.profile import router as profile_router
```

And register it (add near the existing `user_router`):

```python
app.include_router(profile_router)
```

**Important:** The profile router must be registered BEFORE the user_router to avoid route conflicts (`/api/users/{username}` vs `/api/users/search`). Alternatively, ensure the `search` route has priority by keeping it on the existing user_router and placing it first.

**Step 5: Run tests**

```bash
cd services/core-api && uv run pytest tests/test_profile_routes.py -v
```

**Step 6: Validate and commit**

```bash
cd services/core-api && just validate-backend
git add services/core-api/app/routes/profile.py services/core-api/app/main.py services/core-api/tests/test_profile_routes.py
git commit -m "feat(profiles): add profile API routes"
```

---

### Task 9: Update User Search to Respect Discoverability

**Files:**
- Modify: `services/core-api/app/services/user.py`
- Modify: `services/core-api/app/schemas/user.py`
- Test: `services/core-api/tests/test_user_search.py`

**Step 1: Write failing tests**

```python
# tests/test_user_search.py
"""Tests for user search with discoverability."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile_settings import ProfileSettings
from app.models.user import User
from app.services import user as user_service


@pytest.mark.asyncio
class TestUserSearchDiscoverability:
    async def test_discoverable_user_appears_in_search(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user_2.id, discoverable=True)
        db_session.add(settings)
        await db_session.commit()

        results = await user_service.search_users(db_session, "Test User 2", test_user.id)
        assert len(results) == 1
        assert results[0].username == test_user_2.username

    async def test_non_discoverable_user_hidden_from_search(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user_2.id, discoverable=False)
        db_session.add(settings)
        await db_session.commit()

        results = await user_service.search_users(db_session, "Test User 2", test_user.id)
        # Non-discoverable users only appear if they share a legacy
        assert len(results) == 0
```

**Step 2: Run test to verify it fails**

```bash
cd services/core-api && uv run pytest tests/test_user_search.py -v
```

**Step 3: Update user service to respect discoverability**

Modify `services/core-api/app/services/user.py` to join with `profile_settings` and filter by discoverability (or shared legacy membership):

```python
async def search_users(
    db: AsyncSession,
    query: str,
    current_user_id: UUID,
    limit: int = 10,
) -> list[UserSearchResult]:
    """Search users by name, respecting discoverability settings."""
    if len(query) < 3:
        return []

    search_pattern = f"%{query}%"

    # Subquery: legacies the current user is a member of
    my_legacies = (
        select(LegacyMember.legacy_id)
        .where(LegacyMember.user_id == current_user_id)
        .scalar_subquery()
    )

    # Users who share a legacy with current user
    shared_legacy_users = (
        select(LegacyMember.user_id)
        .where(LegacyMember.legacy_id.in_(my_legacies))
        .scalar_subquery()
    )

    result = await db.execute(
        select(User)
        .outerjoin(ProfileSettings, ProfileSettings.user_id == User.id)
        .where(
            User.name.ilike(search_pattern),
            User.id != current_user_id,
            or_(
                ProfileSettings.discoverable == True,  # noqa: E712
                User.id.in_(shared_legacy_users),
            ),
        )
        .order_by(User.name)
        .limit(limit)
    )
    users = result.scalars().all()

    return [
        UserSearchResult(
            id=user.id,
            name=user.name,
            avatar_url=user.avatar_url,
            username=user.username,
        )
        for user in users
    ]
```

Also update `UserSearchResult` schema to include `username`:

```python
class UserSearchResult(BaseModel):
    id: UUID
    name: str
    avatar_url: str | None = None
    username: str | None = None
```

**Step 4: Run tests**

```bash
cd services/core-api && uv run pytest tests/test_user_search.py -v
```

**Step 5: Validate and commit**

```bash
cd services/core-api && just validate-backend
git add services/core-api/app/services/user.py services/core-api/app/schemas/user.py services/core-api/tests/test_user_search.py
git commit -m "feat(search): respect discoverability in user search"
```

---

## Phase 2: User-to-User Connections ✅

### Task 10: Connection and ConnectionRequest Models

**Files:**
- Create: `services/core-api/app/models/connection.py`
- Modify: `services/core-api/app/models/__init__.py`
- Test: `services/core-api/tests/test_connection_models.py`

**Step 1: Write failing tests**

Test connection creation with UUID ordering, and connection request creation with status transitions.

**Step 2: Implement models**

```python
# services/core-api/app/models/connection.py
"""Connection and ConnectionRequest models."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base


class Connection(Base):
    """Accepted user-to-user connection. user_a_id < user_b_id for consistency."""

    __tablename__ = "connections"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_a_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_b_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user_a: Mapped["User"] = relationship("User", foreign_keys=[user_a_id])  # type: ignore[name-defined]  # noqa: F821
    user_b: Mapped["User"] = relationship("User", foreign_keys=[user_b_id])  # type: ignore[name-defined]  # noqa: F821

    __table_args__ = (UniqueConstraint("user_a_id", "user_b_id", name="uq_connection_pair"),)


class ConnectionRequest(Base):
    """Request from one user to connect with another."""

    __tablename__ = "connection_requests"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    from_user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relationship_type: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending", index=True)
    declined_cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    from_user: Mapped["User"] = relationship("User", foreign_keys=[from_user_id])  # type: ignore[name-defined]  # noqa: F821
    to_user: Mapped["User"] = relationship("User", foreign_keys=[to_user_id])  # type: ignore[name-defined]  # noqa: F821
```

**Step 3: Run tests, validate, commit**

```bash
cd services/core-api && uv run pytest tests/test_connection_models.py -v && just validate-backend
git commit -m "feat(connections): add Connection and ConnectionRequest models"
```

---

### Task 11: Alembic Migration — Connections Tables

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_add_connections_tables.py`

Generate migration, add FK from `relationships.connection_id` → `connections.id`, run and verify.

```bash
cd services/core-api && uv run alembic revision --autogenerate -m "add connections tables"
```

Edit to also add the FK constraint on `relationships.connection_id`:

```python
op.create_foreign_key(
    "fk_relationship_connection",
    "relationships", "connections",
    ["connection_id"], ["id"],
    ondelete="CASCADE",
)
```

Run: `uv run alembic upgrade head`

Commit: `git commit -m "feat(db): add connections and connection_requests tables"`

---

### Task 12: Connection Request Service

**Files:**
- Create: `services/core-api/app/services/connection_request.py`
- Create: `services/core-api/app/schemas/connection.py`
- Test: `services/core-api/tests/test_connection_request_service.py`

Implement:
- `create_request(db, from_user_id, to_user_id, relationship_type, message)` — validates no existing pending/accepted/cooldown, enforces 20-request limit
- `accept_request(db, request_id, user_id)` — creates Connection row (ordered UUIDs), creates Relationship row, triggers notification
- `decline_request(db, request_id, user_id)` — sets cooldown, triggers notification
- `cancel_request(db, request_id, user_id)` — only cancels own outgoing
- `list_incoming(db, user_id)` and `list_outgoing(db, user_id)`

Follow TDD: write tests first for each scenario (happy path, rate limit, cooldown, self-request rejection), then implement.

Commit: `git commit -m "feat(connections): add connection request service"`

---

### Task 13: Connection Service (List, Remove, Relationship)

**Files:**
- Create: `services/core-api/app/services/connection.py`
- Test: `services/core-api/tests/test_connection_service.py`

Implement:
- `list_connections(db, user_id)` — returns accepted, non-removed connections
- `remove_connection(db, connection_id, user_id)` — soft-delete
- `get_relationship(db, connection_id, user_id)` — from relationships table
- `update_relationship(db, connection_id, user_id, data)` — upsert relationship

Commit: `git commit -m "feat(connections): add connection management service"`

---

### Task 14: Neptune Sync for Connections

**Files:**
- Modify: `services/core-api/app/services/connection_request.py` (add sync on accept)
- Modify: `services/core-api/app/services/connection.py` (add sync on remove)
- Test: `services/core-api/tests/test_connection_graph_sync.py`

On accept: upsert User nodes, create `CONNECTED_TO` edge.
On remove: delete `CONNECTED_TO` edge.
Follow existing best-effort async pattern with try/except logging.

Commit: `git commit -m "feat(graph): add Neptune sync for user connections"`

---

### Task 15: Connection Notifications

**Files:**
- Modify: `services/core-api/app/services/connection_request.py`
- Test: `services/core-api/tests/test_connection_notifications.py`

Add notification creation calls:
- On request: `connection_request_received` to target
- On accept: `connection_request_accepted` to requester
- On decline: `connection_request_declined` to requester (gentle message)

Uses existing `notification.create_notification()` service.

Commit: `git commit -m "feat(notifications): add connection event notifications"`

---

### Task 16: Connection API Routes

**Files:**
- Create: `services/core-api/app/routes/connection.py` (replace existing)
- Modify: `services/core-api/app/main.py`
- Test: `services/core-api/tests/test_connection_routes.py`

Routes:
- `POST /api/connections/requests`
- `GET /api/connections/requests/incoming`
- `GET /api/connections/requests/outgoing`
- `PATCH /api/connections/requests/{id}/accept`
- `PATCH /api/connections/requests/{id}/decline`
- `DELETE /api/connections/requests/{id}`
- `GET /api/connections`
- `DELETE /api/connections/{id}`
- `GET /api/connections/{id}/relationship`
- `PATCH /api/connections/{id}/relationship`

Replace existing connections router import in `main.py`.

Commit: `git commit -m "feat(connections): add connection API routes"`

---

### Task 17: Update Profile Service for Connection Awareness

**Files:**
- Modify: `services/core-api/app/services/profile.py`
- Test: `services/core-api/tests/test_profile_connections.py`

Update `get_profile_by_username` to query actual connection status when evaluating visibility (replace the `is_connected = is_self` placeholder with a real query against the `connections` table).

Commit: `git commit -m "feat(profiles): add connection-aware visibility filtering"`

---

## Phase 3: Legacy Access Requests ✅

### Task 18: LegacyAccessRequest Model and Migration

**Files:**
- Create: `services/core-api/app/models/legacy_access_request.py`
- Create: Alembic migration
- Modify: `services/core-api/app/models/__init__.py`
- Test: `services/core-api/tests/test_legacy_access_request_model.py`

Model fields per design doc. Partial unique index on `(user_id, legacy_id) WHERE status = 'pending'`.

Commit: `git commit -m "feat(access): add LegacyAccessRequest model and migration"`

---

### Task 19: Legacy Access Request Service

**Files:**
- Create: `services/core-api/app/services/legacy_access_request.py`
- Create: `services/core-api/app/schemas/legacy_access_request.py`
- Test: `services/core-api/tests/test_legacy_access_request_service.py`

Implement:
- `submit_request(db, user_id, legacy_id, requested_role, message)` — validates not already a member, no pending request, 10-request limit
- `list_pending(db, legacy_id, admin_user_id)` — admin only, includes connected members list
- `approve_request(db, request_id, admin_user_id, assigned_role)` — creates LegacyMember, notification
- `decline_request(db, request_id, admin_user_id)` — gentle notification
- `list_outgoing(db, user_id)` — user's pending requests
- `expire_old_requests(db)` — cron-callable, sets expired after 60 days

Connected members query: join `connections` with `legacy_members` to find legacy members connected to the requester.

Commit: `git commit -m "feat(access): add legacy access request service"`

---

### Task 20: Legacy Access Request Notifications

**Files:**
- Modify: `services/core-api/app/services/legacy_access_request.py`
- Test: `services/core-api/tests/test_legacy_access_notifications.py`

Add notifications:
- On submit: `legacy_access_request_received` to all admins/creators of the legacy
- On approve: `legacy_access_request_approved` to requester
- On decline: `legacy_access_request_declined` to requester

Commit: `git commit -m "feat(notifications): add legacy access request notifications"`

---

### Task 21: Legacy Access Request Routes

**Files:**
- Create: `services/core-api/app/routes/legacy_access_request.py`
- Modify: `services/core-api/app/main.py`
- Test: `services/core-api/tests/test_legacy_access_request_routes.py`

Routes:
- `POST /api/legacies/{id}/access-requests`
- `GET /api/legacies/{id}/access-requests` (admin only)
- `PATCH /api/legacies/{id}/access-requests/{id}/approve`
- `PATCH /api/legacies/{id}/access-requests/{id}/decline`
- `GET /api/access-requests/outgoing`

Commit: `git commit -m "feat(access): add legacy access request API routes"`

---

### Task 22: Enhanced Duplicate Detection in Legacy Lookup

**Files:**
- Modify: `services/core-api/app/services/legacy.py` (or wherever legacy creation/lookup lives)
- Test: `services/core-api/tests/test_legacy_duplicate_detection.py`

When a user is creating a legacy, the lookup should also surface legacies where the user's connections are members (only if those connections have visibility_legacies set to a tier the user can see). Return these as "connected member legacies" alongside regular duplicate matches.

Commit: `git commit -m "feat(legacies): enhance duplicate detection with connection awareness"`

---

## Phase 4: Frontend Implementation

Frontend tasks follow the backend — each task creates components, hooks, and pages that consume the APIs built above. Detailed frontend task breakdowns should be created once backend APIs are stable and can be tested against.

### Task 23: Frontend — Profile Page (`/u/{username}`)

**Files:**
- Create: `apps/web/src/features/profile/components/ProfilePage.tsx`
- Create: `apps/web/src/features/profile/hooks/useProfile.ts`
- Create: `apps/web/src/features/profile/api/profile.ts`
- Modify: `apps/web/src/routes/index.tsx` (add `/u/:username` route)

### Task 24: Frontend — Settings > Connections Tab

**Files:**
- Create: `apps/web/src/features/settings/components/ConnectionsSettings.tsx`
- Modify: `apps/web/src/features/settings/components/SettingsLayout.tsx` (add tab)
- Modify: `apps/web/src/routes/index.tsx` (add settings child route)

### Task 25: Frontend — Connections Page (Repurpose `/connections`)

**Files:**
- Rewrite: `apps/web/src/features/connections/` (replace existing placeholder)
- Create: `apps/web/src/features/connections/components/ConnectionsPage.tsx`
- Create: `apps/web/src/features/connections/components/ConnectionCard.tsx`
- Create: `apps/web/src/features/connections/components/RequestCard.tsx`
- Create: `apps/web/src/features/connections/hooks/useUserConnections.ts`
- Create: `apps/web/src/features/connections/api/userConnections.ts`

### Task 26: Frontend — ConnectButton and ConnectionRequestDialog

**Files:**
- Create: `apps/web/src/features/connections/components/ConnectButton.tsx`
- Create: `apps/web/src/features/connections/components/ConnectionRequestDialog.tsx`

### Task 27: Frontend — Legacy Access Request Components

**Files:**
- Create: `apps/web/src/features/legacy/components/RequestAccessButton.tsx`
- Create: `apps/web/src/features/legacy/components/LegacyAccessRequestDialog.tsx`
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx` (add request button)
- Modify: `apps/web/src/features/members/components/MemberDrawer.tsx` (add pending requests section)

### Task 28: Frontend — Enhanced Legacy Creation

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyCreation.tsx`
- Create: `apps/web/src/features/legacy/components/ConnectionLegacySuggestion.tsx`

### Task 29: Frontend — Notification Types and Search Wiring

**Files:**
- Modify: `apps/web/src/features/notifications/components/NotificationHistory.tsx`
- Modify: `apps/web/src/components/SearchBar.tsx` (wire to user search API)

### Task 30: Frontend — Update Member Profile Fields

**Files:**
- Modify member profile components to use new field names (`who_they_are_to_me` / `who_i_am_to_them` instead of `viewer_to_legacy` / `legacy_to_viewer`)

---

## Validation Checklist

Before marking each phase complete:

- [ ] All new tests pass: `cd services/core-api && uv run pytest -v`
- [ ] Backend validation: `just validate-backend` (ruff + mypy)
- [ ] Frontend lint: `cd apps/web && npm run lint`
- [ ] Frontend tests: `cd apps/web && npm run test`
- [ ] Migration runs cleanly: `uv run alembic upgrade head`
- [ ] Migration downgrades cleanly: `uv run alembic downgrade -1` then `upgrade head`
