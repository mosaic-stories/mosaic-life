# Connections Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename "Conversations" to "Connections" and build a full hub page with stats, chip rows, and three tabs (Personas, People, Activity).

**Architecture:** New `/api/connections/` backend router with stats, top-connections, and favorite-personas endpoints. New `connections-hub/` component directory mirroring the existing legacies-hub and stories-hub patterns. Reuses existing `QuickFilters`, `ActivityFeedItem`, and conversation list API.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + TypeScript + TanStack Query + Radix Tabs (frontend), Vitest + React Testing Library (frontend tests), pytest + httpx (backend tests).

---

### Task 1: Backend Schemas ✅

**Files:**
- Create: `services/core-api/app/schemas/connections.py`

**Step 1: Create the Pydantic schema file**

```python
"""Schemas for the Connections Hub endpoints."""

from uuid import UUID

from pydantic import BaseModel


class ConnectionsStatsResponse(BaseModel):
    """Stats for the Connections Hub header."""

    conversations_count: int
    people_count: int
    shared_legacies_count: int
    personas_used_count: int


class TopConnectionResponse(BaseModel):
    """A person the user shares legacies with."""

    user_id: UUID
    display_name: str
    avatar_url: str | None
    shared_legacy_count: int


class FavoritePersonaResponse(BaseModel):
    """A persona ranked by conversation count."""

    persona_id: str
    persona_name: str
    persona_icon: str
    conversation_count: int


class SharedLegacySummary(BaseModel):
    """A legacy shared between two users."""

    legacy_id: UUID
    legacy_name: str
    user_role: str
    connection_role: str


class PersonConnectionResponse(BaseModel):
    """A human connection with shared legacy details."""

    user_id: UUID
    display_name: str
    avatar_url: str | None
    shared_legacy_count: int
    shared_legacies: list[SharedLegacySummary]
    highest_shared_role: str


class PeopleCounts(BaseModel):
    """Filter counts for the People tab."""

    all: int
    co_creators: int
    collaborators: int


class PeopleResponse(BaseModel):
    """Response for the People tab endpoint."""

    items: list[PersonConnectionResponse]
    counts: PeopleCounts
```

**Step 2: Commit**

```bash
git add services/core-api/app/schemas/connections.py
git commit -m "feat(api): add Pydantic schemas for Connections Hub endpoints"
```

---

### Task 2: Backend Service Layer ✅

**Files:**
- Create: `services/core-api/app/services/connections.py`

**Step 1: Create the service file**

