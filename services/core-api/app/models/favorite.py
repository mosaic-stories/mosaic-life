"""UserFavorite model for tracking user favorites."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .user import User


class UserFavorite(Base):
    """Polymorphic favorites table for stories, legacies, and media."""

    __tablename__ = "user_favorites"

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

    entity_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    entity_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint(
            "user_id", "entity_type", "entity_id", name="uq_user_favorite"
        ),
    )

    def __repr__(self) -> str:
        return f"<UserFavorite(user_id={self.user_id}, entity_type={self.entity_type}, entity_id={self.entity_id})>"
