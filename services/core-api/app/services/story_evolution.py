"""Service layer for story evolution session management."""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.associations import ConversationLegacy, StoryLegacy
from app.models.story import Story
from app.models.story_evolution import StoryEvolutionSession
from app.models.story_version import StoryVersion

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


async def _require_story_author(
    db: AsyncSession, story_id: uuid.UUID, user_id: uuid.UUID
) -> Story:
    """Load story and verify user is the author. Raises 404 or 403."""
    result = await db.execute(select(Story).where(Story.id == story_id).options())
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if story.author_id != user_id:
        raise HTTPException(
            status_code=403, detail="Only the story author can evolve it"
        )
    return story


async def _get_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Load session and verify ownership. Raises 404 or 403."""
    result = await db.execute(
        select(StoryEvolutionSession).where(
            StoryEvolutionSession.id == session_id,
            StoryEvolutionSession.story_id == story_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Evolution session not found")
    if session.created_by != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return session


async def start_session(
    db: AsyncSession,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
    persona_id: str,
) -> StoryEvolutionSession:
    """Start a new evolution session for a story."""
    story = await _require_story_author(db, story_id, user_id)

    # Check for existing non-terminal session
    existing = await db.execute(
        select(StoryEvolutionSession).where(
            StoryEvolutionSession.story_id == story_id,
            StoryEvolutionSession.phase.notin_(StoryEvolutionSession.TERMINAL_PHASES),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="An active evolution session already exists for this story",
        )

    # Get primary legacy for conversation
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary_legacy = legacy_result.scalar_one_or_none()
    if not primary_legacy:
        raise HTTPException(status_code=422, detail="Story must have a primary legacy")

    # Determine base version number
    base_version_number = 1
    if story.active_version_id:
        version_result = await db.execute(
            select(StoryVersion.version_number).where(
                StoryVersion.id == story.active_version_id
            )
        )
        vn = version_result.scalar_one_or_none()
        if vn:
            base_version_number = vn

    # Create conversation for elicitation
    conversation = AIConversation(
        user_id=user_id,
        persona_id=persona_id,
        title=f"Story Evolution: {story.title}",
    )
    db.add(conversation)
    await db.flush()

    # Link conversation to legacy
    conv_legacy = ConversationLegacy(
        conversation_id=conversation.id,
        legacy_id=primary_legacy.legacy_id,
        role="primary",
        position=0,
    )
    db.add(conv_legacy)

    # Create session
    session = StoryEvolutionSession(
        story_id=story_id,
        base_version_number=base_version_number,
        conversation_id=conversation.id,
        phase="elicitation",
        created_by=user_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.session.started",
        extra={
            "session_id": str(session.id),
            "story_id": str(story_id),
            "user_id": str(user_id),
            "persona_id": persona_id,
        },
    )

    return session


async def get_active_session(
    db: AsyncSession,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession | None:
    """Get the active (non-terminal) session for a story."""
    await _require_story_author(db, story_id, user_id)

    result = await db.execute(
        select(StoryEvolutionSession).where(
            StoryEvolutionSession.story_id == story_id,
            StoryEvolutionSession.phase.notin_(StoryEvolutionSession.TERMINAL_PHASES),
        )
    )
    return result.scalar_one_or_none()


async def advance_phase(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
    target_phase: str,
    summary_text: str | None = None,
    writing_style: str | None = None,
    length_preference: str | None = None,
) -> StoryEvolutionSession:
    """Advance the session to a new phase with validation."""
    session = await _get_session(db, session_id, story_id, user_id)

    if not session.can_transition_to(target_phase):
        raise HTTPException(
            status_code=422,
            detail=f"Cannot transition from '{session.phase}' to '{target_phase}'",
        )

    session.phase = target_phase

    if summary_text is not None:
        session.summary_text = summary_text
    if writing_style is not None:
        session.writing_style = writing_style
    if length_preference is not None:
        session.length_preference = length_preference

    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.phase.advanced",
        extra={
            "session_id": str(session_id),
            "phase": target_phase,
        },
    )

    return session


async def discard_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Discard an evolution session."""
    session = await _get_session(db, session_id, story_id, user_id)

    if session.is_terminal:
        raise HTTPException(
            status_code=422,
            detail="Cannot discard a session that is already terminal",
        )

    # Delete draft version if one exists
    if session.draft_version_id:
        draft = await db.execute(
            select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
        )
        draft_version = draft.scalar_one_or_none()
        if draft_version:
            await db.delete(draft_version)

    session.phase = "discarded"
    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.session.discarded",
        extra={"session_id": str(session_id)},
    )

    return session


async def accept_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Accept the draft and complete the session."""
    session = await _get_session(db, session_id, story_id, user_id)

    if session.phase != "review":
        raise HTTPException(
            status_code=422,
            detail="Can only accept from review phase",
        )

    if not session.draft_version_id:
        raise HTTPException(
            status_code=422,
            detail="No draft to accept",
        )

    # Load draft version
    draft_result = await db.execute(
        select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
    )
    draft_version = draft_result.scalar_one_or_none()
    if not draft_version:
        raise HTTPException(status_code=404, detail="Draft version not found")

    # Deactivate current active version
    story = await db.execute(select(Story).where(Story.id == story_id))
    story_obj = story.scalar_one()

    if story_obj.active_version_id:
        current_active = await db.execute(
            select(StoryVersion).where(StoryVersion.id == story_obj.active_version_id)
        )
        current = current_active.scalar_one_or_none()
        if current:
            current.status = "inactive"

    # Promote draft to active
    draft_version.status = "active"
    draft_version.source_conversation_id = session.conversation_id

    # Update story content and active version
    story_obj.title = draft_version.title
    story_obj.content = draft_version.content
    story_obj.active_version_id = draft_version.id

    # Complete session
    session.phase = "completed"
    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.session.completed",
        extra={
            "session_id": str(session_id),
            "version_id": str(draft_version.id),
        },
    )

    return session
