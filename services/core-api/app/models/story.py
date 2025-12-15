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
