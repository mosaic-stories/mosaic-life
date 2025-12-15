"""User model for Google OAuth authentication."""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .support_request import SupportRequest
    from .user_session import UserSession


class User(Base):
    """User model representing authenticated users via Google OAuth."""

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    google_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preferences: Mapped[dict[str, Any]] = mapped_column(
        MutableDict.as_mutable(JSON),
        nullable=False,
        default=dict,
        server_default="{}",
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
    support_requests: Mapped[list["SupportRequest"]] = relationship(
        "SupportRequest", back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["UserSession"]] = relationship(
        "UserSession", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, name={self.name})>"
