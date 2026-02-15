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