```python
"""Service layer for Connections Hub queries."""

import logging
from typing import Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.personas import get_persona
from app.models.ai import AIConversation
from app.models.legacy import Legacy, LegacyMember
from app.models.user import User

logger = logging.getLogger(__name__)


async def get_connections_stats(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, int]:
    """Get connection-specific stats for a user."""
    # Count total conversations
    conv_result = await db.execute(
        select(func.count(AIConversation.id)).where(
            AIConversation.user_id == user_id
        )
    )
    conversations_count = conv_result.scalar() or 0

    # Count distinct other users who share at least one legacy
    # Subquery: legacy_ids where current user is a member
    user_legacy_ids = (
        select(LegacyMember.legacy_id)
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .subquery()
    )
    people_result = await db.execute(
        select(func.count(func.distinct(LegacyMember.user_id))).where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
    )
    people_count = people_result.scalar() or 0

    # Count distinct legacies where user AND at least one other user are members
    shared_legacies_result = await db.execute(
        select(func.count(func.distinct(LegacyMember.legacy_id))).where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
    )
    shared_legacies_count = shared_legacies_result.scalar() or 0

    # Count distinct personas used
    personas_result = await db.execute(
        select(func.count(func.distinct(AIConversation.persona_id))).where(
            AIConversation.user_id == user_id
        )
    )
    personas_used_count = personas_result.scalar() or 0

    logger.info("connections.stats", extra={"user_id": str(user_id)})

    return {
        "conversations_count": conversations_count,
        "people_count": people_count,
        "shared_legacies_count": shared_legacies_count,
        "personas_used_count": personas_used_count,
    }


class TopConnectionItem:
    """Internal result type for top connections query."""

    def __init__(
        self,
        user_id: UUID,
        display_name: str,
        avatar_url: str | None,
        shared_legacy_count: int,
    ):
        self.user_id = user_id
        self.display_name = display_name
        self.avatar_url = avatar_url
        self.shared_legacy_count = shared_legacy_count


async def get_top_connections(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 6,
) -> list[dict[str, object]]:
    """Get people the user shares the most legacies with."""
    # Subquery: legacy_ids where current user is a member
    user_legacy_ids = (
        select(LegacyMember.legacy_id)
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .subquery()
    )

    # Count shared legacies per other user
    result = await db.execute(
        select(
            LegacyMember.user_id,
            func.count(func.distinct(LegacyMember.legacy_id)).label(
                "shared_count"
            ),
        )
        .where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
        .group_by(LegacyMember.user_id)
        .order_by(func.count(func.distinct(LegacyMember.legacy_id)).desc())
        .limit(limit)
    )
    rows = result.all()

    if not rows:
        return []

    # Fetch user details
    other_user_ids = [row[0] for row in rows]
    users_result = await db.execute(
        select(User).where(User.id.in_(other_user_ids))
    )
    users_by_id = {u.id: u for u in users_result.scalars().all()}

    items: list[dict[str, object]] = []
    for other_user_id, shared_count in rows:
        user = users_by_id.get(other_user_id)
        if user:
            items.append(
                {
                    "user_id": user.id,
                    "display_name": user.name,
                    "avatar_url": user.avatar_url,
                    "shared_legacy_count": shared_count,
                }
            )

    return items


async def get_favorite_personas(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 4,
) -> list[dict[str, object]]:
    """Get personas ranked by conversation count for the user."""
    result = await db.execute(
        select(
            AIConversation.persona_id,
            func.count(AIConversation.id).label("conv_count"),
        )
        .where(AIConversation.user_id == user_id)
        .group_by(AIConversation.persona_id)
        .order_by(func.count(AIConversation.id).desc())
        .limit(limit)
    )
    rows = result.all()

    items: list[dict[str, object]] = []
    for persona_id, conv_count in rows:
        persona = get_persona(persona_id)
        if persona:
            items.append(
                {
                    "persona_id": persona_id,
                    "persona_name": persona["name"],
                    "persona_icon": persona["icon"],
                    "conversation_count": conv_count,
                }
            )

    return items


async def get_people(
    db: AsyncSession,
    user_id: UUID,
    filter_key: Literal["all", "co_creators", "collaborators"] = "all",
) -> dict[str, object]:
    """Get human connections with shared legacy details and filter counts."""
    # Subquery: legacy_ids where current user is a member
    user_legacy_ids = (
        select(LegacyMember.legacy_id)
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .subquery()
    )

    # Get all other members on shared legacies with their roles
    result = await db.execute(
        select(
            LegacyMember.user_id,
            LegacyMember.legacy_id,
            LegacyMember.role,
        ).where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
    )
    other_member_rows = result.all()

    if not other_member_rows:
        empty_counts = {"all": 0, "co_creators": 0, "collaborators": 0}
        return {"items": [], "counts": empty_counts}

    # Get current user's roles on their legacies
    user_roles_result = await db.execute(
        select(LegacyMember.legacy_id, LegacyMember.role).where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    user_roles_by_legacy = {
        row[0]: row[1] for row in user_roles_result.all()
    }

    # Fetch user and legacy details
    other_user_ids = list({row[0] for row in other_member_rows})
    legacy_ids = list({row[1] for row in other_member_rows})

    users_result = await db.execute(
        select(User).where(User.id.in_(other_user_ids))
    )
    users_by_id = {u.id: u for u in users_result.scalars().all()}

    legacies_result = await db.execute(
        select(Legacy).where(Legacy.id.in_(legacy_ids))
    )
    legacies_by_id = {
        leg.id: leg for leg in legacies_result.scalars().all()
    }

    # Build per-user connection data
    role_levels = {"creator": 4, "admin": 3, "advocate": 2, "admirer": 1}
    connections: dict[UUID, dict[str, object]] = {}

    for other_user_id, legacy_id, role in other_member_rows:
        user = users_by_id.get(other_user_id)
        legacy = legacies_by_id.get(legacy_id)
        if not user or not legacy:
            continue

        if other_user_id not in connections:
            connections[other_user_id] = {
                "user_id": user.id,
                "display_name": user.name,
                "avatar_url": user.avatar_url,
                "shared_legacy_count": 0,
                "shared_legacies": [],
                "highest_shared_role": "admirer",
                "_highest_level": 0,
                "_is_co_creator": False,
            }

        conn = connections[other_user_id]
        shared_legacies = conn["shared_legacies"]
        assert isinstance(shared_legacies, list)

        user_role = user_roles_by_legacy.get(legacy_id, "admirer")
        shared_legacies.append(
            {
                "legacy_id": legacy.id,
                "legacy_name": legacy.name,
                "user_role": user_role,
                "connection_role": role,
            }
        )
        conn["shared_legacy_count"] = len(shared_legacies)

        level = role_levels.get(role, 0)
        highest_level = conn["_highest_level"]
        assert isinstance(highest_level, int)
        if level > highest_level:
            conn["_highest_level"] = level
            conn["highest_shared_role"] = role

        if role in ("creator", "admin"):
            conn["_is_co_creator"] = True

    # Compute counts
    all_connections = list(connections.values())
    co_creators = [c for c in all_connections if c["_is_co_creator"]]
    collaborators = [c for c in all_connections if not c["_is_co_creator"]]

    counts = {
        "all": len(all_connections),
        "co_creators": len(co_creators),
        "collaborators": len(collaborators),
    }

    # Apply filter
    if filter_key == "co_creators":
        filtered = co_creators
    elif filter_key == "collaborators":
        filtered = collaborators
    else:
        filtered = all_connections

    # Sort by shared_legacy_count descending
    filtered.sort(
        key=lambda c: (
            c["shared_legacy_count"]
            if isinstance(c["shared_legacy_count"], int)
            else 0
        ),
        reverse=True,
    )

    # Clean internal keys
    items = []
    for conn in filtered:
        items.append(
            {
                "user_id": conn["user_id"],
                "display_name": conn["display_name"],
                "avatar_url": conn["avatar_url"],
                "shared_legacy_count": conn["shared_legacy_count"],
                "shared_legacies": conn["shared_legacies"],
                "highest_shared_role": conn["highest_shared_role"],
            }
        )

    return {"items": items, "counts": counts}
```

**Step 2: Commit**

```bash
git add services/core-api/app/services/connections.py
git commit -m "feat(api): add connections service with stats, top-connections, favorite-personas, and people queries"
```

---

### Task 3: Backend Routes ✅

**Files:**
- Create: `services/core-api/app/routes/connections.py`
- Modify: `services/core-api/app/main.py`

**Step 1: Create the routes file**

