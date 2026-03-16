"""Shared relationship model for connections and legacy memberships."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    JSON,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class Relationship(Base):
    """Relationship data owned by a user, in the context of a connection or legacy membership."""

    __tablename__ = "relationships"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    owner_user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Context: connection (nullable)
    connection_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    # Context: legacy membership (nullable composite FK)
    legacy_member_legacy_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )
    legacy_member_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )

    # Relationship data
    relationship_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    who_they_are_to_me: Mapped[str | None] = mapped_column(Text, nullable=True)
    who_i_am_to_them: Mapped[str | None] = mapped_column(Text, nullable=True)
    nicknames: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    character_traits: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

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

    __table_args__ = (
        ForeignKeyConstraint(
            ["legacy_member_legacy_id", "legacy_member_user_id"],
            ["legacy_members.legacy_id", "legacy_members.user_id"],
            ondelete="CASCADE",
            name="fk_relationship_legacy_member",
        ),
        CheckConstraint(
            """(
                (connection_id IS NOT NULL AND legacy_member_legacy_id IS NULL AND legacy_member_user_id IS NULL)
                OR
                (connection_id IS NULL AND legacy_member_legacy_id IS NOT NULL AND legacy_member_user_id IS NOT NULL)
            )""",
            name="ck_relationship_exactly_one_context",
        ),
    )

    def __repr__(self) -> str:
        return f"<Relationship(id={self.id}, owner={self.owner_user_id}, type={self.relationship_type})>"
