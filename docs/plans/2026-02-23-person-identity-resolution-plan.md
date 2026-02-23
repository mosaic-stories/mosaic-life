# Person Identity Resolution Layer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce a Person entity, identity matching service, and consent-based legacy linking so multiple legacies about the same person can share content.

**Architecture:** New `persons`, `legacy_links`, `legacy_link_shares` tables in PostgreSQL. Person model auto-created during legacy creation. Hybrid matching (fast inline trigram + async deep). Consent-based linking protocol with selective/all share modes. RAG retrieval expanded to include shared stories.

**Tech Stack:** Python/FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL with pg_trgm, React/TypeScript, TanStack Query, Vitest

**Design doc:** `docs/plans/2026-02-23-person-identity-resolution-design.md`

---

## Phase 1a: Person Entity (Backend Foundation)

### Task 1: Person SQLAlchemy Model

**Files:**
- Create: `services/core-api/app/models/person.py`
- Modify: `services/core-api/app/models/__init__.py`
- Modify: `services/core-api/app/models/legacy.py`
- Test: `services/core-api/tests/test_person_model.py`

**Step 1: Write the failing test**

```python
# tests/test_person_model.py
"""Tests for Person model."""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import Person


@pytest.mark.asyncio
class TestPersonModel:
    async def test_create_person(self, db_session: AsyncSession):
        person = Person(
            canonical_name="John Smith",
            aliases=["Johnny", "J. Smith"],
            locations=["Chicago, IL"],
        )
        db_session.add(person)
        await db_session.commit()
        await db_session.refresh(person)

        assert person.id is not None
        assert person.canonical_name == "John Smith"
        assert person.aliases == ["Johnny", "J. Smith"]
        assert person.locations == ["Chicago, IL"]
        assert person.birth_date is None
        assert person.death_date is None
        assert person.birth_date_approximate is False
        assert person.death_date_approximate is False

    async def test_create_person_with_dates(self, db_session: AsyncSession):
        from datetime import date

        person = Person(
            canonical_name="Jane Doe",
            birth_date=date(1950, 3, 15),
            death_date=date(2020, 11, 1),
            birth_date_approximate=True,
        )
        db_session.add(person)
        await db_session.commit()
        await db_session.refresh(person)

        assert person.birth_date == date(1950, 3, 15)
        assert person.death_date == date(2020, 11, 1)
        assert person.birth_date_approximate is True
        assert person.death_date_approximate is False

    async def test_person_repr(self, db_session: AsyncSession):
        person = Person(canonical_name="Test Person")
        db_session.add(person)
        await db_session.commit()
        await db_session.refresh(person)

        assert "Test Person" in repr(person)
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.person'`

**Step 3: Write the Person model**

Create `services/core-api/app/models/person.py`:

```python
"""Person model representing a canonical real-world person identity."""

from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, String
from sqlalchemy.dialects.postgresql import JSON, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class Person(Base):
    """Canonical identity for a real-world person.

    Multiple Legacies can reference the same Person. This enables
    identity matching, legacy linking, and shared content access.
    """

    __tablename__ = "persons"

    id: Mapped[bytes] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    canonical_name: Mapped[str] = mapped_column(
        String(200), nullable=False, index=True
    )
    aliases: Mapped[list | None] = mapped_column(
        JSON, nullable=False, server_default="[]"
    )

    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    birth_date_approximate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    death_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    death_date_approximate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    locations: Mapped[list | None] = mapped_column(
        JSON, nullable=False, server_default="[]"
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

    def __repr__(self) -> str:
        return f"<Person(id={self.id}, canonical_name={self.canonical_name})>"
```

**Step 4: Add Person to model exports**

In `services/core-api/app/models/__init__.py`, add:
- Import: `from .person import Person`
- Add `"Person"` to `__all__`

