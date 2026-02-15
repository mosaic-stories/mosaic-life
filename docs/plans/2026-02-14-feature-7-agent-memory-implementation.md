# Feature 7: Agent Memory System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add rolling conversation summarization (vectorized for RAG) and per-user-per-legacy fact extraction with private/shared visibility to the agent memory system.

**Architecture:** Messages beyond the 20-message context window are summarized by the LLM, embedded, and stored in a dedicated `conversation_chunks` table for semantic retrieval. Facts about the legacy person are extracted in the same LLM call and stored per-user-per-legacy in a `legacy_facts` table. Facts are injected into the system prompt; conversation summaries are retrieved via RAG alongside story chunks.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, pgvector, Pydantic v2, pytest + pytest-asyncio, OpenTelemetry

**Design doc:** `docs/plans/2026-02-14-feature-7-agent-memory-system-design.md`

---

## Implementation Status

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| Task 1: Alembic Migration | DONE | `c75cf73` | Tables created, upgrade/downgrade verified on Postgres |
| Task 2: SQLAlchemy Models | DONE | `6041a17` | 4 tests pass, 2 cascade tests skipped (SQLite FK limitation) |
| Task 3: Pydantic Schemas | DONE | `a6b3469` | 5 tests pass |
| Task 4: Memory Service — Fact CRUD | TODO | | |
| Task 5: Memory Service — Summarization | TODO | | |
| Task 6: System Prompt Facts Injection | TODO | | |
| Task 7: Wire Memory Into Turn Prep | TODO | | |
| Task 8: Summarization Trigger in Route | TODO | | |
| Task 9: Fact Management API Endpoints | TODO | | |
| Task 10: Validation & Full Test Suite | TODO | | |

**Last updated:** 2026-02-15

---

## Task 1: Alembic Migration — `conversation_chunks` and `legacy_facts` Tables

**Files:**
- Create: `services/core-api/alembic/versions/f7a1_add_conversation_chunks_and_legacy_facts.py`

**Step 1: Create the migration file**

```python
"""add_conversation_chunks_and_legacy_facts

Revision ID: f7a1_memory
Revises: e04738d48e96
Create Date: 2026-02-14

"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "f7a1_memory"
down_revision = "e04738d48e96"
branch_labels = None
depends_on = None

EMBEDDING_DIM = 1024


def upgrade() -> None:
    # -- conversation_chunks --
    op.create_table(
        "conversation_chunks",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("message_range_start", sa.Integer(), nullable=False),
        sa.Column("message_range_end", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id",
            "message_range_start",
            "message_range_end",
            name="uq_conversation_chunks_range",
        ),
    )

    op.create_index(
        "ix_conversation_chunks_user_legacy",
        "conversation_chunks",
        ["user_id", "legacy_id"],
    )

    # HNSW vector index
    op.execute(
        """
        CREATE INDEX conversation_chunks_embedding_idx
        ON conversation_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """
    )

    # -- legacy_facts --
    op.create_table(
        "legacy_facts",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "visibility",
            sa.String(10),
            nullable=False,
            server_default="private",
        ),
        sa.Column("source_conversation_id", sa.UUID(), nullable=True),
        sa.Column(
            "extracted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_conversation_id"],
            ["ai_conversations.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "visibility IN ('private', 'shared')", name="ck_legacy_facts_visibility"
        ),
    )

    op.create_index(
        "ix_legacy_facts_legacy_user", "legacy_facts", ["legacy_id", "user_id"]
    )
    op.create_index(
        "ix_legacy_facts_legacy_visibility",
        "legacy_facts",
        ["legacy_id", "visibility"],
    )


def downgrade() -> None:
    op.drop_index("ix_legacy_facts_legacy_visibility", table_name="legacy_facts")
    op.drop_index("ix_legacy_facts_legacy_user", table_name="legacy_facts")
    op.drop_table("legacy_facts")

    op.execute("DROP INDEX IF EXISTS conversation_chunks_embedding_idx")
    op.drop_index(
        "ix_conversation_chunks_user_legacy", table_name="conversation_chunks"
    )
    op.drop_table("conversation_chunks")
```