```python
"""API routes for Connections Hub."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.connections import (
    ConnectionsStatsResponse,
    FavoritePersonaResponse,
    PeopleCounts,
    PeopleResponse,
    PersonConnectionResponse,
    SharedLegacySummary,
    TopConnectionResponse,
)
from ..services import connections as connections_service

router = APIRouter(prefix="/api/connections", tags=["connections"])
logger = logging.getLogger(__name__)


@router.get(
    "/stats",
    response_model=ConnectionsStatsResponse,
    summary="Get connections stats",
    description="Get connection-specific statistics for the authenticated user.",
)
async def get_connections_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConnectionsStatsResponse:
    """Get connections stats for the current user."""
    session = require_auth(request)
    result = await connections_service.get_connections_stats(
        db=db, user_id=session.user_id
    )
    return ConnectionsStatsResponse(**result)


@router.get(
    "/top-connections",
    response_model=list[TopConnectionResponse],
    summary="Get top connections",
    description="Get people the user shares the most legacies with.",
)
async def get_top_connections(
    request: Request,
    limit: int = Query(default=6, ge=1, le=20, description="Max results"),
    db: AsyncSession = Depends(get_db),
) -> list[TopConnectionResponse]:
    """Get top connections for the current user."""
    session = require_auth(request)
    items = await connections_service.get_top_connections(
        db=db, user_id=session.user_id, limit=limit
    )
    return [TopConnectionResponse(**item) for item in items]


@router.get(
    "/favorite-personas",
    response_model=list[FavoritePersonaResponse],
    summary="Get favorite personas",
    description="Get personas ranked by conversation count.",
)
async def get_favorite_personas(
    request: Request,
    limit: int = Query(default=4, ge=1, le=10, description="Max results"),
    db: AsyncSession = Depends(get_db),
) -> list[FavoritePersonaResponse]:
    """Get favorite personas for the current user."""
    session = require_auth(request)
    items = await connections_service.get_favorite_personas(
        db=db, user_id=session.user_id, limit=limit
    )
    return [FavoritePersonaResponse(**item) for item in items]


@router.get(
    "/people",
    response_model=PeopleResponse,
    summary="Get people connections",
    description="Get the user's human connections with shared legacy details.",
)
async def get_people(
    request: Request,
    filter: Literal["all", "co_creators", "collaborators"] = Query(
        default="all", description="Filter connections"
    ),
    db: AsyncSession = Depends(get_db),
) -> PeopleResponse:
    """Get people connections for the current user."""
    session = require_auth(request)
    result = await connections_service.get_people(
        db=db, user_id=session.user_id, filter_key=filter
    )
    items = [
        PersonConnectionResponse(
            shared_legacies=[
                SharedLegacySummary(**sl) for sl in item["shared_legacies"]
            ],
            **{k: v for k, v in item.items() if k != "shared_legacies"},
        )
        for item in result["items"]
    ]
    return PeopleResponse(
        items=items,
        counts=PeopleCounts(**result["counts"]),
    )
```

**Step 2: Register the router in main.py**

Add to `services/core-api/app/main.py` — after the existing activity router imports and registrations:

Import line (add after line 39):
```python
from .routes.connections import router as connections_router
```

Registration line (add after line 136):
```python
app.include_router(connections_router)
```

**Step 3: Run backend validation**

Run: `cd services/core-api && just validate-backend`
Expected: All checks pass (ruff + mypy)

**Step 4: Commit**

```bash
git add services/core-api/app/routes/connections.py services/core-api/app/main.py
git commit -m "feat(api): add connections router with stats, top-connections, favorite-personas, and people endpoints"
```

---

### Task 4: Backend Tests ✅

**Files:**
- Create: `services/core-api/tests/test_connections.py`

**Step 1: Write the test file**

```python
"""Tests for Connections Hub API endpoints."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.legacy import Legacy, LegacyMember
from app.models.person import Person
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestConnectionsStats:
    """Tests for GET /api/connections/stats."""

    @pytest.mark.asyncio
    async def test_stats_returns_all_fields(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Stats response includes all four fields."""
        response = await client.get(
            "/api/connections/stats", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "conversations_count" in data
        assert "people_count" in data
        assert "shared_legacies_count" in data
        assert "personas_used_count" in data

    @pytest.mark.asyncio
    async def test_stats_values_are_integers(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """All stats values are non-negative integers."""
        response = await client.get(
            "/api/connections/stats", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        for key, value in data.items():
            assert isinstance(value, int), f"{key} should be int"
            assert value >= 0, f"{key} should be non-negative"

    @pytest.mark.asyncio
    async def test_stats_requires_auth(self, client: AsyncClient):
        """Stats endpoint requires authentication."""
        response = await client.get("/api/connections/stats")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_stats_counts_conversations(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
        db_session: AsyncSession,
    ):
        """Stats correctly counts user conversations."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test conversation",
        )
        db_session.add(conv)
        await db_session.commit()

        response = await client.get(
            "/api/connections/stats", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["conversations_count"] >= 1
        assert data["personas_used_count"] >= 1


class TestTopConnections:
    """Tests for GET /api/connections/top-connections."""

    @pytest.mark.asyncio
    async def test_returns_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Returns a list (possibly empty)."""
        response = await client.get(
            "/api/connections/top-connections", headers=auth_headers
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        """Requires authentication."""
        response = await client.get("/api/connections/top-connections")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_connections_with_shared_legacies(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
        test_user_2: User,
        db_session: AsyncSession,
    ):
        """Returns connections when users share legacies."""
        # Add test_user_2 as a member of test_legacy
        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.get(
            "/api/connections/top-connections", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["display_name"] == "Test User 2"
        assert data[0]["shared_legacy_count"] >= 1


class TestFavoritePersonas:
    """Tests for GET /api/connections/favorite-personas."""

    @pytest.mark.asyncio
    async def test_returns_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Returns a list (possibly empty)."""
        response = await client.get(
            "/api/connections/favorite-personas", headers=auth_headers
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        """Requires authentication."""
        response = await client.get("/api/connections/favorite-personas")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_personas_with_conversations(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        db_session: AsyncSession,
    ):
        """Returns personas when user has conversations."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test",
        )
        db_session.add(conv)
        await db_session.commit()

        response = await client.get(
            "/api/connections/favorite-personas", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["persona_id"] == "biographer"
        assert data[0]["conversation_count"] >= 1


class TestPeople:
    """Tests for GET /api/connections/people."""

    @pytest.mark.asyncio
    async def test_returns_response_shape(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Returns items and counts."""
        response = await client.get(
            "/api/connections/people", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "counts" in data
        assert "all" in data["counts"]
        assert "co_creators" in data["counts"]
        assert "collaborators" in data["counts"]

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        """Requires authentication."""
        response = await client.get("/api/connections/people")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_people_with_shared_legacies(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
        test_user_2: User,
        db_session: AsyncSession,
    ):
        """Returns people when users share legacies."""
        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.get(
            "/api/connections/people", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert data["items"][0]["display_name"] == "Test User 2"
        assert data["items"][0]["shared_legacy_count"] >= 1
        assert len(data["items"][0]["shared_legacies"]) >= 1

    @pytest.mark.asyncio
    async def test_filter_co_creators(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
        test_user_2: User,
        db_session: AsyncSession,
    ):
        """Filters to co-creators (admin/creator role)."""
        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            role="admin",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.get(
            "/api/connections/people?filter=co_creators",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["counts"]["co_creators"] >= 1
```