**Step 5: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_model.py -v`
Expected: PASS

**Step 6: Validate**

Run: `just validate-backend`
Expected: PASS (ruff + mypy clean)

**Step 7: Commit**

```bash
git add services/core-api/app/models/person.py services/core-api/app/models/__init__.py tests/test_person_model.py
git commit -m "feat: add Person model for canonical identity"
```

---

### Task 2: Add person_id FK to Legacy Model

**Files:**
- Modify: `services/core-api/app/models/legacy.py`
- Modify: `services/core-api/app/models/person.py`
- Test: `services/core-api/tests/test_person_model.py` (extend)

**Step 1: Write the failing test**

Add to `tests/test_person_model.py`:

```python
class TestLegacyPersonRelationship:
    async def test_legacy_has_person_id(self, db_session: AsyncSession, test_user):
        from app.models.legacy import Legacy
        from app.models.person import Person

        person = Person(canonical_name="Test Person")
        db_session.add(person)
        await db_session.flush()

        legacy = Legacy(
            name="Test Legacy",
            created_by=test_user.id,
            person_id=person.id,
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        assert legacy.person_id == person.id
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_model.py::TestLegacyPersonRelationship -v`
Expected: FAIL — `TypeError: 'person_id' is an invalid keyword argument`

**Step 3: Add person_id to Legacy model**

In `services/core-api/app/models/legacy.py`, add after `profile_image_id`:

```python
person_id: Mapped[UUID | None] = mapped_column(
    PG_UUID(as_uuid=True),
    ForeignKey("persons.id", ondelete="SET NULL"),
    nullable=True,  # Nullable for migration, will be NOT NULL after backfill
    index=True,
)
```

Add relationship in Legacy class:

```python
person: Mapped["Person | None"] = relationship("Person", foreign_keys=[person_id])
```

Add `Person` to the TYPE_CHECKING imports in `legacy.py`:

```python
if TYPE_CHECKING:
    from .invitation import Invitation
    from .media import Media
    from .person import Person
```

In `services/core-api/app/models/person.py`, add a back-reference relationship:

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .legacy import Legacy

# Add to Person class:
legacies: Mapped[list["Legacy"]] = relationship(
    "Legacy", back_populates="person", foreign_keys="Legacy.person_id"
)
```

**Step 4: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_model.py -v`
Expected: PASS

**Step 5: Validate**

Run: `just validate-backend`

**Step 6: Commit**

```bash
git add services/core-api/app/models/legacy.py services/core-api/app/models/person.py services/core-api/tests/test_person_model.py
git commit -m "feat: add person_id FK to Legacy model"
```

---

### Task 3: Alembic Migration — Create persons Table and Add person_id

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_add_persons_table.py`
- Modify: `services/core-api/alembic/env.py`

**Step 1: Add Person to alembic env.py imports**

In `services/core-api/alembic/env.py`, add `Person` to the import block at line 12-26:

```python
from app.models import (  # noqa: F401
    AIConversation,
    AIMessage,
    Invitation,
    Legacy,
    LegacyMember,
    Media,
    Notification,
    Person,  # ADD THIS
    Story,
    StoryEvolutionSession,
    StoryVersion,
    SupportRequest,
    User,
    UserSession,
)
```

**Step 2: Generate the migration**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic revision --autogenerate -m "add_persons_table_and_legacy_person_id"`

Review the generated migration — it should contain:
- `op.create_table("persons", ...)` with all columns
- `op.add_column("legacies", sa.Column("person_id", ...))`
- Create indexes on persons table

**Step 3: Manually add the trigram GIN index**

Alembic autogenerate won't create the GIN trigram index. Add this to the `upgrade()` function in the generated migration:

```python
# Trigram GIN index for fuzzy name matching
op.execute(
    "CREATE INDEX ix_persons_canonical_name_trgm ON persons "
    "USING gin (canonical_name gin_trgm_ops)"
)
```

And in `downgrade()`:

```python
op.execute("DROP INDEX IF EXISTS ix_persons_canonical_name_trgm")
```

**Step 4: Test the migration against local database**

Run:
```bash
docker compose -f infra/compose/docker-compose.yml up -d postgres
cd /apps/mosaic-life/services/core-api && uv run alembic upgrade head
```
Expected: Migration applies cleanly

**Step 5: Verify the table exists**

Run:
```bash
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\d persons"
```
Expected: Table with all columns visible

**Step 6: Commit**

```bash
git add services/core-api/alembic/env.py services/core-api/alembic/versions/
git commit -m "feat: migration to create persons table and add person_id to legacies"
```

---

### Task 4: Alembic Migration — Backfill Person Records

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_backfill_person_records.py`

**Step 1: Create data migration manually**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic revision -m "backfill_person_records"`

Edit the generated file:

```python
"""Backfill person records from existing legacies.

Revision ID: <auto>
Revises: <previous>
Create Date: <auto>
"""

from alembic import op
import sqlalchemy as sa

revision = "<auto>"
down_revision = "<previous>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Backfill: create a Person for each legacy that doesn't have one
    op.execute("""
        INSERT INTO persons (id, canonical_name, birth_date, death_date, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            l.name,
            l.birth_date,
            l.death_date,
            l.created_at,
            NOW()
        FROM legacies l
        WHERE l.person_id IS NULL
    """)

    # Link legacies to their new Person records by matching name + dates
    op.execute("""
        UPDATE legacies l
        SET person_id = p.id
        FROM persons p
        WHERE l.person_id IS NULL
            AND p.canonical_name = l.name
            AND (p.birth_date IS NOT DISTINCT FROM l.birth_date)
            AND (p.death_date IS NOT DISTINCT FROM l.death_date)
    """)


def downgrade() -> None:
    # Set person_id back to NULL
    op.execute("UPDATE legacies SET person_id = NULL")
    # Delete all persons (only backfilled ones exist at this point)
    op.execute("DELETE FROM persons")
```

**Step 2: Apply migration**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic upgrade head`

**Step 3: Verify backfill**

Run:
```bash
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "SELECT COUNT(*) FROM persons; SELECT COUNT(*) FROM legacies WHERE person_id IS NULL;"
```
Expected: Person count matches legacy count. No legacies with NULL person_id.

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat: migration to backfill person records from existing legacies"
```

---

### Task 5: Alembic Migration — Enforce NOT NULL on person_id

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_enforce_person_id_not_null.py`

**Step 1: Create migration**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic revision -m "enforce_person_id_not_null"`

Edit:

```python
"""Enforce person_id NOT NULL on legacies.

Revision ID: <auto>
Revises: <previous>
Create Date: <auto>
"""

from alembic import op
import sqlalchemy as sa

revision = "<auto>"
down_revision = "<previous>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("legacies", "person_id", nullable=False)


def downgrade() -> None:
    op.alter_column("legacies", "person_id", nullable=True)
```

**Step 2: Update the Legacy model to reflect NOT NULL**

In `services/core-api/app/models/legacy.py`, change:
```python
person_id: Mapped[UUID] = mapped_column(  # was UUID | None
    PG_UUID(as_uuid=True),
    ForeignKey("persons.id", ondelete="SET NULL"),
    nullable=False,  # was True
    index=True,
)
```

And update the relationship type:
```python
person: Mapped["Person"] = relationship("Person", foreign_keys=[person_id])
```

**Step 3: Apply migration**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic upgrade head`

**Step 4: Validate**

Run: `just validate-backend`

**Step 5: Commit**

```bash
git add services/core-api/app/models/legacy.py services/core-api/alembic/versions/
git commit -m "feat: enforce person_id NOT NULL on legacies"
```

---

### Task 6: Person Pydantic Schemas

**Files:**
- Create: `services/core-api/app/schemas/person.py`
- Test: `services/core-api/tests/test_person_schemas.py`

**Step 1: Write the failing test**

```python
# tests/test_person_schemas.py
"""Tests for Person schemas."""
from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.person import PersonCreate, PersonMatchCandidate, PersonResponse


class TestPersonCreate:
    def test_valid_minimal(self):
        schema = PersonCreate(canonical_name="John Smith")
        assert schema.canonical_name == "John Smith"
        assert schema.aliases == []
        assert schema.locations == []

    def test_valid_full(self):
        schema = PersonCreate(
            canonical_name="John Smith",
            aliases=["Johnny", "J. Smith"],
            birth_date=date(1950, 1, 1),
            death_date=date(2020, 6, 15),
            birth_date_approximate=True,
            locations=["Chicago, IL"],
        )
        assert schema.birth_date_approximate is True

    def test_name_required(self):
        with pytest.raises(ValidationError):
            PersonCreate(canonical_name="")

    def test_name_max_length(self):
        with pytest.raises(ValidationError):
            PersonCreate(canonical_name="x" * 201)


class TestPersonMatchCandidate:
    def test_match_candidate(self):
        candidate = PersonMatchCandidate(
            person_id="550e8400-e29b-41d4-a716-446655440000",
            canonical_name="John Smith",
            birth_year_range="1948-1952",
            death_year_range="2020",
            legacy_count=2,
            confidence=0.85,
        )
        assert candidate.confidence == 0.85
        assert candidate.legacy_count == 2
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write the schemas**

Create `services/core-api/app/schemas/person.py`:

```python
"""Pydantic schemas for Person API."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PersonCreate(BaseModel):
    """Schema for creating a person (usually auto-created with legacy)."""

    canonical_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Best-known full name",
    )
    aliases: list[str] = Field(
        default_factory=list,
        description="Alternate names or nicknames",
    )
    birth_date: date | None = Field(None, description="Birth date")
    birth_date_approximate: bool = Field(
        False, description="Whether birth date is approximate"
    )
    death_date: date | None = Field(None, description="Death date")
    death_date_approximate: bool = Field(
        False, description="Whether death date is approximate"
    )
    locations: list[str] = Field(
        default_factory=list,
        description="Associated locations",
    )


class PersonResponse(BaseModel):
    """Schema for person response."""

    id: UUID
    canonical_name: str
    aliases: list[str]
    birth_date: date | None
    birth_date_approximate: bool
    death_date: date | None
    death_date_approximate: bool
    locations: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PersonMatchCandidate(BaseModel):
    """Schema for a person match candidate (privacy-safe)."""

    person_id: UUID
    canonical_name: str
    birth_year_range: str | None = Field(
        None, description="e.g. '1948-1952' or '1950'"
    )
    death_year_range: str | None = Field(None, description="e.g. '2020'")
    legacy_count: int = Field(description="Number of legacies referencing this person")
    confidence: float = Field(
        description="Match confidence score 0.0-1.0", ge=0.0, le=1.0
    )


class PersonMatchResponse(BaseModel):
    """Response for match candidates endpoint."""

    candidates: list[PersonMatchCandidate]
```

**Step 4: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_schemas.py -v`
Expected: PASS

**Step 5: Validate**

Run: `just validate-backend`

**Step 6: Commit**

```bash
git add services/core-api/app/schemas/person.py services/core-api/tests/test_person_schemas.py
git commit -m "feat: add Person Pydantic schemas"
```

---

### Task 7: Update Legacy Creation to Auto-Create Person

**Files:**
- Modify: `services/core-api/app/services/legacy.py`
- Modify: `services/core-api/app/schemas/legacy.py`
- Test: `services/core-api/tests/test_legacy_api.py` (extend)

**Step 1: Write the failing test**

Add to `tests/test_legacy_api.py`:

```python
class TestLegacyCreationWithPerson:
    @pytest.mark.asyncio
    async def test_create_legacy_auto_creates_person(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.post(
            "/api/legacies/",
            json={"name": "New Person", "visibility": "private"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert "person_id" in data
        assert data["person_id"] is not None

    @pytest.mark.asyncio
    async def test_create_legacy_with_existing_person_id(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession
    ):
        from app.models.person import Person

        person = Person(canonical_name="Existing Person")
        db_session.add(person)
        await db_session.commit()
        await db_session.refresh(person)

        response = await client.post(
            "/api/legacies/",
            json={
                "name": "Linked Legacy",
                "visibility": "private",
                "person_id": str(person.id),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["person_id"] == str(person.id)
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_legacy_api.py::TestLegacyCreationWithPerson -v`
Expected: FAIL

**Step 3: Update LegacyCreate schema**

In `services/core-api/app/schemas/legacy.py`, add to `LegacyCreate`:

```python
person_id: UUID | None = Field(
    None,
    description="Optional: link to existing Person. If not provided, a Person is auto-created.",
)
```

Add `from uuid import UUID` to imports.

**Step 4: Update LegacyResponse schema**

In `services/core-api/app/schemas/legacy.py`, add to `LegacyResponse`:

```python
person_id: UUID | None = None
```

**Step 5: Update create_legacy service**

In `services/core-api/app/services/legacy.py`, modify `create_legacy()` to auto-create Person:

```python
from ..models.person import Person

async def create_legacy(
    db: AsyncSession,
    user_id: UUID,
    data: LegacyCreate,
) -> LegacyResponse:
    # Resolve or create Person
    if data.person_id:
        # Verify person exists
        person_result = await db.execute(
            select(Person).where(Person.id == data.person_id)
        )
        person = person_result.scalar_one_or_none()
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        person_id = person.id
    else:
        # Auto-create Person from legacy attributes
        person = Person(
            canonical_name=data.name,
            birth_date=data.birth_date,
            death_date=data.death_date,
        )
        db.add(person)
        await db.flush()
        person_id = person.id

    # Create legacy with person_id
    legacy = Legacy(
        name=data.name,
        birth_date=data.birth_date,
        death_date=data.death_date,
        biography=data.biography,
        visibility=data.visibility,
        created_by=user_id,
        person_id=person_id,
    )
    # ... rest unchanged ...
```

Update the `LegacyResponse` construction to include `person_id=legacy.person_id`.

**Step 6: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_legacy_api.py -v`
Expected: PASS (all existing tests still pass + new tests pass)

**Step 7: Validate**

Run: `just validate-backend`

**Step 8: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/app/schemas/legacy.py services/core-api/tests/test_legacy_api.py
git commit -m "feat: auto-create Person during legacy creation"
```

---

### Task 8: Update Existing Test Fixtures for person_id

**Files:**
- Modify: `services/core-api/tests/conftest.py`

Since `person_id` is now NOT NULL (after Task 5), all test fixtures creating legacies need to create a Person first.

**Step 1: Update conftest.py fixtures**

Add a `test_person` fixture and update `test_legacy`, `test_legacy_2`, `test_legacy_with_pending`:

```python
from app.models.person import Person

@pytest_asyncio.fixture
async def test_person(db_session: AsyncSession) -> Person:
    """Create a test person."""
    person = Person(canonical_name="Test Legacy")
    db_session.add(person)
    await db_session.commit()
    await db_session.refresh(person)
    return person


@pytest_asyncio.fixture
async def test_legacy(db_session: AsyncSession, test_user: User, test_person: Person) -> Legacy:
    legacy = Legacy(
        name="Test Legacy",
        birth_date=None,
        death_date=None,
        biography="Test biography",
        created_by=test_user.id,
        visibility="public",
        person_id=test_person.id,
    )
    # ... rest unchanged ...
```

Update all other legacy fixtures similarly.

**Step 2: Run full test suite**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest -v`
Expected: ALL tests pass

**Step 3: Validate**

Run: `just validate-backend`

**Step 4: Commit**

```bash
git add services/core-api/tests/conftest.py
git commit -m "fix: update test fixtures to include person_id"
```

---

## Phase 1b: Identity Matching Service

### Task 9: Person Matching Service

**Files:**
- Create: `services/core-api/app/services/person.py`
- Test: `services/core-api/tests/test_person_service.py`

**Step 1: Write the failing test**

```python
# tests/test_person_service.py
"""Tests for Person matching service."""
import pytest
import pytest_asyncio
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import Person
from app.services.person import find_match_candidates


@pytest.mark.asyncio
class TestFindMatchCandidates:
    async def test_exact_name_match(self, db_session: AsyncSession):
        person = Person(canonical_name="John Smith")
        db_session.add(person)
        await db_session.commit()

        candidates = await find_match_candidates(
            db=db_session, name="John Smith"
        )
        assert len(candidates) >= 1
        assert candidates[0].canonical_name == "John Smith"
        assert candidates[0].confidence > 0.5

    async def test_no_match(self, db_session: AsyncSession):
        person = Person(canonical_name="John Smith")
        db_session.add(person)
        await db_session.commit()

        candidates = await find_match_candidates(
            db=db_session, name="Completely Different Name"
        )
        # May return 0 or low-confidence results
        for c in candidates:
            assert c.confidence < 0.5

    async def test_date_boosts_confidence(self, db_session: AsyncSession):
        person = Person(
            canonical_name="John Smith",
            birth_date=date(1950, 1, 1),
        )
        db_session.add(person)
        await db_session.commit()

        candidates_with_date = await find_match_candidates(
            db=db_session,
            name="John Smith",
            birth_date=date(1950, 1, 1),
        )
        candidates_without_date = await find_match_candidates(
            db=db_session,
            name="John Smith",
        )

        # With matching date should have higher confidence
        assert len(candidates_with_date) >= 1
        assert len(candidates_without_date) >= 1
        assert candidates_with_date[0].confidence >= candidates_without_date[0].confidence
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_service.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write the matching service**

Create `services/core-api/app/services/person.py`:

```python
"""Person matching and management service."""

import logging
from datetime import date
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.legacy import Legacy
from ..models.person import Person
from ..schemas.person import PersonMatchCandidate

logger = logging.getLogger(__name__)

# Confidence weights
NAME_WEIGHT = 0.4
ALIAS_WEIGHT = 0.15
BIRTH_DATE_WEIGHT = 0.2
DEATH_DATE_WEIGHT = 0.15
LOCATION_WEIGHT = 0.1

# Thresholds
INLINE_THRESHOLD = 0.5
ASYNC_THRESHOLD = 0.8
NAME_SIMILARITY_FLOOR = 0.3


def _date_proximity_score(d1: date | None, d2: date | None) -> float:
    """Score date proximity: exact=1.0, ±1yr=0.7, ±2yr=0.4, else 0.0."""
    if d1 is None or d2 is None:
        return 0.0
    diff = abs((d1 - d2).days)
    if diff == 0:
        return 1.0
    if diff <= 365:
        return 0.7
    if diff <= 730:
        return 0.4
    return 0.0


async def find_match_candidates(
    db: AsyncSession,
    name: str,
    birth_date: date | None = None,
    death_date: date | None = None,
    locations: list[str] | None = None,
    exclude_person_id: UUID | None = None,
    limit: int = 5,
) -> list[PersonMatchCandidate]:
    """Find potential Person matches using fuzzy name matching and date proximity.

    Uses pg_trgm similarity for name matching, then scores candidates
    with weighted signals.

    Args:
        db: Database session.
        name: Name to match against.
        birth_date: Optional birth date for scoring.
        death_date: Optional death date for scoring.
        locations: Optional locations for scoring.
        exclude_person_id: Person ID to exclude (for post-creation matching).
        limit: Maximum candidates to return.

    Returns:
        List of match candidates sorted by confidence descending.
    """
    # Use pg_trgm similarity for name matching
    # SQLite (tests) doesn't support pg_trgm, so fall back to LIKE
    try:
        similarity_col = func.similarity(Person.canonical_name, name)
        query = (
            select(
                Person,
                similarity_col.label("name_sim"),
                func.count(Legacy.id).label("legacy_count"),
            )
            .outerjoin(Legacy, Legacy.person_id == Person.id)
            .where(similarity_col >= NAME_SIMILARITY_FLOOR)
            .group_by(Person.id)
            .order_by(similarity_col.desc())
            .limit(limit * 2)  # Fetch extra for post-filtering
        )
    except Exception:
        # Fallback for SQLite in tests
        query = (
            select(
                Person,
                func.count(Legacy.id).label("legacy_count"),
            )
            .outerjoin(Legacy, Legacy.person_id == Person.id)
            .where(Person.canonical_name.ilike(f"%{name}%"))
            .group_by(Person.id)
            .limit(limit * 2)
        )

    if exclude_person_id:
        query = query.where(Person.id != exclude_person_id)

    result = await db.execute(query)
    rows = result.all()

    candidates = []
    for row in rows:
        person = row[0] if hasattr(row[0], "id") else row.Person
        legacy_count = row.legacy_count if hasattr(row, "legacy_count") else row[-1]

        # Calculate name similarity score
        name_score = row.name_sim if hasattr(row, "name_sim") else 0.6

        # Calculate date scores
        birth_score = _date_proximity_score(birth_date, person.birth_date)
        death_score = _date_proximity_score(death_date, person.death_date)

        # Location overlap (simplified — count matching locations)
        location_score = 0.0
        if locations and person.locations:
            person_locs = {loc.lower() for loc in person.locations}
            input_locs = {loc.lower() for loc in locations}
            overlap = len(person_locs & input_locs)
            total = max(len(person_locs | input_locs), 1)
            location_score = overlap / total

        # Alias match bonus
        alias_score = 0.0
        if person.aliases:
            for alias in person.aliases:
                if name.lower() in alias.lower() or alias.lower() in name.lower():
                    alias_score = 1.0
                    break

        # Weighted confidence
        confidence = (
            name_score * NAME_WEIGHT
            + alias_score * ALIAS_WEIGHT
            + birth_score * BIRTH_DATE_WEIGHT
            + death_score * DEATH_DATE_WEIGHT
            + location_score * LOCATION_WEIGHT
        )

        # Build year range strings (privacy-safe)
        birth_year_range = None
        if person.birth_date:
            year = person.birth_date.year
            if person.birth_date_approximate:
                birth_year_range = f"{year - 2}-{year + 2}"
            else:
                birth_year_range = str(year)

        death_year_range = None
        if person.death_date:
            year = person.death_date.year
            if person.death_date_approximate:
                death_year_range = f"{year - 2}-{year + 2}"
            else:
                death_year_range = str(year)

        candidates.append(
            PersonMatchCandidate(
                person_id=person.id,
                canonical_name=person.canonical_name,
                birth_year_range=birth_year_range,
                death_year_range=death_year_range,
                legacy_count=legacy_count,
                confidence=round(min(confidence, 1.0), 3),
            )
        )

    # Sort by confidence and filter above threshold
    candidates.sort(key=lambda c: c.confidence, reverse=True)
    return candidates[:limit]
```

**Step 4: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_service.py -v`
Expected: PASS

**Step 5: Validate**

Run: `just validate-backend`

**Step 6: Commit**

```bash
git add services/core-api/app/services/person.py services/core-api/tests/test_person_service.py
git commit -m "feat: add Person matching service with confidence scoring"
```

---

### Task 10: Person Match Candidates API Route

**Files:**
- Create: `services/core-api/app/routes/person.py`
- Modify: `services/core-api/app/main.py`
- Test: `services/core-api/tests/test_person_api.py`

**Step 1: Write the failing test**

```python
# tests/test_person_api.py
"""Tests for Person API endpoints."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import Person


@pytest.mark.asyncio
class TestMatchCandidates:
    async def test_match_candidates_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/persons/match-candidates?name=John")
        assert response.status_code == 401

    async def test_match_candidates_requires_name(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.get(
            "/api/persons/match-candidates",
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_match_candidates_returns_results(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
    ):
        person = Person(canonical_name="John Smith")
        db_session.add(person)
        await db_session.commit()

        response = await client.get(
            "/api/persons/match-candidates?name=John+Smith",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "candidates" in data
        assert isinstance(data["candidates"], list)

    async def test_match_candidates_empty_for_no_match(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        response = await client.get(
            "/api/persons/match-candidates?name=ZzzNoMatchXxx",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["candidates"] == []
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_api.py -v`
Expected: FAIL — 404 (route not registered)

**Step 3: Write the route**

Create `services/core-api/app/routes/person.py`:

```python
"""Person API routes."""

import logging
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.person import PersonMatchResponse
from ..services.person import find_match_candidates

router = APIRouter(prefix="/api/persons", tags=["persons"])
logger = logging.getLogger(__name__)


@router.get(
    "/match-candidates",
    response_model=PersonMatchResponse,
    summary="Find potential Person matches",
    description="Returns match candidates based on name similarity and date proximity. "
    "Privacy-safe: only reveals Person attributes, never legacy details.",
)
async def get_match_candidates(
    request: Request,
    name: str = Query(..., min_length=1, max_length=200, description="Name to match"),
    birth_date: date | None = Query(None, description="Birth date for scoring"),
    death_date: date | None = Query(None, description="Death date for scoring"),
    db: AsyncSession = Depends(get_db),
) -> PersonMatchResponse:
    session = await require_auth(request)

    logger.info(
        "person.match_candidates",
        extra={
            "user_id": str(session.user_id),
            "name": name,
        },
    )

    candidates = await find_match_candidates(
        db=db,
        name=name,
        birth_date=birth_date,
        death_date=death_date,
    )

    return PersonMatchResponse(candidates=candidates)
```

**Step 4: Register the router**

In `services/core-api/app/main.py`, add:

```python
from .routes.person import router as person_router
# ...
app.include_router(person_router)
```

**Step 5: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_person_api.py -v`
Expected: PASS

**Step 6: Validate**

Run: `just validate-backend`

**Step 7: Commit**

```bash
git add services/core-api/app/routes/person.py services/core-api/app/main.py services/core-api/tests/test_person_api.py
git commit -m "feat: add Person match candidates API endpoint"
```

---

### Task 11: Frontend — Match Candidates During Legacy Creation

**Files:**
- Create: `apps/web/src/features/person/api/persons.ts`
- Create: `apps/web/src/features/person/hooks/usePersonMatch.ts`
- Modify: `apps/web/src/features/legacy/api/legacies.ts`
- Modify: `apps/web/src/features/legacy/components/LegacyCreation.tsx`

**Step 1: Create Person API client**

Create `apps/web/src/features/person/api/persons.ts`:

```typescript
import { apiGet } from '@/lib/api/client';

export interface PersonMatchCandidate {
  person_id: string;
  canonical_name: string;
  birth_year_range: string | null;
  death_year_range: string | null;
  legacy_count: number;
  confidence: number;
}

export interface PersonMatchResponse {
  candidates: PersonMatchCandidate[];
}

export async function getMatchCandidates(params: {
  name: string;
  birth_date?: string | null;
  death_date?: string | null;
}): Promise<PersonMatchResponse> {
  const searchParams = new URLSearchParams({ name: params.name });
  if (params.birth_date) searchParams.set('birth_date', params.birth_date);
  if (params.death_date) searchParams.set('death_date', params.death_date);
  return apiGet<PersonMatchResponse>(
    `/api/persons/match-candidates?${searchParams.toString()}`
  );
}
```

**Step 2: Create usePersonMatch hook**

Create `apps/web/src/features/person/hooks/usePersonMatch.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getMatchCandidates } from '@/features/person/api/persons';

export const personKeys = {
  all: ['persons'] as const,
  matchCandidates: (name: string) => [...personKeys.all, 'match', name] as const,
};

export function usePersonMatch(
  name: string,
  birthDate?: string | null,
  deathDate?: string | null,
) {
  return useQuery({
    queryKey: personKeys.matchCandidates(name),
    queryFn: () =>
      getMatchCandidates({
        name,
        birth_date: birthDate,
        death_date: deathDate,
      }),
    enabled: name.trim().length >= 2,
    staleTime: 10_000, // 10s — avoid re-fetching during typing
  });
}
```

**Step 3: Update CreateLegacyInput to include person_id**

In `apps/web/src/features/legacy/api/legacies.ts`, add to `CreateLegacyInput`:

```typescript
export interface CreateLegacyInput {
  name: string;
  birth_date?: string | null;
  death_date?: string | null;
  biography?: string | null;
  visibility?: LegacyVisibility;
  person_id?: string | null; // ADD THIS
}
```

**Step 4: Update LegacyCreation component**

In `apps/web/src/features/legacy/components/LegacyCreation.tsx`:

1. Import the match hook and types
2. Add state for `selectedPersonId`
3. Add debounced match query
4. Add match candidate display below the name input
5. Pass `person_id` to `createLegacy.mutateAsync()`

Key additions:

```typescript
import { usePersonMatch } from '@/features/person/hooks/usePersonMatch';
import type { PersonMatchCandidate } from '@/features/person/api/persons';
import { useDebounce } from '@/hooks/useDebounce'; // May need to create this

// Inside component:
const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
const debouncedName = useDebounce(name, 300);
const matchQuery = usePersonMatch(debouncedName, birthDate, deathDate);

// In handleSubmit, add person_id:
const legacy = await createLegacy.mutateAsync({
  name: name.trim(),
  birth_date: birthDate || null,
  death_date: deathDate || null,
  biography: biography.trim() || null,
  visibility,
  person_id: selectedPersonId,
});

// After the name input, add match candidates display:
{matchQuery.data?.candidates && matchQuery.data.candidates.length > 0 && !selectedPersonId && (
  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
    <p className="text-sm text-amber-800 font-medium mb-2">
      This may be the same person as an existing legacy:
    </p>
    {matchQuery.data.candidates
      .filter(c => c.confidence >= 0.5)
      .map(candidate => (
        <button
          key={candidate.person_id}
          type="button"
          onClick={() => setSelectedPersonId(candidate.person_id)}
          className="w-full text-left p-2 rounded hover:bg-amber-100 text-sm"
        >
          <span className="font-medium">{candidate.canonical_name}</span>
          {candidate.birth_year_range && (
            <span className="text-amber-600 ml-2">
              {candidate.birth_year_range}
              {candidate.death_year_range && ` – ${candidate.death_year_range}`}
            </span>
          )}
          <span className="text-amber-500 ml-2">
            ({candidate.legacy_count} {candidate.legacy_count === 1 ? 'legacy' : 'legacies'})
          </span>
        </button>
      ))}
    <button
      type="button"
      onClick={() => {/* dismiss */}}
      className="text-xs text-amber-600 hover:text-amber-800 mt-1"
    >
      Not the same person — create new
    </button>
  </div>
)}

{selectedPersonId && (
  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
    <span className="text-sm text-green-800">
      Linked to existing person record
    </span>
    <button
      type="button"
      onClick={() => setSelectedPersonId(null)}
      className="text-xs text-green-600 hover:text-green-800"
    >
      Unlink
    </button>
  </div>
)}
```

**Step 5: Create useDebounce hook if it doesn't exist**

Check: `apps/web/src/hooks/useDebounce.ts`. If missing, create:

```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
```

**Step 6: Build and verify**

Run: `cd /apps/mosaic-life/apps/web && npm run build`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/web/src/features/person/ apps/web/src/features/legacy/ apps/web/src/hooks/
git commit -m "feat: inline person match candidates in legacy creation form"
```

---

## Phase 1c: Legacy Linking

### Task 12: LegacyLink and LegacyLinkShare Models

**Files:**
- Create: `services/core-api/app/models/legacy_link.py`
- Modify: `services/core-api/app/models/__init__.py`
- Test: `services/core-api/tests/test_legacy_link_model.py`

**Step 1: Write the failing test**

```python
# tests/test_legacy_link_model.py
"""Tests for LegacyLink and LegacyLinkShare models."""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.legacy_link import LegacyLink, LegacyLinkShare
from app.models.person import Person
from app.models.user import User


@pytest.mark.asyncio
class TestLegacyLinkModel:
    async def test_create_link_request(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        person = Person(canonical_name="Shared Person")
        db_session.add(person)
        await db_session.flush()

        legacy_a = Legacy(
            name="Legacy A", created_by=test_user.id, person_id=person.id
        )
        legacy_b = Legacy(
            name="Legacy B", created_by=test_user_2.id, person_id=person.id
        )
        db_session.add_all([legacy_a, legacy_b])
        await db_session.flush()

        link = LegacyLink(
            person_id=person.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            requested_by=test_user.id,
        )
        db_session.add(link)
        await db_session.commit()
        await db_session.refresh(link)

        assert link.id is not None
        assert link.status == "pending"
        assert link.requester_share_mode == "selective"
        assert link.target_share_mode == "selective"

    async def test_link_share(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        person = Person(canonical_name="Shared Person 2")
        db_session.add(person)
        await db_session.flush()

        legacy_a = Legacy(name="LA", created_by=test_user.id, person_id=person.id)
        legacy_b = Legacy(name="LB", created_by=test_user_2.id, person_id=person.id)
        db_session.add_all([legacy_a, legacy_b])
        await db_session.flush()

        link = LegacyLink(
            person_id=person.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            requested_by=test_user.id,
            status="active",
        )
        db_session.add(link)
        await db_session.flush()

        share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_a.id,
            resource_type="story",
            resource_id=legacy_a.id,  # Using legacy_a.id as placeholder UUID
            shared_by=test_user.id,
        )
        db_session.add(share)
        await db_session.commit()
        await db_session.refresh(share)

        assert share.id is not None
        assert share.resource_type == "story"
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_legacy_link_model.py -v`
Expected: FAIL

**Step 3: Write the models**

Create `services/core-api/app/models/legacy_link.py`:

```python
"""LegacyLink and LegacyLinkShare models for consent-based legacy linking."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base


class LegacyLink(Base):
    """Consent-based link between two legacies about the same Person."""

    __tablename__ = "legacy_links"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )

    person_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requester_legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # State: pending, active, rejected, revoked
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="pending", index=True
    )

    # Per-side share modes: selective (default) or all
    requester_share_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="selective"
    )
    target_share_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="selective"
    )

    # Audit fields
    requested_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    responded_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    revoked_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    person = relationship("Person", foreign_keys=[person_id])
    requester_legacy = relationship("Legacy", foreign_keys=[requester_legacy_id])
    target_legacy = relationship("Legacy", foreign_keys=[target_legacy_id])
    requester_user = relationship("User", foreign_keys=[requested_by])
    shares: Mapped[list["LegacyLinkShare"]] = relationship(
        "LegacyLinkShare",
        back_populates="legacy_link",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "requester_legacy_id",
            "target_legacy_id",
            name="uq_legacy_link_pair",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<LegacyLink(id={self.id}, "
            f"requester={self.requester_legacy_id}, "
            f"target={self.target_legacy_id}, "
            f"status={self.status})>"
        )


class LegacyLinkShare(Base):
    """Per-story/media sharing permission for an active legacy link."""

    __tablename__ = "legacy_link_shares"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )

    legacy_link_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacy_links.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
    )

    resource_type: Mapped[str] = mapped_column(
        String(20), nullable=False  # 'story' or 'media'
    )
    resource_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), nullable=False
    )

    shared_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    shared_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Relationships
    legacy_link: Mapped["LegacyLink"] = relationship(
        "LegacyLink", back_populates="shares"
    )

    __table_args__ = (
        UniqueConstraint(
            "legacy_link_id",
            "resource_type",
            "resource_id",
            name="uq_legacy_link_share",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<LegacyLinkShare(id={self.id}, "
            f"link={self.legacy_link_id}, "
            f"type={self.resource_type})>"
        )
```

**Step 4: Update model exports**

In `services/core-api/app/models/__init__.py`:
- Add: `from .legacy_link import LegacyLink, LegacyLinkShare`
- Add `"LegacyLink"` and `"LegacyLinkShare"` to `__all__`

**Step 5: Run test**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_legacy_link_model.py -v`
Expected: PASS

**Step 6: Validate and commit**

Run: `just validate-backend`

```bash
git add services/core-api/app/models/legacy_link.py services/core-api/app/models/__init__.py services/core-api/tests/test_legacy_link_model.py
git commit -m "feat: add LegacyLink and LegacyLinkShare models"
```

---

### Task 13: Alembic Migration — Create legacy_links and legacy_link_shares Tables

**Files:**
- Modify: `services/core-api/alembic/env.py`
- Create: Migration file (auto-generated)

**Step 1: Add imports to alembic env.py**

Add `LegacyLink, LegacyLinkShare` to the import block.

**Step 2: Generate migration**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic revision --autogenerate -m "add_legacy_links_tables"`

**Step 3: Review and apply**

Run: `uv run alembic upgrade head`

**Step 4: Verify tables exist**

Run:
```bash
docker compose -f infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\dt legacy_link*"
```

**Step 5: Commit**

```bash
git add services/core-api/alembic/
git commit -m "feat: migration to create legacy_links and legacy_link_shares tables"
```

---

### Task 14: Legacy Link Pydantic Schemas

**Files:**
- Create: `services/core-api/app/schemas/legacy_link.py`
- Test: `services/core-api/tests/test_legacy_link_schemas.py`

**Step 1: Write failing test, then implement schemas**

Create `services/core-api/app/schemas/legacy_link.py`:

```python
"""Pydantic schemas for Legacy Link API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class LegacyLinkCreate(BaseModel):
    """Schema for creating a link request."""

    target_legacy_id: UUID = Field(
        ..., description="Legacy to request a link with"
    )
    person_id: UUID = Field(
        ..., description="Shared Person ID"
    )


class LegacyLinkRespond(BaseModel):
    """Schema for responding to a link request."""

    action: Literal["accept", "reject"] = Field(
        ..., description="Accept or reject the link request"
    )


class LegacyLinkShareCreate(BaseModel):
    """Schema for sharing a resource via a link."""

    resource_type: Literal["story", "media"] = Field(
        ..., description="Type of resource to share"
    )
    resource_id: UUID = Field(
        ..., description="ID of the story or media to share"
    )


class LegacyLinkShareModeUpdate(BaseModel):
    """Schema for updating share mode."""

    mode: Literal["selective", "all"] = Field(
        ..., description="Share mode: selective or all"
    )


class LegacyLinkShareResponse(BaseModel):
    """Schema for a shared resource."""

    id: UUID
    resource_type: str
    resource_id: UUID
    source_legacy_id: UUID
    shared_at: datetime
    shared_by: UUID

    model_config = {"from_attributes": True}


class LegacyLinkResponse(BaseModel):
    """Schema for legacy link response."""

    id: UUID
    person_id: UUID
    requester_legacy_id: UUID
    target_legacy_id: UUID
    status: str
    requester_share_mode: str
    target_share_mode: str
    requested_by: UUID
    responded_by: UUID | None
    requested_at: datetime
    responded_at: datetime | None
    revoked_at: datetime | None

    # Enriched fields (populated by service)
    requester_legacy_name: str | None = None
    target_legacy_name: str | None = None
    person_name: str | None = None

    model_config = {"from_attributes": True}
```

**Step 2: Write test, run, validate, commit**

Follow standard TDD pattern. Test that schemas validate correctly, reject bad input.

```bash
git add services/core-api/app/schemas/legacy_link.py services/core-api/tests/test_legacy_link_schemas.py
git commit -m "feat: add LegacyLink Pydantic schemas"
```

---

### Task 15: Legacy Link Service

**Files:**
- Create: `services/core-api/app/services/legacy_link.py`
- Test: `services/core-api/tests/test_legacy_link_service.py`

This is the core business logic. Implement the following functions:

1. `create_link_request(db, user_id, data)` — validate both legacies share person_id, check requester role, create pending link, send notification
2. `respond_to_link(db, user_id, link_id, action)` — check target creator/admin role, update status
3. `revoke_link(db, user_id, link_id)` — check either side creator/admin, set revoked
4. `update_share_mode(db, user_id, link_id, mode)` — check caller's side, update share mode
5. `share_resource(db, user_id, link_id, resource_type, resource_id)` — validate link active, validate resource belongs to caller's legacy
6. `unshare_resource(db, user_id, link_id, share_id)` — remove share record
7. `list_links_for_user(db, user_id)` — all links for legacies user is creator/admin of
8. `get_link_detail(db, user_id, link_id)` — single link with access check
9. `list_shares(db, user_id, link_id)` — list shared resources for a link

Follow the patterns in `services/core-api/app/services/legacy.py` for:
- `AsyncSession` parameter
- `check_legacy_access()` for role validation
- `HTTPException` for errors
- Logger usage
- Notification creation via `services/notification.py`

**Key validation rules:**
- Both legacies must reference same `person_id`
- Requester must be creator/admin of requesting legacy
- Responder must be creator/admin of target legacy
- Cannot link a legacy to itself
- Cannot create duplicate link (unique constraint handles this)
- Re-request after rejection: check `responded_at` + 30 days

Test each function independently with TDD.

```bash
git add services/core-api/app/services/legacy_link.py services/core-api/tests/test_legacy_link_service.py
git commit -m "feat: add Legacy Link service with full CRUD and validation"
```

---

### Task 16: Legacy Link API Routes

**Files:**
- Create: `services/core-api/app/routes/legacy_link.py`
- Modify: `services/core-api/app/main.py`
- Test: `services/core-api/tests/test_legacy_link_api.py`

Implement all endpoints from the design doc:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/legacy-links/` | POST | Create link request |
| `GET /api/legacy-links/` | GET | List user's links |
| `GET /api/legacy-links/{id}` | GET | Get link detail |
| `PATCH /api/legacy-links/{id}/respond` | PATCH | Accept/reject |
| `PATCH /api/legacy-links/{id}/revoke` | PATCH | Revoke active link |
| `PATCH /api/legacy-links/{id}/share-mode` | PATCH | Update share mode |
| `POST /api/legacy-links/{id}/shares` | POST | Share resource |
| `DELETE /api/legacy-links/{id}/shares/{share_id}` | DELETE | Unshare |
| `GET /api/legacy-links/{id}/shares` | GET | List shares |

Follow patterns from `services/core-api/app/routes/legacy.py`:
- Router setup with prefix/tags
- `require_auth(request)` for auth
- `Depends(get_db)` for DB session
- Response models in decorators

Register in `main.py`:
```python
from .routes.legacy_link import router as legacy_link_router
app.include_router(legacy_link_router)
```

Test all endpoints:
- Auth required (401 without)
- Permission checks (403 for wrong role)
- State machine transitions (pending → active, pending → rejected, active → revoked)
- Invalid state transitions (reject an active link → 400)
- Share mode changes

```bash
git add services/core-api/app/routes/legacy_link.py services/core-api/app/main.py services/core-api/tests/test_legacy_link_api.py
git commit -m "feat: add Legacy Link API endpoints"
```

---

### Task 17: Update Story Listing to Include Shared Stories

**Files:**
- Modify: `services/core-api/app/services/story.py`
- Test: `services/core-api/tests/test_story_sharing.py`

This is the critical integration point. When listing stories for a legacy, include stories shared from linked legacies.

**Key changes:**

1. Add a helper function `get_shared_story_ids(db, legacy_id)` that returns story IDs shared to this legacy via active links (both selective and all modes)
2. Modify the story listing query to UNION own stories with shared stories
3. Add a `shared_from` field to the story response schema to indicate source legacy

**The query logic:**

```python
async def get_shared_story_ids(
    db: AsyncSession, legacy_id: UUID
) -> tuple[set[UUID], dict[UUID, str]]:
    """Get story IDs shared to this legacy via active links.

    Returns:
        Tuple of (story_ids, story_id_to_source_legacy_name mapping)
    """
    from ..models.legacy_link import LegacyLink, LegacyLinkShare

    # Find active links where this legacy is either requester or target
    links_result = await db.execute(
        select(LegacyLink)
        .options(
            selectinload(LegacyLink.requester_legacy),
            selectinload(LegacyLink.target_legacy),
        )
        .where(
            LegacyLink.status == "active",
            or_(
                LegacyLink.requester_legacy_id == legacy_id,
                LegacyLink.target_legacy_id == legacy_id,
            ),
        )
    )
    links = links_result.scalars().all()

    shared_ids: set[UUID] = set()
    source_map: dict[UUID, str] = {}

    for link in links:
        # Determine which side is "other"
        if link.requester_legacy_id == legacy_id:
            other_legacy = link.target_legacy
            other_share_mode = link.target_share_mode
        else:
            other_legacy = link.requester_legacy
            other_share_mode = link.requester_share_mode

        source_name = other_legacy.name if other_legacy.visibility == "public" else "another legacy"

        if other_share_mode == "all":
            # Get all story IDs from the other legacy
            stories_result = await db.execute(
                select(StoryLegacy.story_id).where(
                    StoryLegacy.legacy_id == other_legacy.id
                )
            )
            for row in stories_result:
                shared_ids.add(row[0])
                source_map[row[0]] = source_name
        else:
            # Selective: use legacy_link_shares
            shares_result = await db.execute(
                select(LegacyLinkShare.resource_id).where(
                    LegacyLinkShare.legacy_link_id == link.id,
                    LegacyLinkShare.source_legacy_id == other_legacy.id,
                    LegacyLinkShare.resource_type == "story",
                )
            )
            for row in shares_result:
                shared_ids.add(row[0])
                source_map[row[0]] = source_name

    return shared_ids, source_map
```

Test with:
- Two legacies linked with selective mode, verify only shared stories appear
- Two legacies linked with all mode, verify all stories appear
- Revoked link, verify no shared stories
- Pending link, verify no shared stories

```bash
git add services/core-api/app/services/story.py services/core-api/tests/test_story_sharing.py
git commit -m "feat: include shared stories from linked legacies in story listing"
```

---

### Task 18: Update RAG Retrieval for Linked Legacy Context

**Files:**
- Modify: `services/core-api/app/services/retrieval.py`
- Test: `services/core-api/tests/test_retrieval_shared.py`

**Key change:** Expand the `retrieve_context()` function to include story chunks from linked legacies.

After the existing query that fetches chunks from the primary legacy, add a second query for shared chunks:

```python
# In retrieve_context(), after primary legacy chunks:

# 4. Get chunks from linked legacies
from ..models.legacy_link import LegacyLink, LegacyLinkShare
from sqlalchemy import or_

linked_result = await db.execute(
    select(LegacyLink).where(
        LegacyLink.status == "active",
        or_(
            LegacyLink.requester_legacy_id == legacy_id,
            LegacyLink.target_legacy_id == legacy_id,
        ),
    )
)
active_links = linked_result.scalars().all()

for link in active_links:
    if link.requester_legacy_id == legacy_id:
        other_legacy_id = link.target_legacy_id
        other_share_mode = link.target_share_mode
    else:
        other_legacy_id = link.requester_legacy_id
        other_share_mode = link.requester_share_mode

    if other_share_mode == "all":
        # Query chunks from other legacy (public + private only, not personal)
        # ... similar vector search with legacy_id = other_legacy_id
        pass
    else:
        # Query only shared story chunks
        shared_story_ids = await db.execute(
            select(LegacyLinkShare.resource_id).where(
                LegacyLinkShare.legacy_link_id == link.id,
                LegacyLinkShare.source_legacy_id == other_legacy_id,
                LegacyLinkShare.resource_type == "story",
            )
        )
        # ... vector search filtered to those story_ids
        pass
```

Combine all chunks, re-rank by similarity, return top-k.

```bash
git add services/core-api/app/services/retrieval.py services/core-api/tests/test_retrieval_shared.py
git commit -m "feat: expand RAG retrieval to include shared stories from linked legacies"
```

---

### Task 19: Frontend — Legacy Link Management UI

**Files:**
- Create: `apps/web/src/features/legacy-link/api/legacyLinks.ts`
- Create: `apps/web/src/features/legacy-link/hooks/useLegacyLinks.ts`
- Create: `apps/web/src/features/legacy-link/components/LegacyLinkPanel.tsx`
- Create: `apps/web/src/features/legacy-link/components/LinkRequestCard.tsx`
- Create: `apps/web/src/features/legacy-link/components/ShareManager.tsx`
- Modify: Legacy settings/detail page to include link management

This task builds the frontend for:
1. **Link management panel** — visible in legacy settings to creator/admin
2. **Pending requests** — accept/reject UI
3. **Share manager** — toggle share mode, select stories to share
4. **Shared story indicators** — badge on story cards showing "Shared from [Legacy Name]"

Use existing UI patterns from the codebase:
- TanStack Query hooks pattern from `apps/web/src/features/legacy/hooks/useLegacies.ts`
- API client pattern from `apps/web/src/features/legacy/api/legacies.ts`
- Component styling with Tailwind classes matching existing theme

```bash
git add apps/web/src/features/legacy-link/
git commit -m "feat: add legacy link management UI"
```

---

### Task 20: Frontend — Shared Story Indicators in Story List

**Files:**
- Modify: Story list component (wherever stories are rendered for a legacy)
- Modify: Story API response type to include `shared_from` field

Add a visual indicator when a story is shared from a linked legacy:

```tsx
{story.shared_from && (
  <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
    <Link2 className="size-3" />
    Shared from {story.shared_from}
  </span>
)}
```

Shared stories should not show edit/delete buttons — they're read-only.

```bash
git add apps/web/src/features/story/
git commit -m "feat: add shared story indicators and read-only enforcement"
```

---

### Task 21: Run Full Test Suite and Validate

**Files:** None (validation only)

**Step 1: Run backend tests**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest -v`
Expected: ALL tests pass

**Step 2: Run backend validation**

Run: `just validate-backend`
Expected: ruff + mypy clean

**Step 3: Run frontend build**

Run: `cd /apps/mosaic-life/apps/web && npm run build`
Expected: Build succeeds

**Step 4: Run frontend tests**

Run: `cd /apps/mosaic-life/apps/web && npm run test`
Expected: Tests pass

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address test failures and validation issues"
```

---

## Summary

| Phase | Tasks | What Ships |
|-------|-------|-----------|
| **1a: Person Entity** | 1-8 | Person table, person_id on legacies, migrations, auto-create Person on legacy creation |
| **1b: Identity Matching** | 9-11 | Match candidates service, API endpoint, frontend inline suggestions |
| **1c: Legacy Linking** | 12-21 | Link models, migrations, link service, API endpoints, shared story access, RAG expansion, frontend UI |

**Total: 21 tasks**

Key commit boundaries create clean rollback points at each phase transition.
