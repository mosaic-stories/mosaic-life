"""StoryVersion model for story version history."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .story import Story
    from .user import User


class StoryVersion(Base):
    """A snapshot of a story at a point in time."""

    __tablename__ = "story_versions"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    story_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version_number: Mapped[int] = mapped_column(Integer, nullable=False)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="inactive",
    )

    source: Mapped[str] = mapped_column(String(50), nullable=False)

    source_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    stale: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )

    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    story: Mapped["Story"] = relationship(
        "Story", foreign_keys=[story_id], back_populates="versions"
    )
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])

    __table_args__ = ({"comment": "Story version snapshots with full content"},)

    def __repr__(self) -> str:
        return f"<StoryVersion(id={self.id}, story_id={self.story_id}, v={self.version_number}, status={self.status})>"