**Step 2: Run the tests**

Run: `cd services/core-api && uv run pytest tests/test_connections.py -v`
Expected: All tests PASS

**Step 3: Run full backend validation**

Run: `cd services/core-api && just validate-backend`
Expected: All checks pass

**Step 4: Commit**

```bash
git add services/core-api/tests/test_connections.py
git commit -m "test(api): add tests for Connections Hub endpoints"
```

---

### Task 5: Frontend API Client & Hooks ✅

**Files:**
- Create: `apps/web/src/features/connections/api/connections.ts`
- Create: `apps/web/src/features/connections/hooks/useConnections.ts`

**Step 1: Create the API client**

```typescript
// Connections Hub API functions
import { apiGet } from '@/lib/api/client';

export interface ConnectionsStatsResponse {
  conversations_count: number;
  people_count: number;
  shared_legacies_count: number;
  personas_used_count: number;
}

export interface TopConnection {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  shared_legacy_count: number;
}

export interface FavoritePersona {
  persona_id: string;
  persona_name: string;
  persona_icon: string;
  conversation_count: number;
}

export interface SharedLegacySummary {
  legacy_id: string;
  legacy_name: string;
  user_role: string;
  connection_role: string;
}

export interface PersonConnection {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  shared_legacy_count: number;
  shared_legacies: SharedLegacySummary[];
  highest_shared_role: string;
}

export interface PeopleCounts {
  all: number;
  co_creators: number;
  collaborators: number;
}

export interface PeopleResponse {
  items: PersonConnection[];
  counts: PeopleCounts;
}

export type PeopleFilter = 'all' | 'co_creators' | 'collaborators';

export async function getConnectionsStats(): Promise<ConnectionsStatsResponse> {
  return apiGet<ConnectionsStatsResponse>('/api/connections/stats');
}

export async function getTopConnections(limit: number = 6): Promise<TopConnection[]> {
  return apiGet<TopConnection[]>(`/api/connections/top-connections?limit=${limit}`);
}

export async function getFavoritePersonas(limit: number = 4): Promise<FavoritePersona[]> {
  return apiGet<FavoritePersona[]>(`/api/connections/favorite-personas?limit=${limit}`);
}

export async function getPeople(filter: PeopleFilter = 'all'): Promise<PeopleResponse> {
  return apiGet<PeopleResponse>(`/api/connections/people?filter=${filter}`);
}
```

**Step 2: Create the hooks file**

```typescript
// TanStack Query hooks for Connections Hub
import { useQuery } from '@tanstack/react-query';
import {
  getConnectionsStats,
  getTopConnections,
  getFavoritePersonas,
  getPeople,
  type PeopleFilter,
} from '@/features/connections/api/connections';

export const connectionKeys = {
  all: ['connections'] as const,
  stats: () => [...connectionKeys.all, 'stats'] as const,
  topConnections: (limit: number) => [...connectionKeys.all, 'top-connections', limit] as const,
  favoritePersonas: (limit: number) => [...connectionKeys.all, 'favorite-personas', limit] as const,
  people: (filter: string) => [...connectionKeys.all, 'people', filter] as const,
};

export function useConnectionsStats() {
  return useQuery({
    queryKey: connectionKeys.stats(),
    queryFn: getConnectionsStats,
  });
}

export function useTopConnections(limit: number = 6) {
  return useQuery({
    queryKey: connectionKeys.topConnections(limit),
    queryFn: () => getTopConnections(limit),
  });
}

export function useFavoritePersonas(limit: number = 4) {
  return useQuery({
    queryKey: connectionKeys.favoritePersonas(limit),
    queryFn: () => getFavoritePersonas(limit),
  });
}

export function usePeople(filter: PeopleFilter = 'all') {
  return useQuery({
    queryKey: connectionKeys.people(filter),
    queryFn: () => getPeople(filter),
  });
}
```

**Step 3: Commit**

```bash
git add apps/web/src/features/connections/
git commit -m "feat(web): add API client and TanStack Query hooks for Connections Hub"
```

---

### Task 6: Rename Navigation (Conversations → Connections) ✅

**Files:**
- Modify: `apps/web/src/lib/navigation.ts`
- Modify: `apps/web/src/routes/index.tsx`
- Rename: `apps/web/src/pages/ConversationsPage.tsx` → `apps/web/src/pages/ConnectionsPage.tsx`
- Modify: `apps/web/src/pages/PlaceholderPages.test.tsx`
- Modify: `apps/web/src/components/header/NavLinks.test.tsx`
- Modify: `apps/web/src/components/header/AppHeader.test.tsx`
- Modify: `apps/web/src/components/navigation/BottomTabBar.test.tsx`

**Step 1: Update navigation.ts**

In `apps/web/src/lib/navigation.ts`:

Change the import to use `Link2` instead of `MessageCircle`:
```typescript
import { Home, Landmark, BookOpen, Link2, Users } from 'lucide-react';
```

Change the nav item:
```typescript
  { label: 'Connections', path: '/connections', icon: Link2 },
```

**Step 2: Rename and update the page file**

Rename `ConversationsPage.tsx` to `ConnectionsPage.tsx` and keep it as a temporary placeholder (will be rewritten in Task 8):

```typescript
import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '@/components/Footer';

export default function ConnectionsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <Link2 className="size-16 mx-auto text-neutral-300" />
          <h1 className="text-2xl font-bold text-neutral-900">Connections</h1>
          <p className="text-neutral-600 max-w-md">
            Your personas, people, and conversations.
          </p>
          <Link
            to="/"
            className="inline-block text-sm text-theme-primary hover:underline"
          >
            Go to Home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
```

**Step 3: Update routes/index.tsx**

Change the lazy import:
```typescript
const ConnectionsPage = lazy(() => import('@/pages/ConnectionsPage'));
```

Change the route path and element:
```typescript
      {
        path: 'connections',
        element: (
          <ProtectedRoute>
            <LazyPage><ConnectionsPage /></LazyPage>
          </ProtectedRoute>
        ),
      },
```

