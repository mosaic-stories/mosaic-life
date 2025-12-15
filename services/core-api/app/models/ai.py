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
