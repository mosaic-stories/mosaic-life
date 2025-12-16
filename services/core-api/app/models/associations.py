"""Association models for many-to-many relationships between content and legacies."""

from typing import Literal
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

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