**Step 4: Update all test files**

In `PlaceholderPages.test.tsx` — update import, describe block, and assertions to reference `ConnectionsPage` and "Connections".

In `NavLinks.test.tsx` — change `conversations` references to `connections`.

In `AppHeader.test.tsx` — change `conversations` references to `connections`.

In `BottomTabBar.test.tsx` — change `conversations` references to `connections`.

**Step 5: Run tests**

Run: `cd apps/web && npm run test -- --run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add apps/web/src/lib/navigation.ts apps/web/src/routes/index.tsx apps/web/src/pages/ConnectionsPage.tsx apps/web/src/pages/PlaceholderPages.test.tsx apps/web/src/components/header/NavLinks.test.tsx apps/web/src/components/header/AppHeader.test.tsx apps/web/src/components/navigation/BottomTabBar.test.tsx
git rm apps/web/src/pages/ConversationsPage.tsx
git commit -m "feat(web): rename Conversations to Connections in navigation and routing"
```

---

### Task 7: ConnectionsStatsBar + FavoritePersonasChips + TopConnectionsChips Components ✅

**Files:**
- Create: `apps/web/src/components/connections-hub/ConnectionsStatsBar.tsx`
- Create: `apps/web/src/components/connections-hub/ConnectionsStatsBar.test.tsx`
- Create: `apps/web/src/components/connections-hub/TopConnectionsChips.tsx`
- Create: `apps/web/src/components/connections-hub/TopConnectionsChips.test.tsx`
- Create: `apps/web/src/components/connections-hub/FavoritePersonasChips.tsx`
- Create: `apps/web/src/components/connections-hub/FavoritePersonasChips.test.tsx`

**Step 1: Create ConnectionsStatsBar**

Follow the exact pattern from `StoryStatsBar.tsx`:

```tsx
import { MessageCircle, Users, Link, Sparkles, Loader2 } from 'lucide-react';
import { useConnectionsStats } from '@/features/connections/hooks/useConnections';

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

export default function ConnectionsStatsBar() {
  const { data: stats, isLoading } = useConnectionsStats();

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
      <StatItem icon={<MessageCircle className="size-5" />} count={stats.conversations_count} label="Conversations" />
      <StatItem icon={<Users className="size-5" />} count={stats.people_count} label="People" />
      <StatItem icon={<Link className="size-5" />} count={stats.shared_legacies_count} label="Shared Legacies" />
      <StatItem icon={<Sparkles className="size-5" />} count={stats.personas_used_count} label="Personas Used" />
    </div>
  );
}
```

**Step 2: Create ConnectionsStatsBar tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConnectionsStatsBar from './ConnectionsStatsBar';

vi.mock('@/features/connections/hooks/useConnections', () => ({
  useConnectionsStats: () => ({
    data: {
      conversations_count: 42,
      people_count: 7,
      shared_legacies_count: 5,
      personas_used_count: 2,
    },
    isLoading: false,
  }),
}));

function renderStatsBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectionsStatsBar />
    </QueryClientProvider>,
  );
}

