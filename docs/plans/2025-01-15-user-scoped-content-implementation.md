# User-Scoped Content Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure stories, media, and AI conversations from legacy-scoped to user-scoped ownership with many-to-many legacy relationships.

**Architecture:** Content (stories, media, conversations) becomes owned by users via `author_id`/`owner_id`. Legacy associations move to junction tables (`story_legacies`, `media_legacies`, `conversation_legacies`) with role and position fields. Access control uses union logic - membership in ANY linked legacy grants read access.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL, Pydantic v2, pytest-asyncio

---

## Phase 1: Database Models

### Task 1: Create Association Models

**Files:**
- Create: `services/core-api/app/models/associations.py`
- Modify: `services/core-api/app/models/__init__.py`

**Step 1: Create the associations module**

```python
# services/core-api/app/models/associations.py
"""Association models for many-to-many relationships between content and legacies."""

from typing import Literal
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

# Type alias for role values
LegacyRole = Literal["primary", "secondary"]


class StoryLegacy(Base):
    """Association between stories and legacies."""

    __tablename__ = "story_legacies"

    story_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="primary",
    )
    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    __table_args__ = (
        UniqueConstraint("story_id", "legacy_id", name="uq_story_legacy"),
    )

    def __repr__(self) -> str:
        return f"<StoryLegacy(story_id={self.story_id}, legacy_id={self.legacy_id}, role={self.role})>"


class MediaLegacy(Base):
    """Association between media and legacies."""

    __tablename__ = "media_legacies"

    media_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="CASCADE"),
        primary_key=True,
    )
    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="primary",
    )
    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    __table_args__ = (
        UniqueConstraint("media_id", "legacy_id", name="uq_media_legacy"),
    )

    def __repr__(self) -> str:
        return f"<MediaLegacy(media_id={self.media_id}, legacy_id={self.legacy_id}, role={self.role})>"


class ConversationLegacy(Base):
    """Association between AI conversations and legacies."""

    __tablename__ = "conversation_legacies"

    conversation_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="primary",
    )
    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    __table_args__ = (
        UniqueConstraint("conversation_id", "legacy_id", name="uq_conversation_legacy"),
    )

    def __repr__(self) -> str:
        return f"<ConversationLegacy(conversation_id={self.conversation_id}, legacy_id={self.legacy_id}, role={self.role})>"
```

**Step 2: Update models __init__.py**

```python
# services/core-api/app/models/__init__.py
"""SQLAlchemy models for the application."""

from .ai import AIConversation, AIMessage
from .associations import ConversationLegacy, MediaLegacy, StoryLegacy
from .invitation import Invitation
from .legacy import Legacy, LegacyMember
from .media import Media
from .notification import Notification
from .story import Story
from .support_request import SupportRequest
from .user import User
from .user_session import UserSession

__all__ = [
    "AIConversation",
    "AIMessage",
    "ConversationLegacy",
    "Invitation",
    "Legacy",
    "LegacyMember",
    "Media",
    "MediaLegacy",
    "Notification",
    "Story",
    "StoryLegacy",
    "SupportRequest",
    "User",
    "UserSession",
]
```

**Step 3: Verify imports work**

Run: `cd /apps/mosaic-life/services/core-api && uv run python -c "from app.models import StoryLegacy, MediaLegacy, ConversationLegacy; print('OK')"`

Expected: `OK`

**Step 4: Commit**

```bash
git add services/core-api/app/models/associations.py services/core-api/app/models/__init__.py
git commit -m "feat(models): add association models for many-to-many legacy relationships"
```

---

### Task 2: Update Story Model

**Files:**
- Modify: `services/core-api/app/models/story.py`

**Step 1: Update Story model to remove legacy_id and add relationship**

