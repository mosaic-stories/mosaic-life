"""UserActivity model for tracking user activity."""

from datetime import datetime
from typing import Any, TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSON as PG_JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .user import User


class UserActivity(Base):
    """Polymorphic activity tracking table for all entity types."""

    __tablename__ = "user_activity"

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

    action: Mapped[str] = mapped_column(
        String(50),
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
    )

    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata",
        PG_JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_user_activity_feed", "user_id", created_at.desc()),
        Index(
            "ix_user_activity_dedup",
            "user_id",
            "entity_type",
            "entity_id",
            created_at.desc(),
        ),
    )

    def __repr__(self) -> str:
        return f"<UserActivity(user_id={self.user_id}, action={self.action}, entity_type={self.entity_type})>"
