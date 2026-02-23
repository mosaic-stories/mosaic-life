"""Person model representing a canonical real-world person identity."""

from datetime import date, datetime
from typing import Any, TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, String
from sqlalchemy.dialects.postgresql import JSON, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .legacy import Legacy


class Person(Base):
    """Canonical identity for a real-world person.

    Multiple Legacies can reference the same Person. This enables
    identity matching, legacy linking, and shared content access.
    """

    __tablename__ = "persons"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    canonical_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    aliases: Mapped[list[Any] | None] = mapped_column(
        JSON, nullable=False, server_default="[]"
    )

    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    birth_date_approximate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    death_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    death_date_approximate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    locations: Mapped[list[Any] | None] = mapped_column(
        JSON, nullable=False, server_default="[]"
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

    legacies: Mapped[list["Legacy"]] = relationship(
        "Legacy", back_populates="person", foreign_keys="Legacy.person_id"
    )

    def __repr__(self) -> str:
        return f"<Person(id={self.id}, canonical_name={self.canonical_name})>"
