"""Tag model for categorizing media within a legacy."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .legacy import Legacy
    from .user import User


class Tag(Base):
    """Tag for categorizing media within a legacy."""

    __tablename__ = "tags"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)

    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    legacy: Mapped["Legacy"] = relationship("Legacy", foreign_keys=[legacy_id])
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])

    __table_args__ = (UniqueConstraint("name", "legacy_id", name="uq_tag_name_legacy"),)

    def __repr__(self) -> str:
        return f"<Tag(id={self.id}, name={self.name}, legacy_id={self.legacy_id})>"
