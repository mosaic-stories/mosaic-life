"""Invitation model for legacy member invitations."""

from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .legacy import Legacy
    from .user import User


class Invitation(Base):
    """Invitation model for inviting users to join a legacy."""

    __tablename__ = "invitations"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="advocate",
    )
    invited_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    legacy: Mapped["Legacy"] = relationship("Legacy", back_populates="invitations")
    inviter: Mapped["User"] = relationship("User")

    def _get_utc_now(self) -> datetime:
        """Get current UTC time, matching timezone-awareness of expires_at.

        SQLite doesn't store timezone info, so we need to handle both
        timezone-aware (PostgreSQL) and naive (SQLite test) datetimes.
        """
        now = datetime.now(timezone.utc)
        # If expires_at is naive (SQLite), return naive UTC time
        if self.expires_at.tzinfo is None:
            return now.replace(tzinfo=None)
        return now

    @property
    def is_pending(self) -> bool:
        """Check if invitation is still pending."""
        now = self._get_utc_now()
        return (
            self.accepted_at is None
            and self.revoked_at is None
            and self.expires_at > now
        )

    @property
    def is_expired(self) -> bool:
        """Check if invitation has expired."""
        now = self._get_utc_now()
        return self.expires_at <= now and self.accepted_at is None

    @property
    def status(self) -> str:
        """Get the current status of the invitation."""
        if self.accepted_at is not None:
            return "accepted"
        if self.revoked_at is not None:
            return "revoked"
        if self.is_expired:
            return "expired"
        return "pending"

    def __repr__(self) -> str:
        return f"<Invitation(id={self.id}, email={self.email}, role={self.role}, status={self.status})>"
