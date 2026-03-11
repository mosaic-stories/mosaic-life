"""Media model for uploaded files."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .associations import MediaLegacy, MediaPerson, MediaTag
    from .tag import Tag
    from .user import User


class Media(Base):
    """Media model for uploaded files."""

    __tablename__ = "media"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    owner_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)

    favorite_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        index=False,
    )

    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_taken: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    era: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ai_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_insights: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
        index=True,
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])
    legacy_associations: Mapped[list["MediaLegacy"]] = relationship(
        "MediaLegacy",
        cascade="all, delete-orphan",
        order_by="MediaLegacy.position",
    )
    tag_associations: Mapped[list["MediaTag"]] = relationship("MediaTag", cascade="all, delete-orphan")
    person_associations: Mapped[list["MediaPerson"]] = relationship("MediaPerson", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Media(id={self.id}, filename={self.filename})>"