```python
# services/core-api/app/models/story.py
"""Story model for legacy stories."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .associations import StoryLegacy
    from .user import User


class Story(Base):
    """Story model for user-written stories about legacies."""

    __tablename__ = "stories"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    author_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Visibility: 'public', 'private', 'personal'
    visibility: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="private",
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
        index=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    author: Mapped["User"] = relationship("User", foreign_keys=[author_id])
    legacy_associations: Mapped[list["StoryLegacy"]] = relationship(
        "StoryLegacy",
        cascade="all, delete-orphan",
        order_by="StoryLegacy.position",
    )

    def __repr__(self) -> str:
        return (
            f"<Story(id={self.id}, title={self.title}, visibility={self.visibility})>"
        )
```

**Step 2: Verify model compiles**

Run: `cd /apps/mosaic-life/services/core-api && uv run python -c "from app.models.story import Story; print('OK')"`

Expected: `OK`

**Step 3: Commit**

```bash
git add services/core-api/app/models/story.py
git commit -m "refactor(models): remove legacy_id from Story, add legacy_associations relationship"
```

---

### Task 3: Update Media Model

**Files:**
- Modify: `services/core-api/app/models/media.py`

**Step 1: Update Media model**

```python
# services/core-api/app/models/media.py
"""Media model for uploaded files."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .associations import MediaLegacy
    from .user import User


class Media(Base):
    """Media model for uploaded files."""

    __tablename__ = "media"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    owner_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
        index=True,
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])
    legacy_associations: Mapped[list["MediaLegacy"]] = relationship(
        "MediaLegacy",
        cascade="all, delete-orphan",
        order_by="MediaLegacy.position",
    )

    def __repr__(self) -> str:
        return f"<Media(id={self.id}, filename={self.filename})>"
```

**Step 2: Verify model compiles**

Run: `cd /apps/mosaic-life/services/core-api && uv run python -c "from app.models.media import Media; print('OK')"`

Expected: `OK`

**Step 3: Commit**

```bash
git add services/core-api/app/models/media.py
git commit -m "refactor(models): remove legacy_id from Media, rename uploaded_by to owner_id"
```

---

### Task 4: Update AIConversation Model

**Files:**
- Modify: `services/core-api/app/models/ai.py`

**Step 1: Update AIConversation model**

```python
# services/core-api/app/models/ai.py
"""AI conversation and message models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .associations import ConversationLegacy


class AIConversation(Base):
    """AI conversation model for tracking chat sessions."""

    __tablename__ = "ai_conversations"

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

    persona_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    title: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
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

    # Relationships
    messages: Mapped[list["AIMessage"]] = relationship(
        "AIMessage",
        back_populates="conversation",
        order_by="AIMessage.created_at",
        cascade="all, delete-orphan",
    )
    legacy_associations: Mapped[list["ConversationLegacy"]] = relationship(
        "ConversationLegacy",
        cascade="all, delete-orphan",
        order_by="ConversationLegacy.position",
    )

    def __repr__(self) -> str:
        return f"<AIConversation(id={self.id}, persona={self.persona_id})>"


class AIMessage(Base):
    """AI message model for storing conversation messages."""

    __tablename__ = "ai_messages"

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

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    token_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    blocked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default="false",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    conversation: Mapped["AIConversation"] = relationship(
        "AIConversation",
        back_populates="messages",
    )

    def __repr__(self) -> str:
        return f"<AIMessage(id={self.id}, role={self.role})>"
```

**Step 2: Verify model compiles**

Run: `cd /apps/mosaic-life/services/core-api && uv run python -c "from app.models.ai import AIConversation; print('OK')"`

Expected: `OK`

**Step 3: Commit**

```bash
git add services/core-api/app/models/ai.py
git commit -m "refactor(models): remove legacy_id from AIConversation, add legacy_associations"
```

---

### Task 5: Create Database Migration

**Files:**
- Create: `services/core-api/alembic/versions/xxx_user_scoped_content.py`

**Step 1: Generate migration file**

Run: `cd /apps/mosaic-life/services/core-api && uv run alembic revision -m "user_scoped_content"`

Expected: Creates new file in `alembic/versions/`

**Step 2: Edit the migration file with this content**