**Step 2: Verify migration applies**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic upgrade head`
Expected: Tables created, no errors.

**Step 3: Verify downgrade works**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic downgrade -1 && uv run alembic upgrade head`
Expected: Clean downgrade and re-upgrade.

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/f7a1_add_conversation_chunks_and_legacy_facts.py
git commit -m "feat(db): add conversation_chunks and legacy_facts tables for agent memory"
```

---

## Task 2: SQLAlchemy Models — `ConversationChunk` and `LegacyFact`

**Files:**
- Create: `services/core-api/app/models/memory.py`
- Modify: `services/core-api/app/models/__init__.py` (add exports)
- Test: `services/core-api/tests/models/test_memory_models.py`

**Step 1: Write failing tests**

Create `services/core-api/tests/models/test_memory_models.py`:

```python
"""Tests for agent memory models."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.memory import ConversationChunk, LegacyFact
from app.models.user import User


class TestConversationChunk:
    """Tests for ConversationChunk model."""

    @pytest.mark.asyncio
    async def test_create_conversation_chunk(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating a conversation chunk with embedding."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # SQLite doesn't support pgvector, so store as empty list placeholder
        chunk = ConversationChunk(
            conversation_id=conv.id,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            content="User discussed childhood memories of fishing trips.",
            embedding=[0.1] * 1024,
            message_range_start=0,
            message_range_end=20,
        )
        db_session.add(chunk)
        await db_session.commit()
        await db_session.refresh(chunk)

        assert chunk.id is not None
        assert chunk.content == "User discussed childhood memories of fishing trips."
        assert chunk.message_range_start == 0
        assert chunk.message_range_end == 20

    @pytest.mark.asyncio
    async def test_conversation_chunk_cascade_delete(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that deleting conversation cascades to chunks."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        chunk = ConversationChunk(
            conversation_id=conv.id,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            content="Summary content",
            embedding=[0.1] * 1024,
            message_range_start=0,
            message_range_end=10,
        )
        db_session.add(chunk)
        await db_session.commit()

        chunk_id = chunk.id

        # Delete conversation
        await db_session.delete(conv)
        await db_session.commit()

        # Chunk should be gone
        result = await db_session.execute(
            select(ConversationChunk).where(ConversationChunk.id == chunk_id)
        )
        assert result.scalar_one_or_none() is None


class TestLegacyFact:
    """Tests for LegacyFact model."""

    @pytest.mark.asyncio
    async def test_create_legacy_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating a legacy fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved fly fishing on weekends",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()
        await db_session.refresh(fact)

        assert fact.id is not None
        assert fact.category == "hobby"
        assert fact.visibility == "private"

    @pytest.mark.asyncio
    async def test_legacy_fact_defaults_to_private(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that visibility defaults to private."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="personality",
            content="Was very generous",
        )
        db_session.add(fact)
        await db_session.commit()
        await db_session.refresh(fact)

        assert fact.visibility == "private"

    @pytest.mark.asyncio
    async def test_legacy_fact_with_source_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test fact linked to source conversation."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="milestone",
            content="Graduated from MIT in 1985",
            source_conversation_id=conv.id,
        )
        db_session.add(fact)
        await db_session.commit()
        await db_session.refresh(fact)

        assert fact.source_conversation_id == conv.id

    @pytest.mark.asyncio
    async def test_legacy_cascade_deletes_facts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that deleting legacy cascades to facts."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved gardening",
        )
        db_session.add(fact)
        await db_session.commit()
        fact_id = fact.id

        await db_session.delete(test_legacy)
        await db_session.commit()

        result = await db_session.execute(
            select(LegacyFact).where(LegacyFact.id == fact_id)
        )
        assert result.scalar_one_or_none() is None
```

**Step 2: Run tests to verify they fail**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/models/test_memory_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'ConversationChunk' from 'app.models.memory'`

**Step 3: Write the models**

Create `services/core-api/app/models/memory.py`:

```python
"""Agent memory models for conversation summaries and legacy facts."""

from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector  # type: ignore[import-untyped]
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base
from .knowledge import EMBEDDING_DIM


class ConversationChunk(Base):
    """Vectorized summary of a conversation segment for RAG retrieval."""

    __tablename__ = "conversation_chunks"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    conversation_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)

    embedding: Mapped[list[float]] = mapped_column(
        Vector(EMBEDDING_DIM), nullable=False
    )

    message_range_start: Mapped[int] = mapped_column(Integer, nullable=False)
    message_range_end: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<ConversationChunk(id={self.id}, "
            f"conversation_id={self.conversation_id}, "
            f"range={self.message_range_start}-{self.message_range_end})>"
        )


class LegacyFact(Base):
    """Per-user-per-legacy factual observation extracted from conversations."""

    __tablename__ = "legacy_facts"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    category: Mapped[str] = mapped_column(String(50), nullable=False)

    content: Mapped[str] = mapped_column(Text, nullable=False)

    visibility: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        server_default="private",
        default="private",
    )

    source_conversation_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="SET NULL"),
        nullable=True,
    )

    extracted_at: Mapped[datetime] = mapped_column(
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
        return f"<LegacyFact(id={self.id}, category={self.category}, visibility={self.visibility})>"
```

**Step 4: Update `models/__init__.py`**

Add to `services/core-api/app/models/__init__.py`:

```python
from .memory import ConversationChunk, LegacyFact
```

And add `"ConversationChunk"` and `"LegacyFact"` to the `__all__` list.

**Step 5: Run tests to verify they pass**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/models/test_memory_models.py -v`
Expected: All PASS (note: SQLite doesn't enforce pgvector constraints, so model tests validate column mapping, not vector search)

**Step 6: Commit**

```bash
git add services/core-api/app/models/memory.py services/core-api/app/models/__init__.py services/core-api/tests/models/test_memory_models.py
git commit -m "feat(models): add ConversationChunk and LegacyFact models for agent memory"
```

---

## Task 3: Pydantic Schemas — Fact API Request/Response Models

**Files:**
- Create: `services/core-api/app/schemas/memory.py`
- Test: `services/core-api/tests/schemas/test_memory_schemas.py`

**Step 1: Write failing tests**

Create `services/core-api/tests/schemas/__init__.py` (empty) and `services/core-api/tests/schemas/test_memory_schemas.py`:

```python
"""Tests for memory schemas."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.memory import (
    FactResponse,
    FactVisibilityUpdate,
)


class TestFactResponse:
    """Tests for FactResponse schema."""

    def test_valid_fact_response(self):
        """Test creating a valid fact response."""
        fact = FactResponse(
            id=uuid4(),
            legacy_id=uuid4(),
            user_id=uuid4(),
            category="hobby",
            content="Loved fishing",
            visibility="private",
            source_conversation_id=None,
            extracted_at="2026-02-14T00:00:00Z",
            updated_at="2026-02-14T00:00:00Z",
        )
        assert fact.category == "hobby"
        assert fact.visibility == "private"

    def test_fact_response_with_shared_visibility(self):
        """Test shared visibility is accepted."""
        fact = FactResponse(
            id=uuid4(),
            legacy_id=uuid4(),
            user_id=uuid4(),
            category="personality",
            content="Very generous",
            visibility="shared",
            source_conversation_id=uuid4(),
            extracted_at="2026-02-14T00:00:00Z",
            updated_at="2026-02-14T00:00:00Z",
        )
        assert fact.visibility == "shared"