describe('ConnectionsStatsBar', () => {
  it('renders all four stat items', () => {
    renderStatsBar();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Shared Legacies')).toBeInTheDocument();
    expect(screen.getByText('Personas Used')).toBeInTheDocument();
  });

  it('displays the correct counts', () => {
    renderStatsBar();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
```

**Step 3: Create TopConnectionsChips**

Follow the exact pattern from `TopLegaciesChips.tsx`:

```tsx
import { User } from 'lucide-react';
import { useTopConnections } from '@/features/connections/hooks/useConnections';

export default function TopConnectionsChips() {
  const { data, isLoading } = useTopConnections(6);

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-500">Top Connections</h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((item) => (
          <div
            key={item.user_id}
            className="flex flex-col items-center gap-1.5 min-w-0"
          >
            <div className="relative">
              <div className="size-12 rounded-full overflow-hidden bg-neutral-100 ring-2 ring-transparent">
                {item.avatar_url ? (
                  <img
                    src={item.avatar_url}
                    alt={item.display_name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <User className="size-5 text-neutral-300" />
                  </div>
                )}
              </div>
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-theme-primary text-white text-xs flex items-center justify-center font-medium">
                {item.shared_legacy_count}
              </span>
            </div>
            <span className="text-xs text-neutral-600 truncate max-w-[72px]">
              {item.display_name.split(' ')[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Create TopConnectionsChips tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TopConnectionsChips from './TopConnectionsChips';

vi.mock('@/features/connections/hooks/useConnections', () => ({
  useTopConnections: () => ({
    data: [
      { user_id: '1', display_name: 'Sarah Chen', avatar_url: null, shared_legacy_count: 3 },
      { user_id: '2', display_name: 'James Torres', avatar_url: null, shared_legacy_count: 2 },
    ],
    isLoading: false,
  }),
}));

function renderChips() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TopConnectionsChips />
    </QueryClientProvider>,
  );
}

describe('TopConnectionsChips', () => {
  it('renders section title', () => {
    renderChips();
    expect(screen.getByText('Top Connections')).toBeInTheDocument();
  });

  it('renders chips with first names', () => {
    renderChips();
    expect(screen.getByText('Sarah')).toBeInTheDocument();
    expect(screen.getByText('James')).toBeInTheDocument();
  });

  it('renders shared legacy count badges', () => {
    renderChips();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
```

**Step 5: Create FavoritePersonasChips**

```tsx
import { BookOpen, Heart, Briefcase, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFavoritePersonas } from '@/features/connections/hooks/useConnections';

const PERSONA_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Heart,
  Briefcase,
  Users,
};

interface FavoritePersonasChipsProps {
  onPersonaClick?: (personaId: string) => void;
}

export default function FavoritePersonasChips({ onPersonaClick }: FavoritePersonasChipsProps) {
  const { data, isLoading } = useFavoritePersonas(4);

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-500">Favorite Personas</h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((item) => {
          const Icon = PERSONA_ICONS[item.persona_icon] ?? BookOpen;
          return (
            <button
              key={item.persona_id}
              onClick={() => onPersonaClick?.(item.persona_id)}
              className="flex flex-col items-center gap-1.5 min-w-0 group"
            >
              <div className="relative">
                <div className="size-12 rounded-full bg-neutral-100 flex items-center justify-center ring-2 ring-transparent group-hover:ring-theme-primary transition-all">
                  <Icon className="size-5 text-neutral-500" />
                </div>
                <span className="absolute -top-1 -right-1 size-5 rounded-full bg-theme-primary text-white text-xs flex items-center justify-center font-medium">
                  {item.conversation_count}
                </span>
              </div>
              <span className="text-xs text-neutral-600 truncate max-w-[72px]">
                {item.persona_name.replace('The ', '')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 6: Create FavoritePersonasChips tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FavoritePersonasChips from './FavoritePersonasChips';

vi.mock('@/features/connections/hooks/useConnections', () => ({
  useFavoritePersonas: () => ({
    data: [
      { persona_id: 'biographer', persona_name: 'The Biographer', persona_icon: 'BookOpen', conversation_count: 28 },
      { persona_id: 'friend', persona_name: 'The Friend', persona_icon: 'Heart', conversation_count: 14 },
    ],
    isLoading: false,
  }),
}));

function renderChips(onPersonaClick?: (id: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FavoritePersonasChips onPersonaClick={onPersonaClick} />
    </QueryClientProvider>,
  );
}

describe('FavoritePersonasChips', () => {
  it('renders section title', () => {
    renderChips();
    expect(screen.getByText('Favorite Personas')).toBeInTheDocument();
  });

  it('renders persona names without "The" prefix', () => {
    renderChips();
    expect(screen.getByText('Biographer')).toBeInTheDocument();
    expect(screen.getByText('Friend')).toBeInTheDocument();
  });

  it('renders conversation count badges', () => {
    renderChips();
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('calls onPersonaClick when clicked', async () => {
    const onClick = vi.fn();
    renderChips(onClick);
    await userEvent.click(screen.getByText('Biographer'));
    expect(onClick).toHaveBeenCalledWith('biographer');
  });
});
```

**Step 7: Run tests**

Run: `cd apps/web && npm run test -- --run`
Expected: All new tests pass

**Step 8: Commit**

```bash
git add apps/web/src/components/connections-hub/
git commit -m "feat(web): add ConnectionsStatsBar, TopConnectionsChips, and FavoritePersonasChips components"
```

---

### Task 8: ConversationCard + PersonCard Components ✅

**Files:**
- Create: `apps/web/src/components/connections-hub/ConversationCard.tsx`
- Create: `apps/web/src/components/connections-hub/ConversationCard.test.tsx`
- Create: `apps/web/src/components/connections-hub/PersonCard.tsx`
- Create: `apps/web/src/components/connections-hub/PersonCard.test.tsx`

**Step 1: Create ConversationCard**

```tsx
import { BookOpen, Heart, Briefcase, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ConversationSummary } from '@/features/ai-chat/api/ai';

const PERSONA_ICONS: Record<string, LucideIcon> = {
  biographer: BookOpen,
  friend: Heart,
  colleague: Briefcase,
  family: Users,
};

const PERSONA_NAMES: Record<string, string> = {
  biographer: 'The Biographer',
  friend: 'The Friend',
  colleague: 'The Colleague',
  family: 'The Family Member',
};

interface ConversationCardProps {
  conversation: ConversationSummary;
}

export default function ConversationCard({ conversation }: ConversationCardProps) {
  const Icon = PERSONA_ICONS[conversation.persona_id] ?? BookOpen;
  const personaName = PERSONA_NAMES[conversation.persona_id] ?? conversation.persona_id;
  const legacyName = conversation.legacies[0]?.legacy_name ?? 'Unknown Legacy';
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })
    : formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true });

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
          <Icon className="size-5 text-neutral-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900">{personaName}</p>
          <p className="text-xs text-neutral-500 truncate">{legacyName}</p>
        </div>
        <span className="text-xs text-neutral-400 flex-shrink-0">{timeAgo}</span>
      </div>

      {conversation.title && (
        <p className="text-sm text-neutral-700 line-clamp-2">{conversation.title}</p>
      )}

      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span>{conversation.message_count} messages</span>
      </div>
    </div>
  );
}
```

**Step 2: Create ConversationCard tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConversationCard from './ConversationCard';
import type { ConversationSummary } from '@/features/ai-chat/api/ai';

const mockConversation: ConversationSummary = {
  id: '1',
  persona_id: 'biographer',
  title: 'Discussing childhood memories',
  legacies: [
    { legacy_id: 'leg1', legacy_name: 'Margaret Chen', role: 'primary', position: 0 },
  ],
  message_count: 12,
  last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

describe('ConversationCard', () => {
  it('renders persona name', () => {
    render(<ConversationCard conversation={mockConversation} />);
    expect(screen.getByText('The Biographer')).toBeInTheDocument();
  });

  it('renders legacy name', () => {
    render(<ConversationCard conversation={mockConversation} />);
    expect(screen.getByText('Margaret Chen')).toBeInTheDocument();
  });

  it('renders message count', () => {
    render(<ConversationCard conversation={mockConversation} />);
    expect(screen.getByText('12 messages')).toBeInTheDocument();
  });

  it('renders conversation title', () => {
    render(<ConversationCard conversation={mockConversation} />);
    expect(screen.getByText('Discussing childhood memories')).toBeInTheDocument();
  });
});
```

**Step 3: Create PersonCard**

```tsx
import { User, Landmark } from 'lucide-react';
import type { PersonConnection } from '@/features/connections/api/connections';

interface PersonCardProps {
  person: PersonConnection;
}

export default function PersonCard({ person }: PersonCardProps) {
  const displayLegacies = person.shared_legacies.slice(0, 3);
  const overflow = person.shared_legacies.length - displayLegacies.length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full overflow-hidden bg-neutral-100 flex-shrink-0">
          {person.avatar_url ? (
            <img
              src={person.avatar_url}
              alt={person.display_name}
              className="size-full object-cover"
            />
          ) : (
            <div className="size-full flex items-center justify-center">
              <User className="size-5 text-neutral-300" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900">{person.display_name}</p>
          <p className="text-xs text-neutral-500">
            {person.shared_legacy_count} shared {person.shared_legacy_count === 1 ? 'legacy' : 'legacies'}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-xs font-medium text-neutral-600 capitalize">
          {person.highest_shared_role}
        </span>
      </div>

      <div className="space-y-1">
        {displayLegacies.map((legacy) => (
          <div key={legacy.legacy_id} className="flex items-center gap-2 text-xs text-neutral-500">
            <Landmark className="size-3 flex-shrink-0" />
            <span className="truncate">{legacy.legacy_name}</span>
          </div>
        ))}
        {overflow > 0 && (
          <p className="text-xs text-neutral-400 pl-5">+{overflow} more</p>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Create PersonCard tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PersonCard from './PersonCard';
import type { PersonConnection } from '@/features/connections/api/connections';

const mockPerson: PersonConnection = {
  user_id: '1',
  display_name: 'Sarah Chen',
  avatar_url: null,
  shared_legacy_count: 2,
  shared_legacies: [
    { legacy_id: 'l1', legacy_name: 'Margaret Chen', user_role: 'admin', connection_role: 'advocate' },
    { legacy_id: 'l2', legacy_name: 'James Torres', user_role: 'creator', connection_role: 'admirer' },
  ],
  highest_shared_role: 'advocate',
};

describe('PersonCard', () => {
  it('renders display name', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
  });

  it('renders shared legacy count', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('2 shared legacies')).toBeInTheDocument();
  });

  it('renders legacy names', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('Margaret Chen')).toBeInTheDocument();
    expect(screen.getByText('James Torres')).toBeInTheDocument();
  });

  it('renders role badge', () => {
    render(<PersonCard person={mockPerson} />);
    expect(screen.getByText('advocate')).toBeInTheDocument();
  });

  it('shows overflow count for many legacies', () => {
    const manyLegacies: PersonConnection = {
      ...mockPerson,
      shared_legacy_count: 5,
      shared_legacies: [
        { legacy_id: 'l1', legacy_name: 'Legacy 1', user_role: 'admin', connection_role: 'advocate' },
        { legacy_id: 'l2', legacy_name: 'Legacy 2', user_role: 'admin', connection_role: 'advocate' },
        { legacy_id: 'l3', legacy_name: 'Legacy 3', user_role: 'admin', connection_role: 'advocate' },
        { legacy_id: 'l4', legacy_name: 'Legacy 4', user_role: 'admin', connection_role: 'advocate' },
        { legacy_id: 'l5', legacy_name: 'Legacy 5', user_role: 'admin', connection_role: 'advocate' },
      ],
    };
    render(<PersonCard person={manyLegacies} />);
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
```

**Step 5: Run tests**

Run: `cd apps/web && npm run test -- --run`
Expected: All new tests pass

**Step 6: Commit**

```bash
git add apps/web/src/components/connections-hub/ConversationCard.tsx apps/web/src/components/connections-hub/ConversationCard.test.tsx apps/web/src/components/connections-hub/PersonCard.tsx apps/web/src/components/connections-hub/PersonCard.test.tsx
git commit -m "feat(web): add ConversationCard and PersonCard components for Connections Hub"
```

---

### Task 9: Tab Content Components ✅

**Files:**
- Create: `apps/web/src/components/connections-hub/PersonasTabContent.tsx`
- Create: `apps/web/src/components/connections-hub/PeopleTabContent.tsx`
- Create: `apps/web/src/components/connections-hub/ConnectionsActivityTabContent.tsx`

**Step 1: Create PersonasTabContent**

```tsx
import { Loader2, MessageCircle } from 'lucide-react';
import { useConversationList } from '@/features/ai-chat/hooks/useAIChat';
import ConversationCard from './ConversationCard';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface PersonasTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export default function PersonasTabContent({ activeFilter, onFilterChange }: PersonasTabContentProps) {
  const personaId = activeFilter === 'all' ? undefined : activeFilter;
  const { data: conversations, isLoading } = useConversationList(undefined, personaId);

  // Count conversations per persona for filter badges
  const { data: allConversations } = useConversationList(undefined, undefined);
  const biographerCount = allConversations?.filter((c) => c.persona_id === 'biographer').length ?? 0;
  const friendCount = allConversations?.filter((c) => c.persona_id === 'friend').length ?? 0;

  const filterOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: allConversations?.length },
    { key: 'biographer', label: 'Biographer', count: biographerCount || undefined },
    { key: 'friend', label: 'Friend', count: friendCount || undefined },
  ];

  return (
    <div className="space-y-6">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && conversations && conversations.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {conversations.map((conv) => (
            <ConversationCard key={conv.id} conversation={conv} />
          ))}
        </div>
      )}

      {!isLoading && (!conversations || conversations.length === 0) && (
        <div className="text-center py-12">
          <MessageCircle className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter !== 'all'
              ? `No conversations with this persona yet.`
              : 'Start a conversation with one of your AI personas to see them here.'}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create PeopleTabContent**

```tsx
import { Loader2, Users } from 'lucide-react';
import { usePeople } from '@/features/connections/hooks/useConnections';
import type { PeopleFilter } from '@/features/connections/api/connections';
import PersonCard from './PersonCard';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface PeopleTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export default function PeopleTabContent({ activeFilter, onFilterChange }: PeopleTabContentProps) {
  const { data, isLoading } = usePeople(activeFilter as PeopleFilter);

  const filterOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: data?.counts?.all },
    { key: 'co_creators', label: 'Co-creators', count: data?.counts?.co_creators },
    { key: 'collaborators', label: 'Collaborators', count: data?.counts?.collaborators },
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
          {data.items.map((person) => (
            <PersonCard key={person.user_id} person={person} />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-center py-12">
          <Users className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter === 'co_creators'
              ? 'No co-creators found.'
              : activeFilter === 'collaborators'
                ? 'No collaborators found.'
                : 'Invite someone to collaborate on a legacy to see your connections here.'}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create ConnectionsActivityTabContent**

```tsx
import { Loader2, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ActivityFeedItem from '@/features/activity/components/ActivityFeedItem';
import { useSocialFeed } from '@/features/activity/hooks/useActivity';
import { useAuth } from '@/contexts/AuthContext';
import type { SocialFeedItem } from '@/features/activity/api/activity';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface ConnectionsActivityTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

const filterOptions: FilterOption[] = [
  { key: 'all', label: 'All Activity' },
  { key: 'mine', label: 'My Activity' },
];

export default function ConnectionsActivityTabContent({ activeFilter, onFilterChange }: ConnectionsActivityTabContentProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: feedData, isLoading } = useSocialFeed(20);

  const currentUserId = user?.id ?? '';

  // Filter to connection-relevant events
  const items = feedData?.items?.filter((item) => {
    // Filter by entity type: conversations and legacy membership events
    const isConnectionEvent =
      item.entity_type === 'conversation' ||
      item.action === 'ai_conversation_started' ||
      item.action === 'ai_story_evolved' ||
      item.action === 'joined' ||
      item.action === 'invited';

    if (!isConnectionEvent) return false;

    if (activeFilter === 'mine') {
      return item.actor.id === currentUserId;
    }
    return true;
  }) ?? [];

  const handleActivityClick = (item: SocialFeedItem) => {
    if (item.entity_type === 'legacy') {
      navigate(`/legacy/${item.entity_id}`);
    } else if (item.entity_type === 'story') {
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
              currentUserId={currentUserId}
              onClick={() => handleActivityClick(item)}
            />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-12">
          <Activity className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">No connection activity to show yet.</p>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Run tests and lint**

Run: `cd apps/web && npm run test -- --run && npm run lint`
Expected: All pass

**Step 5: Commit**

```bash
git add apps/web/src/components/connections-hub/PersonasTabContent.tsx apps/web/src/components/connections-hub/PeopleTabContent.tsx apps/web/src/components/connections-hub/ConnectionsActivityTabContent.tsx
git commit -m "feat(web): add PersonasTabContent, PeopleTabContent, and ConnectionsActivityTabContent"
```

---

### Task 10: Rewrite ConnectionsPage as Hub ✅

**Files:**
- Modify: `apps/web/src/pages/ConnectionsPage.tsx`

**Step 1: Rewrite the page**

```tsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Footer from '@/components/Footer';
import ConnectionsStatsBar from '@/components/connections-hub/ConnectionsStatsBar';
import TopConnectionsChips from '@/components/connections-hub/TopConnectionsChips';
import FavoritePersonasChips from '@/components/connections-hub/FavoritePersonasChips';
import PersonasTabContent from '@/components/connections-hub/PersonasTabContent';
import PeopleTabContent from '@/components/connections-hub/PeopleTabContent';
import ConnectionsActivityTabContent from '@/components/connections-hub/ConnectionsActivityTabContent';
import LegacyPickerDialog from '@/components/stories-hub/LegacyPickerDialog';

const DEFAULT_TAB = 'personas';
const DEFAULT_FILTERS: Record<string, string> = {
  personas: 'all',
  people: 'all',
  activity: 'all',
};
const VALID_FILTERS: Record<string, string[]> = {
  personas: ['all', 'biographer', 'friend'],
  people: ['all', 'co_creators', 'collaborators'],
  activity: ['all', 'mine'],
};

export default function ConnectionsPage() {
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

  const handlePersonaChipClick = (personaId: string) => {
    setSearchParams({ tab: 'personas', filter: personaId });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-neutral-900">Connections</h1>
              <p className="text-neutral-600 text-sm">
                Your personas, people, and conversations.
              </p>
            </div>
            <Button
              onClick={() => setPickerOpen(true)}
              className="gap-2 bg-theme-primary hover:bg-theme-primary-dark"
            >
              <MessageCircle className="size-4" />
              New Chat
            </Button>
          </div>

          {/* Stats */}
          <ConnectionsStatsBar />

          {/* Top Connections */}
          <TopConnectionsChips />

          {/* Favorite Personas */}
          <FavoritePersonasChips onPersonaClick={handlePersonaChipClick} />

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="personas">Personas</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="personas">
              <PersonasTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="people">
              <PeopleTabContent
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </TabsContent>

            <TabsContent value="activity">
              <ConnectionsActivityTabContent
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

The placeholder test should be replaced with a proper hub test now. Update `PlaceholderPages.test.tsx` to test the new ConnectionsPage:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConnectionsPage from './ConnectionsPage';

// Mock all hooks used by the page and its children
vi.mock('@/features/connections/hooks/useConnections', () => ({
  useConnectionsStats: () => ({ data: null, isLoading: false }),
  useTopConnections: () => ({ data: null, isLoading: false }),
  useFavoritePersonas: () => ({ data: null, isLoading: false }),
  usePeople: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/ai-chat/hooks/useAIChat', () => ({
  useConversationList: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useSocialFeed: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConnectionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ConnectionsPage', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByText('Connections')).toBeInTheDocument();
  });

  it('renders the page subtitle', () => {
    renderPage();
    expect(screen.getByText('Your personas, people, and conversations.')).toBeInTheDocument();
  });

  it('renders the New Chat button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('renders tab triggers', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /personas/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /people/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });
});
```

**Step 3: Run tests and lint**

Run: `cd apps/web && npm run test -- --run && npm run lint`
Expected: All pass

**Step 4: Commit**

```bash
git add apps/web/src/pages/ConnectionsPage.tsx apps/web/src/pages/PlaceholderPages.test.tsx
git commit -m "feat(web): rewrite ConnectionsPage as full Connections Hub with tabs"
```

---

### Task 11: Final Validation ✅

**Step 1: Run full backend validation**

Run: `cd services/core-api && just validate-backend`
Expected: All pass (ruff + mypy)

**Step 2: Run full frontend test suite**

Run: `cd apps/web && npm run test -- --run`
Expected: All tests pass

**Step 3: Run frontend lint**

Run: `cd apps/web && npm run lint`
Expected: No errors

**Step 4: Final commit if any fixes were needed**

Only commit if fixes were applied during validation.