```python
"""user_scoped_content

Revision ID: <generated>
Revises: <previous>
Create Date: <generated>

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "<generated>"
down_revision = "<previous>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create story_legacies junction table
    op.create_table(
        "story_legacies",
        sa.Column("story_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="primary"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("story_id", "legacy_id"),
        sa.UniqueConstraint("story_id", "legacy_id", name="uq_story_legacy"),
    )
    op.create_index("ix_story_legacies_legacy_id", "story_legacies", ["legacy_id"])
    op.create_index("ix_story_legacies_story_id", "story_legacies", ["story_id"])

    # Create media_legacies junction table
    op.create_table(
        "media_legacies",
        sa.Column("media_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="primary"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("media_id", "legacy_id"),
        sa.UniqueConstraint("media_id", "legacy_id", name="uq_media_legacy"),
    )
    op.create_index("ix_media_legacies_legacy_id", "media_legacies", ["legacy_id"])
    op.create_index("ix_media_legacies_media_id", "media_legacies", ["media_id"])

    # Create conversation_legacies junction table
    op.create_table(
        "conversation_legacies",
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="primary"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("conversation_id", "legacy_id"),
        sa.UniqueConstraint("conversation_id", "legacy_id", name="uq_conversation_legacy"),
    )
    op.create_index("ix_conversation_legacies_legacy_id", "conversation_legacies", ["legacy_id"])
    op.create_index("ix_conversation_legacies_conversation_id", "conversation_legacies", ["conversation_id"])

    # Drop legacy_id from stories
    op.drop_index("ix_stories_legacy_id", table_name="stories")
    op.drop_constraint("stories_legacy_id_fkey", "stories", type_="foreignkey")
    op.drop_column("stories", "legacy_id")

    # Drop legacy_id from media and rename uploaded_by to owner_id
    op.drop_index("ix_media_legacy_id", table_name="media")
    op.drop_constraint("media_legacy_id_fkey", "media", type_="foreignkey")
    op.drop_column("media", "legacy_id")
    op.alter_column("media", "uploaded_by", new_column_name="owner_id")

    # Drop legacy_id from ai_conversations
    op.drop_index("ix_ai_conversations_legacy_id", table_name="ai_conversations")
    op.drop_index("ix_ai_conversations_user_legacy_persona", table_name="ai_conversations")
    op.drop_constraint("ai_conversations_legacy_id_fkey", "ai_conversations", type_="foreignkey")
    op.drop_column("ai_conversations", "legacy_id")

    # Create new index for ai_conversations (user + persona only)
    op.create_index(
        "ix_ai_conversations_user_persona",
        "ai_conversations",
        ["user_id", "persona_id"],
    )


def downgrade() -> None:
    # Drop new ai_conversations index
    op.drop_index("ix_ai_conversations_user_persona", table_name="ai_conversations")

    # Restore legacy_id to ai_conversations
    op.add_column("ai_conversations", sa.Column("legacy_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "ai_conversations_legacy_id_fkey",
        "ai_conversations",
        "legacies",
        ["legacy_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_ai_conversations_legacy_id", "ai_conversations", ["legacy_id"])
    op.create_index(
        "ix_ai_conversations_user_legacy_persona",
        "ai_conversations",
        ["user_id", "legacy_id", "persona_id"],
    )

    # Restore uploaded_by and legacy_id to media
    op.alter_column("media", "owner_id", new_column_name="uploaded_by")
    op.add_column("media", sa.Column("legacy_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "media_legacy_id_fkey",
        "media",
        "legacies",
        ["legacy_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_media_legacy_id", "media", ["legacy_id"])

    # Restore legacy_id to stories
    op.add_column("stories", sa.Column("legacy_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "stories_legacy_id_fkey",
        "stories",
        "legacies",
        ["legacy_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_stories_legacy_id", "stories", ["legacy_id"])

    # Drop junction tables
    op.drop_index("ix_conversation_legacies_conversation_id", table_name="conversation_legacies")
    op.drop_index("ix_conversation_legacies_legacy_id", table_name="conversation_legacies")
    op.drop_table("conversation_legacies")

    op.drop_index("ix_media_legacies_media_id", table_name="media_legacies")
    op.drop_index("ix_media_legacies_legacy_id", table_name="media_legacies")
    op.drop_table("media_legacies")

    op.drop_index("ix_story_legacies_story_id", table_name="story_legacies")
    op.drop_index("ix_story_legacies_legacy_id", table_name="story_legacies")
    op.drop_table("story_legacies")
```