class TestFactVisibilityUpdate:
    """Tests for FactVisibilityUpdate schema."""

    def test_valid_private(self):
        """Test setting visibility to private."""
        update = FactVisibilityUpdate(visibility="private")
        assert update.visibility == "private"

    def test_valid_shared(self):
        """Test setting visibility to shared."""
        update = FactVisibilityUpdate(visibility="shared")
        assert update.visibility == "shared"

    def test_rejects_invalid_visibility(self):
        """Test that invalid visibility values are rejected."""
        with pytest.raises(ValidationError):
            FactVisibilityUpdate(visibility="public")
```

**Step 2: Run tests to verify they fail**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/schemas/test_memory_schemas.py -v`
Expected: FAIL — `ImportError`

**Step 3: Write the schemas**

Create `services/core-api/app/schemas/memory.py`:

```python
"""Pydantic schemas for agent memory API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FactResponse(BaseModel):
    """Schema for legacy fact response."""

    id: UUID
    legacy_id: UUID
    user_id: UUID
    category: str
    content: str
    visibility: Literal["private", "shared"]
    source_conversation_id: UUID | None
    extracted_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FactVisibilityUpdate(BaseModel):
    """Schema for updating fact visibility."""

    visibility: Literal["private", "shared"] = Field(
        ..., description="New visibility: 'private' or 'shared'"
    )


class SummarizeExtractResponse(BaseModel):
    """Parsed response from the summarize-and-extract LLM call."""

    summary: str
    facts: list[dict[str, str]] = Field(
        default_factory=list,
        description="List of dicts with 'category' and 'content' keys",
    )
```

**Step 4: Run tests to verify they pass**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/schemas/test_memory_schemas.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/schemas/memory.py services/core-api/tests/schemas/
git commit -m "feat(schemas): add memory schemas for fact API and summarization"
```

---

## Task 4: Memory Service — Fact CRUD Operations

**Files:**
- Create: `services/core-api/app/services/memory.py`
- Test: `services/core-api/tests/services/test_memory_service.py`

**Step 1: Write failing tests**

Create `services/core-api/tests/services/test_memory_service.py`:

```python
"""Tests for memory service layer."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.memory import LegacyFact
from app.models.user import User
from app.services import memory as memory_service


class TestGetFactsForContext:
    """Tests for get_facts_for_context."""

    @pytest.mark.asyncio
    async def test_returns_users_private_facts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that user sees their own private facts."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved fishing",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        facts = await memory_service.get_facts_for_context(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )

        assert len(facts) == 1
        assert facts[0].content == "Loved fishing"

    @pytest.mark.asyncio
    async def test_returns_shared_facts_from_other_users(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that user sees shared facts from others."""
        # User 2's shared fact
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            category="personality",
            content="Very generous person",
            visibility="shared",
        )
        db_session.add(fact)
        await db_session.commit()

        # User 1 should see it
        facts = await memory_service.get_facts_for_context(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )

        assert len(facts) == 1
        assert facts[0].content == "Very generous person"

    @pytest.mark.asyncio
    async def test_does_not_return_other_users_private_facts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that user cannot see others' private facts."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            category="personality",
            content="Secret trait",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        facts = await memory_service.get_facts_for_context(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )

        assert len(facts) == 0


class TestListUserFacts:
    """Tests for list_user_facts."""

    @pytest.mark.asyncio
    async def test_returns_users_own_facts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test listing user's own facts for a legacy."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved painting",
        )
        db_session.add(fact)
        await db_session.commit()

        facts = await memory_service.list_user_facts(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )

        assert len(facts) == 1
        assert facts[0].content == "Loved painting"


class TestDeleteFact:
    """Tests for delete_fact."""

    @pytest.mark.asyncio
    async def test_owner_can_delete_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that fact owner can delete their fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="To be deleted",
        )
        db_session.add(fact)
        await db_session.commit()

        await memory_service.delete_fact(
            db=db_session,
            fact_id=fact.id,
            user_id=test_user.id,
        )

        remaining = await memory_service.list_user_facts(
            db=db_session,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
        )
        assert len(remaining) == 0

    @pytest.mark.asyncio
    async def test_non_owner_cannot_delete_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that non-owner cannot delete someone else's fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Not yours to delete",
        )
        db_session.add(fact)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await memory_service.delete_fact(
                db=db_session,
                fact_id=fact.id,
                user_id=test_user_2.id,
            )
        assert exc.value.status_code == 404


