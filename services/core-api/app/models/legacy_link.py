"""LegacyLink and LegacyLinkShare models for consent-based legacy linking."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base


class LegacyLink(Base):
    """Consent-based link between two legacies about the same Person."""

    __tablename__ = "legacy_links"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )

    person_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requester_legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # State: pending, active, rejected, revoked
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )

    # Per-side share modes: selective (default) or all
    requester_share_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="selective", server_default="selective"
    )
    target_share_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="selective", server_default="selective"
    )

    # Audit fields
    requested_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    responded_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    revoked_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    person = relationship("Person", foreign_keys=[person_id])
    requester_legacy = relationship("Legacy", foreign_keys=[requester_legacy_id])
    target_legacy = relationship("Legacy", foreign_keys=[target_legacy_id])
    requester_user = relationship("User", foreign_keys=[requested_by])
    shares: Mapped[list["LegacyLinkShare"]] = relationship(
        "LegacyLinkShare",
        back_populates="legacy_link",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "requester_legacy_id",
            "target_legacy_id",
            name="uq_legacy_link_pair",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<LegacyLink(id={self.id}, "
            f"requester={self.requester_legacy_id}, "
            f"target={self.target_legacy_id}, "
            f"status={self.status})>"
        )


class LegacyLinkShare(Base):
    """Per-story/media sharing permission for an active legacy link."""

    __tablename__ = "legacy_link_shares"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )

    legacy_link_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacy_links.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
    )

    resource_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,  # 'story' or 'media'
    )
    resource_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)

    shared_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    shared_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Relationships
    legacy_link: Mapped["LegacyLink"] = relationship(
        "LegacyLink", back_populates="shares"
    )

    __table_args__ = (
        UniqueConstraint(
            "legacy_link_id",
            "resource_type",
            "resource_id",
            name="uq_legacy_link_share",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<LegacyLinkShare(id={self.id}, "
            f"link={self.legacy_link_id}, "
            f"type={self.resource_type})>"
        )
