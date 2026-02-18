"""StoryEvolutionSession model for orchestrating story evolution workflow."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .ai import AIConversation
    from .story import Story
    from .story_version import StoryVersion
    from .user import User


class StoryEvolutionSession(Base):
    """Orchestrates the story evolution workflow state."""

    __tablename__ = "story_evolution_sessions"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    story_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    base_version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    conversation_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    draft_version_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("story_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    phase: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="elicitation",
    )
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    writing_style: Mapped[str | None] = mapped_column(String(20), nullable=True)
    length_preference: Mapped[str | None] = mapped_column(String(20), nullable=True)
    revision_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    story: Mapped["Story"] = relationship(
        "Story", foreign_keys=[story_id], lazy="selectin"
    )
    conversation: Mapped["AIConversation"] = relationship(
        "AIConversation", foreign_keys=[conversation_id], lazy="selectin"
    )
    draft_version: Mapped["StoryVersion | None"] = relationship(
        "StoryVersion", foreign_keys=[draft_version_id], lazy="selectin"
    )
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        # Only one active (non-terminal) session per story
        # Note: postgresql_where is PostgreSQL-specific; ignored by SQLite in tests
    )

    # Valid phase values
    PHASES = {
        "elicitation",
        "summary",
        "style_selection",
        "drafting",
        "review",
        "completed",
        "discarded",
    }

    TERMINAL_PHASES = {"completed", "discarded"}

    # Phase ordering for backward transition detection
    PHASE_ORDER: dict[str, int] = {
        "elicitation": 0,
        "summary": 1,
        "style_selection": 2,
        "drafting": 3,
        "review": 4,
    }

    # Valid phase transitions (forward + backward)
    VALID_TRANSITIONS: dict[str, set[str]] = {
        "elicitation": {"summary", "discarded"},
        "summary": {"style_selection", "elicitation", "discarded"},
        "style_selection": {"drafting", "summary", "elicitation", "discarded"},
        "drafting": {"review"},
        "review": {"completed", "discarded", "review", "style_selection", "summary", "elicitation"},
    }

    WRITING_STYLES = {"vivid", "emotional", "conversational", "concise", "documentary"}
    LENGTH_PREFERENCES = {"similar", "shorter", "longer"}

    @property
    def is_terminal(self) -> bool:
        """Check if the session is in a terminal phase."""
        return self.phase in self.TERMINAL_PHASES

    def can_transition_to(self, target_phase: str) -> bool:
        """Check if transition to target phase is allowed."""
        allowed = self.VALID_TRANSITIONS.get(self.phase, set())
        return target_phase in allowed

    def __repr__(self) -> str:
        return f"<StoryEvolutionSession(id={self.id}, story_id={self.story_id}, phase={self.phase})>"