**Step 3: Commit migration file**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(db): add migration for user-scoped content with junction tables"
```

---

## Phase 2: Schemas

### Task 6: Create Legacy Association Schemas

**Files:**
- Create: `services/core-api/app/schemas/associations.py`

**Step 1: Create the schemas**

```python
# services/core-api/app/schemas/associations.py
"""Pydantic schemas for legacy associations."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class LegacyAssociationCreate(BaseModel):
    """Schema for creating a legacy association."""

    legacy_id: UUID = Field(..., description="Legacy ID to associate")
    role: Literal["primary", "secondary"] = Field(
        default="primary",
        description="Role of this legacy in the content",
    )
    position: int = Field(
        default=0,
        ge=0,
        description="Display order position",
    )


class LegacyAssociationResponse(BaseModel):
    """Schema for legacy association in responses."""

    legacy_id: UUID
    legacy_name: str
    role: str
    position: int

    model_config = {"from_attributes": True}


class LegacyAssociationUpdate(BaseModel):
    """Schema for updating legacy associations."""

    legacy_id: UUID
    role: Literal["primary", "secondary"] | None = None
    position: int | None = Field(None, ge=0)
```

**Step 2: Commit**

```bash
git add services/core-api/app/schemas/associations.py
git commit -m "feat(schemas): add Pydantic schemas for legacy associations"
```

---

### Task 7: Update Story Schemas

**Files:**
- Modify: `services/core-api/app/schemas/story.py`

**Step 1: Update story schemas**

```python
# services/core-api/app/schemas/story.py
"""Pydantic schemas for Story API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from .associations import LegacyAssociationCreate, LegacyAssociationResponse


class StoryCreate(BaseModel):
    """Schema for creating a new story."""

    title: str = Field(..., min_length=1, max_length=500, description="Story title")
    content: str = Field(
        ..., min_length=1, max_length=50000, description="Story content in Markdown"
    )
    visibility: Literal["public", "private", "personal"] = Field(
        default="private",
        description="Visibility level: public, private (legacy members), or personal (author only)",
    )
    legacies: list[LegacyAssociationCreate] = Field(
        ...,
        min_length=1,
        description="Legacies this story is about (at least one required)",
    )

    @field_validator("legacies")
    @classmethod
    def validate_has_primary(cls, v: list[LegacyAssociationCreate]) -> list[LegacyAssociationCreate]:
        """Ensure at least one legacy has primary role."""
        if not any(leg.role == "primary" for leg in v):
            # Auto-promote first to primary
            if v:
                v[0].role = "primary"
        return v


class StoryUpdate(BaseModel):
    """Schema for updating an existing story."""

    title: str | None = Field(
        None, min_length=1, max_length=500, description="Story title"
    )
    content: str | None = Field(
        None, min_length=1, max_length=50000, description="Story content in Markdown"
    )
    visibility: Literal["public", "private", "personal"] | None = Field(
        None,
        description="Visibility level",
    )
    legacies: list[LegacyAssociationCreate] | None = Field(
        None,
        min_length=1,
        description="Updated legacy associations",
    )


