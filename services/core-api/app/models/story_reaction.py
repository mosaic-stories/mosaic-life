"""StoryReaction model for member reactions left on a story."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .story import Story
    from .user import User


class StoryReaction(Base):
    """A per-user, per-type toggleable reaction on a story.

    One row per (story, user, reaction_type). Reacting again with the same
    type deletes the row (toggle off) rather than soft-deleting it — unlike
    `StoryResponse`, there is no edit history or "also reacted" fan-out that
    needs a removed reaction's row to stick around.
    """

    __tablename__ = "story_reactions"

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

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # One of 'heart', 'candle', 'smile'.
    reaction_type: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    story: Mapped["Story"] = relationship("Story", foreign_keys=[story_id])
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint(
            "story_id", "user_id", "reaction_type", name="uq_story_reaction"
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<StoryReaction(id={self.id}, story_id={self.story_id}, "
            f"user_id={self.user_id}, reaction_type={self.reaction_type})>"
        )
