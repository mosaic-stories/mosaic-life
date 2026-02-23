"""Legacy and LegacyMember models."""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base
from .user import User

if TYPE_CHECKING:
    from .invitation import Invitation
    from .media import Media
    from .person import Person


class Legacy(Base):
    """Legacy model representing a person being remembered."""

    __tablename__ = "legacies"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    death_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    biography: Mapped[str | None] = mapped_column(Text, nullable=True)

    visibility: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="private",
        index=True,
    )

    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
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

    profile_image_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    person_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )

    # Relationships
    person: Mapped["Person"] = relationship("Person", foreign_keys=[person_id])
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    members: Mapped[list["LegacyMember"]] = relationship(
        "LegacyMember",
        back_populates="legacy",
        cascade="all, delete-orphan",
    )
    invitations: Mapped[list["Invitation"]] = relationship(
        "Invitation",
        back_populates="legacy",
        cascade="all, delete-orphan",
    )
    profile_image: Mapped["Media | None"] = relationship(
        "Media",
        foreign_keys=[profile_image_id],
        lazy="joined",
    )

    def __repr__(self) -> str:
        return f"<Legacy(id={self.id}, name={self.name})>"


class LegacyMember(Base):
    """LegacyMember model for access control and join requests."""

    __tablename__ = "legacy_members"

    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Roles: 'creator', 'admin', 'advocate', 'admirer'
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="advocate",
        index=True,
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    legacy: Mapped["Legacy"] = relationship("Legacy", back_populates="members")
    user: Mapped["User"] = relationship("User")

    __table_args__ = (
        UniqueConstraint("legacy_id", "user_id", name="uq_legacy_member"),
    )

    def __repr__(self) -> str:
        return f"<LegacyMember(legacy_id={self.legacy_id}, user_id={self.user_id}, role={self.role})>"
