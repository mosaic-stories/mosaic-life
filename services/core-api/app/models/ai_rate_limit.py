"""AI rate limit event model for tracking per-user AI/LLM endpoint usage."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class AIRateLimitEvent(Base):
    """Records a single AI/LLM-invoking request for per-user rate limiting."""

    __tablename__ = "ai_rate_limit_events"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    bucket: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        Index(
            "ix_ai_rate_limit_events_user_bucket_created",
            "user_id",
            "bucket",
            "created_at",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<AIRateLimitEvent(id={self.id}, user_id={self.user_id}, "
            f"bucket={self.bucket})>"
        )