class StoryAuthorInfo(BaseModel):
    """Schema for story author information."""

    id: UUID
    name: str
    email: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class StorySummary(BaseModel):
    """Schema for story summary in lists."""

    id: UUID
    title: str
    content_preview: str = Field(description="Truncated preview of story content")
    author_id: UUID
    author_name: str
    visibility: str
    legacies: list[LegacyAssociationResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StoryDetail(BaseModel):
    """Schema for full story details."""

    id: UUID
    author_id: UUID
    author_name: str
    author_email: str
    title: str
    content: str
    visibility: str
    legacies: list[LegacyAssociationResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StoryResponse(BaseModel):
    """Schema for story creation/update response."""

    id: UUID
    title: str
    visibility: str
    legacies: list[LegacyAssociationResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

**Step 2: Verify schema compiles**

Run: `cd /apps/mosaic-life/services/core-api && uv run python -c "from app.schemas.story import StoryCreate, StoryResponse; print('OK')"`

Expected: `OK`

**Step 3: Commit**

```bash
git add services/core-api/app/schemas/story.py
git commit -m "refactor(schemas): update story schemas for multi-legacy support"
```

---

### Task 8: Update Media Schemas

**Files:**
- Modify: `services/core-api/app/schemas/media.py`

**Step 1: Read current media schemas**

Run: `cat /apps/mosaic-life/services/core-api/app/schemas/media.py`

**Step 2: Update media schemas to add legacy associations**

Add imports at top:
```python
from .associations import LegacyAssociationCreate, LegacyAssociationResponse
```

Update `UploadUrlRequest` to accept optional `legacies`:
```python
class UploadUrlRequest(BaseModel):
    """Schema for requesting an upload URL."""

    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., min_length=1, max_length=100)
    size_bytes: int = Field(..., gt=0)
    legacies: list[LegacyAssociationCreate] | None = Field(
        None,
        description="Optional legacy associations (can be added after upload)",
    )
```

Update response schemas to include `legacies` field and remove `legacy_id`.

**Step 3: Commit**

```bash
git add services/core-api/app/schemas/media.py
git commit -m "refactor(schemas): update media schemas for user-scoped ownership"
```

---

### Task 9: Update AI Schemas

**Files:**
- Modify: `services/core-api/app/schemas/ai.py`

**Step 1: Read current AI schemas**

Run: `cat /apps/mosaic-life/services/core-api/app/schemas/ai.py`

**Step 2: Update AI schemas**

Update `ConversationCreate` to use `legacies` array:
```python
class ConversationCreate(BaseModel):
    """Schema for creating a conversation."""

    persona_id: str = Field(..., description="AI persona ID")
    legacies: list[LegacyAssociationCreate] = Field(
        ...,
        min_length=1,
        description="Legacies this conversation is about",
    )
```

Update response schemas to include `legacies` and remove `legacy_id`.

**Step 3: Commit**

```bash
git add services/core-api/app/schemas/ai.py
git commit -m "refactor(schemas): update AI schemas for multi-legacy support"
```

---

## Phase 3: Services

### Task 10: Update Story Service

**Files:**
- Modify: `services/core-api/app/services/story.py`

**Step 1: Update imports**

Add at top:
```python
from ..models.associations import StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..schemas.associations import LegacyAssociationResponse
```

**Step 2: Update create_story function**

```python
async def create_story(
    db: AsyncSession,
    user_id: UUID,
    data: StoryCreate,
) -> StoryResponse:
    """Create a new story with legacy associations.

    User must be a member of at least one of the specified legacies.
    """
    # Verify user is member of at least one legacy
    legacy_ids = [leg.legacy_id for leg in data.legacies]
    member_check = await db.execute(
        select(LegacyMember).where(
            LegacyMember.user_id == user_id,
            LegacyMember.legacy_id.in_(legacy_ids),
            LegacyMember.role != "pending",
        )
    )
    members = member_check.scalars().all()

    if not members:
        raise HTTPException(
            status_code=403,
            detail="Must be a member of at least one specified legacy",
        )

    # Create story
    story = Story(
        author_id=user_id,
        title=data.title,
        content=data.content,
        visibility=data.visibility,
    )
    db.add(story)
    await db.flush()

    # Create legacy associations
    for leg_data in data.legacies:
        assoc = StoryLegacy(
            story_id=story.id,
            legacy_id=leg_data.legacy_id,
            role=leg_data.role,
            position=leg_data.position,
        )
        db.add(assoc)

    await db.commit()
    await db.refresh(story)

    # Fetch legacy names for response
    legacy_names = await _get_legacy_names(db, legacy_ids)

    logger.info(
        "story.created",
        extra={
            "story_id": str(story.id),
            "legacy_ids": [str(lid) for lid in legacy_ids],
            "author_id": str(user_id),
            "visibility": data.visibility,
        },
    )

    return StoryResponse(
        id=story.id,
        title=story.title,
        visibility=story.visibility,
        legacies=[
            LegacyAssociationResponse(
                legacy_id=leg.legacy_id,
                legacy_name=legacy_names.get(leg.legacy_id, "Unknown"),
                role=leg.role,
                position=leg.position,
            )
            for leg in data.legacies
        ],
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def _get_legacy_names(db: AsyncSession, legacy_ids: list[UUID]) -> dict[UUID, str]:
    """Fetch legacy names by IDs."""
    result = await db.execute(
        select(Legacy.id, Legacy.name).where(Legacy.id.in_(legacy_ids))
    )
    return {row[0]: row[1] for row in result.all()}
```

**Step 3: Update list_legacy_stories for union access**

```python
async def list_legacy_stories(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID | None = None,
    orphaned: bool = False,
) -> list[StorySummary]:
    """List stories with visibility filtering.

    Args:
        db: Database session
        user_id: Requesting user ID
        legacy_id: Optional filter by legacy
        orphaned: If True, return only orphaned stories (no legacy associations)
    """
    # Build base query
    query = (
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
    )

    if orphaned:
        # Find stories with no legacy associations owned by user
        query = query.where(
            Story.author_id == user_id,
            ~Story.id.in_(select(StoryLegacy.story_id))
        )
    elif legacy_id:
        # Filter by specific legacy
        query = query.join(StoryLegacy).where(StoryLegacy.legacy_id == legacy_id)

        # Check if user is member of this legacy
        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == user_id,
                LegacyMember.role != "pending",
            )
        )
        is_member = member_result.scalar_one_or_none() is not None

        if is_member:
            # Member sees: public + private + own personal
            query = query.where(
                or_(
                    Story.visibility == "public",
                    Story.visibility == "private",
                    and_(Story.visibility == "personal", Story.author_id == user_id),
                )
            )
        else:
            # Non-member sees only public
            query = query.where(Story.visibility == "public")
    else:
        # No filter - return user's own stories or stories from their legacies
        user_legacy_ids = select(LegacyMember.legacy_id).where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        query = query.where(
            or_(
                Story.author_id == user_id,
                Story.id.in_(
                    select(StoryLegacy.story_id).where(
                        StoryLegacy.legacy_id.in_(user_legacy_ids)
                    )
                ),
            )
        )

    query = query.order_by(Story.created_at.desc())
    result = await db.execute(query)
    stories = result.scalars().unique().all()

    # Get all legacy names needed
    all_legacy_ids = set()
    for story in stories:
        for assoc in story.legacy_associations:
            all_legacy_ids.add(assoc.legacy_id)
    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    return [
        StorySummary(
            id=story.id,
            title=story.title,
            content_preview=create_content_preview(story.content),
            author_id=story.author_id,
            author_name=story.author.name,
            visibility=story.visibility,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
            ],
            created_at=story.created_at,
            updated_at=story.updated_at,
        )
        for story in stories
    ]
```

**Step 4: Update _check_story_visibility for union access**

```python
async def _check_story_visibility(
    db: AsyncSession,
    user_id: UUID,
    story: Story,
) -> bool:
    """Check if user can view a story based on visibility rules.

    Union access: user can view if member of ANY linked legacy.
    """
    # Author can always see their own stories
    if story.author_id == user_id:
        return True

    # Public stories are visible to everyone
    if story.visibility == "public":
        return True

    # Personal stories are only visible to author
    if story.visibility == "personal":
        return False

    # Private stories - check union access (member of ANY linked legacy)
    if story.visibility == "private":
        story_legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
        if not story_legacy_ids:
            return False  # Orphaned private story - only author can see

        result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(story_legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        return result.scalar_one_or_none() is not None

    return False
```

**Step 5: Commit**

```bash
git add services/core-api/app/services/story.py
git commit -m "refactor(services): update story service for multi-legacy associations"
```

---

### Task 11: Update Media Service

**Files:**
- Modify: `services/core-api/app/services/media.py`

**Step 1: Update storage path generation**

```python
def generate_storage_path(user_id: UUID, media_id: UUID, ext: str) -> str:
    """Generate user-scoped storage path."""
    return f"users/{user_id}/{media_id}{ext}"
```

**Step 2: Update request_upload_url**

Change storage_path generation:
```python
storage_path = generate_storage_path(user_id, media_id, ext)
```

Update Media creation:
```python
media = Media(
    id=media_id,
    owner_id=user_id,  # Changed from legacy_id
    filename=data.filename,
    content_type=data.content_type,
    size_bytes=data.size_bytes,
    storage_path=storage_path,
)
```

**Step 3: Update list/get functions for union access**

Apply same union access pattern as stories.

**Step 4: Commit**

```bash
git add services/core-api/app/services/media.py
git commit -m "refactor(services): update media service for user-scoped ownership"
```

---

### Task 12: Update AI Service

**Files:**
- Modify: `services/core-api/app/services/ai.py`

**Step 1: Update create_conversation**

Remove legacy_id parameter, add legacy associations.

**Step 2: Update get_or_create_conversation**

Handle multi-legacy lookup.

**Step 3: Commit**

```bash
git add services/core-api/app/services/ai.py
git commit -m "refactor(services): update AI service for multi-legacy conversations"
```

---

## Phase 4: Routes

### Task 13: Update Story Routes

**Files:**
- Modify: `services/core-api/app/routes/story.py`

**Step 1: Update list_stories endpoint**

Add `orphaned` query parameter:
```python
@router.get("/")
async def list_stories(
    request: Request,
    legacy_id: UUID | None = Query(None, description="Filter by legacy"),
    orphaned: bool = Query(False, description="Return only orphaned stories"),
    db: AsyncSession = Depends(get_db),
) -> list[StorySummary]:
```

**Step 2: Commit**

```bash
git add services/core-api/app/routes/story.py
git commit -m "refactor(routes): update story routes for multi-legacy support"
```

---

### Task 14: Update Media Routes

**Files:**
- Modify: `services/core-api/app/routes/media.py`

**Step 1: Restructure routes**

Change from `/api/legacies/{legacy_id}/media` to `/api/media` with query params.

**Step 2: Commit**

```bash
git add services/core-api/app/routes/media.py
git commit -m "refactor(routes): restructure media routes for user-scoped ownership"
```

---

### Task 15: Update AI Routes

**Files:**
- Modify: `services/core-api/app/routes/ai.py`

**Step 1: Update conversation creation**

Handle multiple legacies in request.

**Step 2: Commit**

```bash
git add services/core-api/app/routes/ai.py
git commit -m "refactor(routes): update AI routes for multi-legacy conversations"
```

---

## Phase 5: Tests

### Task 16: Update Test Fixtures

**Files:**
- Modify: `services/core-api/tests/conftest.py`

**Step 1: Update fixtures for new model structure**

Update `test_story_public`, `test_media`, etc. to use new association pattern.

**Step 2: Add multi-legacy fixtures**

```python
@pytest_asyncio.fixture
async def test_legacy_2(db_session: AsyncSession, test_user: User) -> Legacy:
    """Create a second test legacy."""
    legacy = Legacy(
        name="Second Legacy",
        created_by=test_user.id,
        visibility="private",
    )
    db_session.add(legacy)
    await db_session.flush()

    member = LegacyMember(
        legacy_id=legacy.id,
        user_id=test_user.id,
        role="creator",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy
```

**Step 3: Commit**

```bash
git add services/core-api/tests/conftest.py
git commit -m "test: update fixtures for user-scoped content model"
```

---

### Task 17: Write Story Association Tests

**Files:**
- Create: `services/core-api/tests/test_story_associations.py`

**Step 1: Write the tests**

```python
"""Tests for story-legacy associations."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.user import User
from app.schemas.associations import LegacyAssociationCreate
from app.schemas.story import StoryCreate
from app.services import story as story_service


class TestStoryMultiLegacy:
    """Tests for stories with multiple legacy associations."""

    @pytest.mark.asyncio
    async def test_create_story_with_multiple_legacies(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_legacy_2: Legacy,
    ):
        """Test creating story linked to multiple legacies."""
        data = StoryCreate(
            title="Family Story",
            content="About both grandparents",
            visibility="private",
            legacies=[
                LegacyAssociationCreate(legacy_id=test_legacy.id, role="primary", position=0),
                LegacyAssociationCreate(legacy_id=test_legacy_2.id, role="secondary", position=1),
            ],
        )

        story = await story_service.create_story(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )

        assert len(story.legacies) == 2
        assert story.legacies[0].role == "primary"
        assert story.legacies[1].role == "secondary"

    @pytest.mark.asyncio
    async def test_create_story_requires_at_least_one_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test that story creation requires at least one legacy."""
        with pytest.raises(ValueError):  # Pydantic validation
            StoryCreate(
                title="Orphan Story",
                content="No legacy",
                visibility="private",
                legacies=[],
            )


class TestStoryUnionAccess:
    """Tests for union access control."""

    @pytest.mark.asyncio
    async def test_user_can_view_story_via_any_linked_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_legacy_2: Legacy,
    ):
        """Test union access - member of any legacy can view."""
        # Create story linked to both legacies
        # User 2 is only member of legacy 2
        # User 2 should still be able to view the story
        pass  # Implementation details


class TestOrphanedStories:
    """Tests for orphaned story handling."""

    @pytest.mark.asyncio
    async def test_list_orphaned_stories(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test listing stories with no legacy associations."""
        pass  # Implementation details
```

**Step 2: Run tests to verify they fail**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_story_associations.py -v`

Expected: Tests should fail (not implemented yet)

**Step 3: Commit test file**

```bash
git add services/core-api/tests/test_story_associations.py
git commit -m "test: add tests for story-legacy associations"
```

---

### Task 18: Update Existing Story Tests

**Files:**
- Modify: `services/core-api/tests/test_story_service.py`
- Modify: `services/core-api/tests/test_story_api.py`

**Step 1: Update test data to use new schema**

**Step 2: Run tests**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_story_service.py tests/test_story_api.py -v`

**Step 3: Commit**

```bash
git add services/core-api/tests/test_story_service.py services/core-api/tests/test_story_api.py
git commit -m "test: update story tests for multi-legacy model"
```

---

### Task 19: Update Media Tests

**Files:**
- Modify: `services/core-api/tests/test_media_service.py`
- Modify: `services/core-api/tests/test_media_api.py`

**Step 1: Update tests for new ownership model**

**Step 2: Run tests**

**Step 3: Commit**

```bash
git add services/core-api/tests/test_media_service.py services/core-api/tests/test_media_api.py
git commit -m "test: update media tests for user-scoped ownership"
```

---

## Phase 6: Validation

### Task 20: Run Full Test Suite

**Step 1: Run all backend tests**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest -v`

Expected: All tests pass

**Step 2: Run validation**

Run: `just validate-backend`

Expected: Passes ruff and mypy checks

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete user-scoped content architecture

- Stories, media, and conversations now owned by users
- Many-to-many relationships with legacies via junction tables
- Union access control (member of any linked legacy can view)
- S3 paths now user-scoped: users/{user_id}/{media_id}
- Orphaned content handling with soft orphan pattern

Breaking changes:
- API now uses 'legacies' array instead of 'legacy_id'
- Media routes restructured from /legacies/{id}/media to /media"
```

---

## Summary

**Total Tasks:** 20
**Estimated Time:** 4-6 hours of focused implementation

**Key Files Changed:**
- Models: 4 files (story, media, ai, associations)
- Schemas: 4 files (story, media, ai, associations)
- Services: 3 files (story, media, ai)
- Routes: 3 files (story, media, ai)
- Tests: 5+ files
- Migration: 1 file

**Verification Commands:**
```bash
# Run tests
cd /apps/mosaic-life/services/core-api && uv run pytest -v

# Run validation
just validate-backend

# Run migration (local)
docker compose -f infra/compose/docker-compose.yml exec core-api uv run alembic upgrade head
```