class TestUpdateFactVisibility:
    """Tests for update_fact_visibility."""

    @pytest.mark.asyncio
    async def test_owner_can_share_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that owner can change visibility to shared."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Shareable fact",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        updated = await memory_service.update_fact_visibility(
            db=db_session,
            fact_id=fact.id,
            user_id=test_user.id,
            visibility="shared",
        )

        assert updated.visibility == "shared"

    @pytest.mark.asyncio
    async def test_owner_can_unshare_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that owner can change visibility back to private."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Was shared",
            visibility="shared",
        )
        db_session.add(fact)
        await db_session.commit()

        updated = await memory_service.update_fact_visibility(
            db=db_session,
            fact_id=fact.id,
            user_id=test_user.id,
            visibility="private",
        )

        assert updated.visibility == "private"

    @pytest.mark.asyncio
    async def test_non_owner_cannot_change_visibility(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that non-owner cannot change visibility."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Not yours",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await memory_service.update_fact_visibility(
                db=db_session,
                fact_id=fact.id,
                user_id=test_user_2.id,
                visibility="shared",
            )
        assert exc.value.status_code == 404
```

**Step 2: Run tests to verify they fail**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_memory_service.py -v`
Expected: FAIL — `ImportError: cannot import name 'memory' from 'app.services'`

**Step 3: Write the memory service**

Create `services/core-api/app/services/memory.py`:

```python
"""Service layer for agent memory operations."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.memory import LegacyFact

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.memory")


async def get_facts_for_context(
    db: AsyncSession,
    legacy_id: UUID,
    user_id: UUID,
) -> list[LegacyFact]:
    """Get facts for system prompt injection.

    Returns the user's own private facts plus all shared facts
    from any user for this legacy.

    Args:
        db: Database session.
        legacy_id: Legacy to get facts for.
        user_id: Current user.

    Returns:
        List of LegacyFact objects.
    """
    with tracer.start_as_current_span("memory.get_facts_for_context") as span:
        span.set_attribute("legacy_id", str(legacy_id))
        span.set_attribute("user_id", str(user_id))

        result = await db.execute(
            select(LegacyFact)
            .where(
                LegacyFact.legacy_id == legacy_id,
                or_(
                    LegacyFact.user_id == user_id,
                    LegacyFact.visibility == "shared",
                ),
            )
            .order_by(LegacyFact.extracted_at)
        )
        facts = list(result.scalars().all())

        span.set_attribute("facts_count", len(facts))
        return facts


async def list_user_facts(
    db: AsyncSession,
    legacy_id: UUID,
    user_id: UUID,
) -> list[LegacyFact]:
    """List a user's own facts for a legacy (for the review UI).

    Args:
        db: Database session.
        legacy_id: Legacy to list facts for.
        user_id: User whose facts to list.

    Returns:
        List of the user's own LegacyFact objects.
    """
    result = await db.execute(
        select(LegacyFact)
        .where(
            LegacyFact.legacy_id == legacy_id,
            LegacyFact.user_id == user_id,
        )
        .order_by(LegacyFact.extracted_at)
    )
    return list(result.scalars().all())


async def delete_fact(
    db: AsyncSession,
    fact_id: UUID,
    user_id: UUID,
) -> None:
    """Delete a fact (ownership check enforced).

    Args:
        db: Database session.
        fact_id: Fact to delete.
        user_id: User requesting deletion.

    Raises:
        HTTPException: 404 if fact not found or not owned by user.
    """
    result = await db.execute(
        select(LegacyFact).where(
            LegacyFact.id == fact_id,
            LegacyFact.user_id == user_id,
        )
    )
    fact = result.scalar_one_or_none()

    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    await db.delete(fact)
    await db.commit()

    logger.info(
        "memory.fact.deleted",
        extra={"fact_id": str(fact_id), "user_id": str(user_id)},
    )


async def update_fact_visibility(
    db: AsyncSession,
    fact_id: UUID,
    user_id: UUID,
    visibility: str,
) -> LegacyFact:
    """Update fact visibility (ownership check enforced).

    Args:
        db: Database session.
        fact_id: Fact to update.
        user_id: User requesting the change.
        visibility: New visibility ('private' or 'shared').

    Returns:
        Updated LegacyFact.

    Raises:
        HTTPException: 404 if fact not found or not owned by user.
    """
    result = await db.execute(
        select(LegacyFact).where(
            LegacyFact.id == fact_id,
            LegacyFact.user_id == user_id,
        )
    )
    fact = result.scalar_one_or_none()

    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    fact.visibility = visibility
    fact.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(fact)

    logger.info(
        "memory.fact.visibility_updated",
        extra={
            "fact_id": str(fact_id),
            "user_id": str(user_id),
            "visibility": visibility,
        },
    )

    return fact
```

**Step 4: Run tests to verify they pass**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_memory_service.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/memory.py services/core-api/tests/services/test_memory_service.py
git commit -m "feat(services): add memory service with fact CRUD operations"
```

---

## Task 5: Memory Service — Summarization and Fact Extraction Logic

**Files:**
- Modify: `services/core-api/app/services/memory.py` (add summarization functions)
- Test: `services/core-api/tests/services/test_memory_summarization.py`

**Step 1: Write failing tests**

Create `services/core-api/tests/services/test_memory_summarization.py`:

```python
"""Tests for memory summarization and fact extraction."""

import json
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.memory import ConversationChunk, LegacyFact
from app.models.user import User
from app.services import memory as memory_service
from app.services.memory import (
    SUMMARIZATION_THRESHOLD,
    parse_summary_response,
)


class TestParseSummaryResponse:
    """Tests for JSON response parsing."""

    def test_parses_valid_response(self):
        """Test parsing a well-formed LLM response."""
        raw = json.dumps(
            {
                "summary": "User discussed fishing memories.",
                "facts": [
                    {"category": "hobby", "content": "Loved fly fishing"},
                    {"category": "personality", "content": "Was very patient"},
                ],
            }
        )
        result = parse_summary_response(raw)
        assert result.summary == "User discussed fishing memories."
        assert len(result.facts) == 2

    def test_returns_none_for_malformed_json(self):
        """Test that malformed JSON returns None."""
        result = parse_summary_response("not valid json {{{")
        assert result is None

    def test_returns_none_for_missing_summary(self):
        """Test that missing 'summary' key returns None."""
        raw = json.dumps({"facts": []})
        result = parse_summary_response(raw)
        assert result is None

    def test_handles_empty_facts(self):
        """Test response with no facts extracted."""
        raw = json.dumps({"summary": "General chat, no facts.", "facts": []})
        result = parse_summary_response(raw)
        assert result is not None
        assert result.summary == "General chat, no facts."
        assert result.facts == []


class TestMaybeSummarize:
    """Tests for summarization trigger logic."""

    @pytest.mark.asyncio
    async def test_does_not_summarize_below_threshold(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that summarization is skipped when below threshold."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # Add fewer messages than threshold
        for i in range(5):
            db_session.add(
                AIMessage(conversation_id=conv.id, role="user", content=f"Msg {i}")
            )
        await db_session.commit()

        await memory_service.maybe_summarize(
            db=db_session,
            conversation_id=conv.id,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        # No chunks should be created
        count = await db_session.execute(
            select(func.count())
            .select_from(ConversationChunk)
            .where(ConversationChunk.conversation_id == conv.id)
        )
        assert (count.scalar() or 0) == 0

    @pytest.mark.asyncio
    async def test_summarizes_when_above_threshold(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that summarization triggers when messages exceed threshold."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # Add more messages than threshold
        for i in range(SUMMARIZATION_THRESHOLD + 5):
            role = "user" if i % 2 == 0 else "assistant"
            db_session.add(
                AIMessage(
                    conversation_id=conv.id, role=role, content=f"Message {i}"
                )
            )
        await db_session.commit()

        # Mock the LLM and embedding providers
        mock_llm_response = json.dumps(
            {
                "summary": "User discussed various life memories.",
                "facts": [
                    {"category": "hobby", "content": "Enjoyed painting"},
                ],
            }
        )

        mock_embedding = [0.1] * 1024

        with (
            patch.object(
                memory_service,
                "_call_summarize_llm",
                new_callable=AsyncMock,
                return_value=mock_llm_response,
            ),
            patch.object(
                memory_service,
                "_embed_text",
                new_callable=AsyncMock,
                return_value=mock_embedding,
            ),
        ):
            await memory_service.maybe_summarize(
                db=db_session,
                conversation_id=conv.id,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
            )

        # Should have created a conversation chunk
        chunk_count = await db_session.execute(
            select(func.count())
            .select_from(ConversationChunk)
            .where(ConversationChunk.conversation_id == conv.id)
        )
        assert (chunk_count.scalar() or 0) == 1

        # Should have created a fact
        fact_count = await db_session.execute(
            select(func.count())
            .select_from(LegacyFact)
            .where(
                LegacyFact.legacy_id == test_legacy.id,
                LegacyFact.user_id == test_user.id,
            )
        )
        assert (fact_count.scalar() or 0) == 1

    @pytest.mark.asyncio
    async def test_idempotent_summarization(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that re-running summarization doesn't create duplicates."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        for i in range(SUMMARIZATION_THRESHOLD + 5):
            role = "user" if i % 2 == 0 else "assistant"
            db_session.add(
                AIMessage(
                    conversation_id=conv.id, role=role, content=f"Message {i}"
                )
            )
        await db_session.commit()

        mock_llm_response = json.dumps(
            {"summary": "Summary text.", "facts": []}
        )
        mock_embedding = [0.1] * 1024

        with (
            patch.object(
                memory_service,
                "_call_summarize_llm",
                new_callable=AsyncMock,
                return_value=mock_llm_response,
            ),
            patch.object(
                memory_service,
                "_embed_text",
                new_callable=AsyncMock,
                return_value=mock_embedding,
            ),
        ):
            # Run twice
            await memory_service.maybe_summarize(
                db=db_session,
                conversation_id=conv.id,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
            )
            await memory_service.maybe_summarize(
                db=db_session,
                conversation_id=conv.id,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
            )

        # Should still only have 1 chunk (same range)
        chunk_count = await db_session.execute(
            select(func.count())
            .select_from(ConversationChunk)
            .where(ConversationChunk.conversation_id == conv.id)
        )
        assert (chunk_count.scalar() or 0) == 1
```

**Step 2: Run tests to verify they fail**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_memory_summarization.py -v`
Expected: FAIL — `ImportError: cannot import name 'SUMMARIZATION_THRESHOLD'`

**Step 3: Add summarization logic to memory service**

Append to `services/core-api/app/services/memory.py`:

```python
# --- Constants ---
SUMMARIZATION_THRESHOLD = 30
BATCH_SIZE = 20

# --- Prompt ---
SUMMARIZE_AND_EXTRACT_PROMPT = """You are analyzing a conversation between a user and a memorial agent about {legacy_name}.

Given the following conversation messages, produce:
1. A concise summary (2-4 sentences) capturing the key topics discussed and any emotional tone.
2. A list of factual observations about {legacy_name} mentioned by the user.

For each fact, provide:
- category: one of [personality, hobby, relationship, milestone, occupation, preference, habit, other]
- content: a short factual statement (one sentence)

Only extract facts the user explicitly stated or clearly implied. Do not infer or speculate.

Respond in JSON:
{{"summary": "...", "facts": [{{"category": "...", "content": "..."}}]}}"""


def parse_summary_response(raw: str) -> SummarizeExtractResponse | None:
    """Parse the LLM's JSON response for summary and facts.

    Returns None if the response is malformed.
    """
    import json as json_mod

    try:
        data = json_mod.loads(raw)
    except (json_mod.JSONDecodeError, TypeError):
        logger.warning("memory.parse_summary.malformed_json")
        return None

    if "summary" not in data:
        logger.warning("memory.parse_summary.missing_summary")
        return None

    return SummarizeExtractResponse(
        summary=data["summary"],
        facts=data.get("facts", []),
    )


async def _call_summarize_llm(
    messages: list[dict[str, str]], legacy_name: str
) -> str:
    """Call the LLM to summarize messages and extract facts.

    This is a thin wrapper to make mocking straightforward in tests.
    """
    from ..providers.registry import get_provider_registry

    llm = get_provider_registry().get_llm_provider()
    prompt = SUMMARIZE_AND_EXTRACT_PROMPT.format(legacy_name=legacy_name)

    full_response = ""
    async for chunk in llm.stream_generate(
        messages=messages,
        system_prompt=prompt,
        model_id="",  # Use provider default
        max_tokens=1024,
    ):
        full_response += chunk

    return full_response


async def _embed_text(text: str) -> list[float]:
    """Embed a single text string. Thin wrapper for testability."""
    from ..providers.registry import get_provider_registry

    embedding_provider = get_provider_registry().get_embedding_provider()
    [embedding] = await embedding_provider.embed_texts([text])
    return embedding


async def maybe_summarize(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
    legacy_id: UUID,
    legacy_name: str = "",
) -> None:
    """Check if summarization is needed and perform it.

    Called as a background task after each message save. Summarizes the
    oldest unsummarized batch of messages when the unsummarized count
    exceeds SUMMARIZATION_THRESHOLD.

    Args:
        db: Database session.
        conversation_id: Conversation to check.
        user_id: User who owns the conversation.
        legacy_id: Legacy being discussed.
        legacy_name: Legacy name for the LLM prompt.
    """
    from ..models.ai import AIMessage
    from ..models.memory import ConversationChunk

    with tracer.start_as_current_span("memory.maybe_summarize") as span:
        span.set_attribute("conversation_id", str(conversation_id))

        # Count total messages
        count_result = await db.execute(
            select(func.count())
            .select_from(AIMessage)
            .where(AIMessage.conversation_id == conversation_id)
        )
        total_messages = count_result.scalar() or 0

        # Find last summarized range end
        last_range_result = await db.execute(
            select(func.coalesce(func.max(ConversationChunk.message_range_end), 0))
            .where(ConversationChunk.conversation_id == conversation_id)
        )
        last_summarized_end = last_range_result.scalar() or 0

        unsummarized_count = total_messages - last_summarized_end
        span.set_attribute("unsummarized_count", unsummarized_count)

        if unsummarized_count <= SUMMARIZATION_THRESHOLD:
            return

        # Fetch oldest unsummarized batch
        result = await db.execute(
            select(AIMessage)
            .where(
                AIMessage.conversation_id == conversation_id,
                ~AIMessage.blocked,
            )
            .order_by(AIMessage.created_at.asc())
            .offset(last_summarized_end)
            .limit(BATCH_SIZE)
        )
        messages_to_summarize = result.scalars().all()

        if not messages_to_summarize:
            return

        message_dicts = [
            {"role": m.role, "content": m.content}
            for m in messages_to_summarize
            if m.content and m.content.strip()
        ]

        # Call LLM for summary + fact extraction
        try:
            raw_response = await _call_summarize_llm(message_dicts, legacy_name)
        except Exception:
            logger.exception(
                "memory.summarize.llm_failed",
                extra={"conversation_id": str(conversation_id)},
            )
            return

        parsed = parse_summary_response(raw_response)
        if not parsed:
            return

        # Embed the summary
        try:
            embedding = await _embed_text(parsed.summary)
        except Exception:
            logger.exception(
                "memory.summarize.embedding_failed",
                extra={"conversation_id": str(conversation_id)},
            )
            return

        range_end = last_summarized_end + BATCH_SIZE

        # Store conversation chunk (unique constraint prevents duplicates)
        chunk = ConversationChunk(
            conversation_id=conversation_id,
            user_id=user_id,
            legacy_id=legacy_id,
            content=parsed.summary,
            embedding=embedding,
            message_range_start=last_summarized_end,
            message_range_end=range_end,
        )
        db.add(chunk)

        # Store extracted facts
        for fact_data in parsed.facts:
            category = fact_data.get("category", "other")
            content = fact_data.get("content", "")
            if content:
                fact = LegacyFact(
                    legacy_id=legacy_id,
                    user_id=user_id,
                    category=category,
                    content=content,
                    source_conversation_id=conversation_id,
                )
                db.add(fact)

        await db.commit()

        logger.info(
            "memory.summarize.complete",
            extra={
                "conversation_id": str(conversation_id),
                "range": f"{last_summarized_end}-{range_end}",
                "facts_extracted": len(parsed.facts),
            },
        )
```

Also add the import at the top of `memory.py`:

```python
from ..schemas.memory import SummarizeExtractResponse
```

And add `func` to the sqlalchemy import:

```python
from sqlalchemy import func, or_, select
```

**Step 4: Run tests to verify they pass**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_memory_summarization.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/memory.py services/core-api/tests/services/test_memory_summarization.py
git commit -m "feat(services): add conversation summarization and fact extraction to memory service"
```

---

## Task 6: Integration — System Prompt Facts Injection

**Files:**
- Modify: `services/core-api/app/config/personas.py:108-136` (`build_system_prompt`)
- Test: `services/core-api/tests/config/test_personas.py` (add new test)

**Step 1: Write failing test**

Add to `services/core-api/tests/config/test_personas.py`:

```python
class TestBuildSystemPromptWithFacts:
    """Tests for build_system_prompt with facts injection."""

    def test_includes_facts_in_prompt(self):
        """Test that facts are appended to system prompt."""
        from unittest.mock import MagicMock

        fact1 = MagicMock()
        fact1.category = "hobby"
        fact1.content = "Loved fly fishing"
        fact1.visibility = "private"

        fact2 = MagicMock()
        fact2.category = "personality"
        fact2.content = "Very generous"
        fact2.visibility = "shared"

        prompt = build_system_prompt("biographer", "John", facts=[fact1, fact2])

        assert prompt is not None
        assert "Loved fly fishing" in prompt
        assert "Very generous" in prompt
        assert "(shared)" in prompt
        assert "(personal)" in prompt

    def test_no_facts_section_when_empty(self):
        """Test that no facts section appears when facts is empty."""
        prompt = build_system_prompt("biographer", "John", facts=[])
        assert prompt is not None
        assert "Known facts" not in prompt

    def test_no_facts_section_when_none(self):
        """Test backward compatibility when facts not provided."""
        prompt = build_system_prompt("biographer", "John")
        assert prompt is not None
        assert "Known facts" not in prompt
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/config/test_personas.py::TestBuildSystemPromptWithFacts -v`
Expected: FAIL — `build_system_prompt() got an unexpected keyword argument 'facts'`

**Step 3: Update build_system_prompt**

Modify `services/core-api/app/config/personas.py` — the `build_system_prompt` function (lines 108-136):

```python
def build_system_prompt(
    persona_id: str,
    legacy_name: str,
    story_context: str = "",
    facts: list[Any] | None = None,
) -> str | None:
    """Build complete system prompt for a persona with legacy context.

    Args:
        persona_id: The persona identifier.
        legacy_name: Name of the legacy being discussed.
        story_context: Retrieved story context to include in prompt.
        facts: Optional list of LegacyFact objects to inject.

    Returns:
        Complete system prompt with base rules, persona prompt, story context,
        and known facts, or None if persona not found.
    """
    persona = get_persona(persona_id)
    if not persona:
        return None

    base = get_base_rules()
    persona_prompt = persona.system_prompt.replace("{legacy_name}", legacy_name)

    prompt = f"{base}\n\n{persona_prompt}"

    if story_context:
        prompt = f"{prompt}\n\n{story_context}"

    if facts:
        facts_section = f"\n\nKnown facts about {legacy_name} from conversations:\n"
        for fact in facts:
            source = "(shared)" if fact.visibility == "shared" else "(personal)"
            facts_section += f"- [{fact.category}] {fact.content} {source}\n"
        prompt = f"{prompt}{facts_section}"

    return prompt
```

Also add `Any` to the imports at the top of `personas.py`:

```python
from typing import Any
```

**Step 4: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/config/test_personas.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/config/personas.py services/core-api/tests/config/test_personas.py
git commit -m "feat(personas): inject legacy facts into system prompt"
```

---

## Task 7: Integration — Wire Memory Into Turn Preparation

**Files:**
- Modify: `services/core-api/app/adapters/storytelling.py:151-221` (`DefaultStorytellingAgent.prepare_turn`)
- Test: `services/core-api/tests/adapters/test_storytelling_memory.py`

**Step 1: Write failing test**

Create `services/core-api/tests/adapters/test_storytelling_memory.py`:

```python
"""Tests for storytelling agent memory integration."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.adapters.storytelling import DefaultStorytellingAgent, format_story_context


class TestPrepareTurnWithMemory:
    """Tests for prepare_turn with facts and conversation memory."""

    @pytest.mark.asyncio
    async def test_includes_facts_in_system_prompt(self):
        """Test that prepare_turn fetches facts and passes them to build_system_prompt."""
        mock_llm = MagicMock()
        mock_vector_store = AsyncMock()
        mock_vector_store.retrieve_context.return_value = []
        mock_memory = AsyncMock()
        mock_memory.get_context_messages.return_value = []
        mock_guardrail = MagicMock()
        mock_guardrail.get_bedrock_guardrail.return_value = (None, None)

        agent = DefaultStorytellingAgent(
            llm_provider=mock_llm,
            vector_store=mock_vector_store,
            memory=mock_memory,
            guardrail=mock_guardrail,
        )

        mock_db = AsyncMock()
        mock_fact = MagicMock()
        mock_fact.category = "hobby"
        mock_fact.content = "Loved fishing"
        mock_fact.visibility = "private"

        with patch(
            "app.adapters.storytelling.memory_service.get_facts_for_context",
            new_callable=AsyncMock,
            return_value=[mock_fact],
        ) as mock_get_facts:
            turn = await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=uuid4(),
                user_query="Tell me about their hobbies",
                legacy_id=uuid4(),
                persona_id="biographer",
                legacy_name="John",
            )

            mock_get_facts.assert_called_once()
            assert "Loved fishing" in turn.system_prompt
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_storytelling_memory.py -v`
Expected: FAIL — `module 'app.adapters.storytelling' has no attribute 'memory_service'`

**Step 3: Update DefaultStorytellingAgent.prepare_turn**

Modify `services/core-api/app/adapters/storytelling.py`:

Add import at top (after existing imports around line 19):

```python
from ..services import memory as memory_service
```

Then update the `prepare_turn` method (starting at line 168) to fetch facts and pass them to `build_system_prompt`:

Replace the body of `prepare_turn` (lines 179-221):

```python
    async def prepare_turn(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        user_id: UUID,
        user_query: str,
        legacy_id: UUID,
        persona_id: str,
        legacy_name: str,
        top_k: int = 5,
    ) -> PreparedStoryTurn:
        chunks: list[ChunkResult] = []

        try:
            chunks = await self.vector_store.retrieve_context(
                db=db,
                query=user_query,
                legacy_id=legacy_id,
                user_id=user_id,
                top_k=top_k,
            )
        except Exception as exc:
            logger.warning(
                "ai.chat.rag_retrieval_failed",
                extra={
                    "conversation_id": str(conversation_id),
                    "error": str(exc),
                },
            )

        story_context = self.context_formatter(chunks)

        # Fetch legacy facts for system prompt injection
        facts = []
        try:
            facts = await memory_service.get_facts_for_context(
                db=db, legacy_id=legacy_id, user_id=user_id
            )
        except Exception as exc:
            logger.warning(
                "ai.chat.facts_retrieval_failed",
                extra={
                    "conversation_id": str(conversation_id),
                    "error": str(exc),
                },
            )

        system_prompt = build_system_prompt(
            persona_id, legacy_name, story_context, facts=facts
        )
        if not system_prompt:
            raise AIProviderError(
                message="Failed to build system prompt",
                retryable=False,
                code="invalid_request",
                provider="storytelling",
                operation="prepare_turn",
            )

        context_messages = await self.memory.get_context_messages(
            db=db,
            conversation_id=conversation_id,
        )
        guardrail_id, guardrail_version = self.guardrail.get_bedrock_guardrail()

        return PreparedStoryTurn(
            context_messages=context_messages,
            system_prompt=system_prompt,
            chunks_count=len(chunks),
            guardrail_id=guardrail_id,
            guardrail_version=guardrail_version,
        )
```

**Step 4: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_storytelling_memory.py -v`
Expected: PASS

**Step 5: Run existing tests to verify no regressions**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/ -v --tb=short`
Expected: All existing tests PASS

**Step 6: Commit**

```bash
git add services/core-api/app/adapters/storytelling.py services/core-api/tests/adapters/test_storytelling_memory.py
git commit -m "feat(storytelling): wire facts retrieval into turn preparation"
```

---

## Task 8: Integration — Summarization Trigger in Chat Route

**Files:**
- Modify: `services/core-api/app/routes/ai.py:258-341` (inside `generate_stream()`)

**Step 1: Update the route**

In `services/core-api/app/routes/ai.py`, add import at top:

```python
from ..services import memory as memory_service
```

Then in the `send_message` endpoint, after the assistant message is saved (around line 286-291), add the summarization trigger. Inside `generate_stream()`, after `message = await storytelling_agent.save_assistant_message(...)`:

```python
                # Save assistant message
                message = await storytelling_agent.save_assistant_message(
                    db=db,
                    conversation_id=conversation_id,
                    content=full_response,
                    token_count=token_count,
                )

                # Trigger background summarization check
                try:
                    await memory_service.maybe_summarize(
                        db=db,
                        conversation_id=conversation_id,
                        user_id=session.user_id,
                        legacy_id=primary_legacy_id,
                        legacy_name=legacy.name,
                    )
                except Exception:
                    logger.exception(
                        "ai.chat.summarization_failed",
                        extra={"conversation_id": str(conversation_id)},
                    )
```

**Step 2: Run full test suite to verify no regressions**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/ -v --tb=short`
Expected: All PASS

**Step 3: Commit**

```bash
git add services/core-api/app/routes/ai.py
git commit -m "feat(routes): trigger conversation summarization after assistant response"
```

---

## Task 9: API Endpoints — Fact Management Routes

**Files:**
- Modify: `services/core-api/app/routes/ai.py` (add fact endpoints)
- Test: `services/core-api/tests/routes/test_fact_routes.py`

**Step 1: Write failing tests**

Create `services/core-api/tests/routes/test_fact_routes.py`:

```python
"""Tests for fact management API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.memory import LegacyFact
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestListFacts:
    """Tests for GET /api/ai/legacies/{legacy_id}/facts."""

    @pytest.mark.asyncio
    async def test_returns_user_facts(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Test listing facts for a legacy."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved fishing",
        )
        db_session.add(fact)
        await db_session.commit()

        response = await client.get(
            f"/api/ai/legacies/{test_legacy.id}/facts",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["content"] == "Loved fishing"


class TestDeleteFact:
    """Tests for DELETE /api/ai/facts/{fact_id}."""

    @pytest.mark.asyncio
    async def test_deletes_own_fact(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Test deleting own fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="To delete",
        )
        db_session.add(fact)
        await db_session.commit()

        response = await client.delete(
            f"/api/ai/facts/{fact.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_cannot_delete_others_fact(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Test that you can't delete another user's fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            category="hobby",
            content="Not yours",
        )
        db_session.add(fact)
        await db_session.commit()

        response = await client.delete(
            f"/api/ai/facts/{fact.id}",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestUpdateFactVisibility:
    """Tests for PATCH /api/ai/facts/{fact_id}/visibility."""

    @pytest.mark.asyncio
    async def test_shares_fact(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Test sharing a fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Shareable",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        response = await client.patch(
            f"/api/ai/facts/{fact.id}/visibility",
            headers=auth_headers,
            json={"visibility": "shared"},
        )

        assert response.status_code == 200
        assert response.json()["visibility"] == "shared"
```

**Step 2: Run tests to verify they fail**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/routes/test_fact_routes.py -v`
Expected: FAIL — 404 (routes don't exist yet)

**Step 3: Add fact management routes**

Add to `services/core-api/app/routes/ai.py`, after existing conversation endpoints and before the message endpoint:

```python
# ============================================================================
# Fact Management Endpoints
# ============================================================================


@router.get(
    "/legacies/{legacy_id}/facts",
    response_model=list[FactResponse],
    summary="List facts for a legacy",
    description="List the current user's facts plus shared facts for a legacy.",
)
async def list_facts(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[FactResponse]:
    """List facts for a legacy visible to the current user."""
    session = require_auth(request)
    facts = await memory_service.list_user_facts(
        db=db,
        legacy_id=legacy_id,
        user_id=session.user_id,
    )
    return [FactResponse.model_validate(f) for f in facts]


@router.delete(
    "/facts/{fact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a fact",
    description="Delete a fact you own.",
)
async def delete_fact(
    fact_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a fact (ownership enforced)."""
    session = require_auth(request)
    await memory_service.delete_fact(
        db=db,
        fact_id=fact_id,
        user_id=session.user_id,
    )


@router.patch(
    "/facts/{fact_id}/visibility",
    response_model=FactResponse,
    summary="Update fact visibility",
    description="Toggle a fact between private and shared.",
)
async def update_fact_visibility(
    fact_id: UUID,
    data: FactVisibilityUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FactResponse:
    """Update fact visibility (ownership enforced)."""
    session = require_auth(request)
    fact = await memory_service.update_fact_visibility(
        db=db,
        fact_id=fact_id,
        user_id=session.user_id,
        visibility=data.visibility,
    )
    return FactResponse.model_validate(fact)
```

Also add imports at the top of `routes/ai.py`:

```python
from ..schemas.memory import FactResponse, FactVisibilityUpdate
```

**Step 4: Run tests to verify they pass**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/routes/test_fact_routes.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/routes/ai.py services/core-api/tests/routes/test_fact_routes.py
git commit -m "feat(routes): add fact management API endpoints (list, delete, update visibility)"
```

---

## Task 10: Validation and Full Test Suite

**Files:** None new — this is a validation pass.

**Step 1: Run full test suite**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/ -v --tb=short`
Expected: All tests PASS, no regressions.

**Step 2: Run backend validation (ruff + mypy)**

Run: `cd /apps/mosaic-life && just validate-backend`
Expected: PASS. Fix any type errors or lint issues.

**Step 3: Fix any issues found**

If ruff or mypy report errors, fix them. Common issues:
- Missing type annotations on new functions
- Unused imports
- Line length violations

**Step 4: Final commit if fixes were needed**

```bash
git add -u
git commit -m "fix(lint): resolve type and lint issues in memory feature"
```

**Step 5: Run validation again to confirm clean**

Run: `cd /apps/mosaic-life && just validate-backend`
Expected: Clean pass, zero errors.
