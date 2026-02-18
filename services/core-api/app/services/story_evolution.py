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
    from typing import Any

    from app.adapters.ai import LLMProvider, AgentMemory

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


_OPENING_INSTRUCTION = (
    "[System] The user has just started a story evolution session. "
    "This is the very first message in the conversation. Please:\n"
    "1. Briefly greet the user and introduce what you'll be doing together\n"
    "2. Share what stood out to you about the story — key moments, themes, "
    "or details that caught your attention\n"
    "3. Suggest 2-3 specific directions they could explore to deepen the story "
    "(based on what you read)\n"
    "4. Let them know they're free to take the conversation in any direction\n\n"
    "Keep it warm, concise, and inviting. Use 2-3 short paragraphs."
)


async def generate_opening_message(
    db: AsyncSession,
    session: StoryEvolutionSession,
    llm_provider: LLMProvider,
    memory: AgentMemory,
) -> None:
    """Generate an opening message from the persona for a new evolution session.

    Builds the elicitation system prompt, calls the LLM with a synthetic
    instruction (not saved), and saves the assistant response as the first
    message in the conversation.
    """
    from app.config.personas import build_system_prompt, get_persona
    from app.models.legacy import Legacy

    # Load story content
    story_result = await db.execute(select(Story).where(Story.id == session.story_id))
    story = story_result.scalar_one_or_none()
    if not story:
        logger.warning(
            "evolution.opening.story_not_found",
            extra={"session_id": str(session.id)},
        )
        return

    # Load legacy name
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == session.story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary = legacy_result.scalar_one_or_none()
    legacy_name = "the person"
    if primary:
        leg = await db.execute(select(Legacy).where(Legacy.id == primary.legacy_id))
        legacy = leg.scalar_one_or_none()
        if legacy:
            legacy_name = legacy.name

    # Get persona config for model_id
    conv_result = await db.execute(
        select(AIConversation).where(AIConversation.id == session.conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    persona_id = conv.persona_id if conv else "biographer"
    persona = get_persona(persona_id)
    if not persona:
        logger.warning(
            "evolution.opening.persona_not_found",
            extra={"persona_id": persona_id},
        )
        return

    # Build system prompt with elicitation mode active
    system_prompt = build_system_prompt(
        persona_id=persona_id,
        legacy_name=legacy_name,
        elicitation_mode=True,
        original_story_text=story.content,
    )
    if not system_prompt:
        return

    # Generate the opening message (collect streamed chunks)
    try:
        chunks: list[str] = []
        async for chunk in llm_provider.stream_generate(
            messages=[{"role": "user", "content": _OPENING_INSTRUCTION}],
            system_prompt=system_prompt,
            model_id=persona.model_id,
            max_tokens=persona.max_tokens,
        ):
            chunks.append(chunk)

        opening_text = "".join(chunks).strip()
        if not opening_text:
            return

        # Save as assistant message (the synthetic user message is NOT saved)
        await memory.save_message(
            db=db,
            conversation_id=session.conversation_id,
            role="assistant",
            content=opening_text,
        )

        logger.info(
            "evolution.opening.generated",
            extra={
                "session_id": str(session.id),
                "length": len(opening_text),
            },
        )
    except Exception:
        # Opening message is best-effort — don't fail session creation
        logger.exception(
            "evolution.opening.generation_failed",
            extra={"session_id": str(session.id)},
        )


_SUMMARIZE_SYSTEM_PROMPT = """\
You are a structured summariser. You have been given the transcript of a \
conversation between a user and an AI interviewer about a personal story. \
Your job is to extract and organise every new piece of information the user \
shared during the conversation.

Output ONLY a structured summary using exactly these section headers \
(skip a section if nothing applies):

**New Details** — Facts, events, descriptions surfaced in conversation
**People Mentioned** — New people or expanded details about existing people
**Timeline/Sequence** — Temporal ordering, dates, sequences clarified
**Emotions/Significance** — What moments meant, how people felt
**Corrections to Original** — Anything the user wants changed from the existing story

Under each header, use bullet points (- ). Be specific and concrete — \
include names, places, dates, and direct quotes when available. \
Do not add commentary, do not fabricate, do not summarise the original story. \
Only report what the user said in the conversation."""


async def summarize_conversation(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
    llm_provider: LLMProvider,
) -> StoryEvolutionSession:
    """Generate a structured summary from the elicitation conversation."""
    from app.config.settings import get_settings
    from app.services.ai import get_context_messages

    session = await _get_session(db, session_id, story_id, user_id)

    if session.phase != "elicitation":
        raise HTTPException(
            status_code=422,
            detail="Can only summarize from elicitation phase",
        )

    # Load conversation messages
    messages = await get_context_messages(db, session.conversation_id)
    if not messages:
        raise HTTPException(
            status_code=422,
            detail="No conversation messages to summarize",
        )

    # Load original story text for context
    story_result = await db.execute(select(Story).where(Story.id == session.story_id))
    story = story_result.scalar_one_or_none()
    original_story = story.content if story else ""

    # Build the user message with conversation transcript
    transcript_lines: list[str] = []
    for msg in messages:
        role_label = "User" if msg["role"] == "user" else "Interviewer"
        transcript_lines.append(f"{role_label}: {msg['content']}")
    transcript = "\n\n".join(transcript_lines)

    user_message = (
        f"## Original Story\n\n{original_story}\n\n"
        f"## Conversation Transcript\n\n{transcript}"
    )

    # Generate summary (collect streamed chunks)
    settings = get_settings()
    chunks: list[str] = []
    async for chunk in llm_provider.stream_generate(
        messages=[{"role": "user", "content": user_message}],
        system_prompt=_SUMMARIZE_SYSTEM_PROMPT,
        model_id=settings.evolution_summarization_model_id,
        max_tokens=2048,
    ):
        chunks.append(chunk)

    summary_text = "".join(chunks).strip()
    if not summary_text:
        raise HTTPException(
            status_code=500,
            detail="Summary generation returned empty result",
        )

    # Save summary and advance phase
    session.summary_text = summary_text
    session.phase = "summary"
    await db.commit()
    await db.refresh(session)

    logger.info(
        "evolution.conversation.summarized",
        extra={
            "session_id": str(session_id),
            "summary_length": len(summary_text),
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


async def get_session_for_generation(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Get session and validate it's ready for generation."""
    session = await _get_session(db, session_id, story_id, user_id)
    if session.phase not in ("style_selection", "drafting"):
        raise HTTPException(
            status_code=422,
            detail="Can only generate from style_selection or drafting phase",
        )
    if not session.writing_style or not session.length_preference:
        raise HTTPException(
            status_code=422,
            detail="Writing style and length preference must be set",
        )
    # Advance to drafting (only if not already there)
    if session.phase == "style_selection":
        session.phase = "drafting"
        await db.commit()
        await db.refresh(session)
    return session


async def get_session_for_revision(
    db: AsyncSession,
    session_id: uuid.UUID,
    story_id: uuid.UUID,
    user_id: uuid.UUID,
) -> StoryEvolutionSession:
    """Get session and validate it's ready for revision."""
    session = await _get_session(db, session_id, story_id, user_id)
    if session.phase != "review":
        raise HTTPException(
            status_code=422,
            detail="Can only revise from review phase",
        )
    if not session.draft_version_id:
        raise HTTPException(
            status_code=422,
            detail="No draft to revise",
        )
    return session


async def build_generation_context(
    db: AsyncSession,
    session: StoryEvolutionSession,
    include_draft: bool = False,
) -> dict[str, Any]:
    """Build the context package for the writing agent."""
    from app.config.personas import get_persona
    from app.models.legacy import Legacy

    # Load story
    story_result = await db.execute(select(Story).where(Story.id == session.story_id))
    story = story_result.scalar_one()

    # Load active version content
    original_story = story.content
    if story.active_version_id:
        version_result = await db.execute(
            select(StoryVersion).where(StoryVersion.id == story.active_version_id)
        )
        active_version = version_result.scalar_one_or_none()
        if active_version:
            original_story = active_version.content

    # Load primary legacy
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == session.story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary = legacy_result.scalar_one_or_none()
    legacy_name = "the person"
    if primary:
        leg = await db.execute(select(Legacy).where(Legacy.id == primary.legacy_id))
        legacy = leg.scalar_one_or_none()
        if legacy:
            legacy_name = legacy.name

    # Get persona model_id via conversation
    conv_result = await db.execute(
        select(AIConversation).where(AIConversation.id == session.conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    persona_id = conv.persona_id if conv else "biographer"
    persona = get_persona(persona_id)
    model_id = (
        persona.model_id if persona else "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    )

    context: dict[str, Any] = {
        "original_story": original_story,
        "summary_text": session.summary_text or "",
        "writing_style": session.writing_style or "vivid",
        "length_preference": session.length_preference or "similar",
        "legacy_name": legacy_name,
        "story_title": story.title,
        "model_id": model_id,
    }

    if include_draft and session.draft_version_id:
        draft_result = await db.execute(
            select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
        )
        draft = draft_result.scalar_one_or_none()
        if draft:
            context["previous_draft"] = draft.content

    return context


async def save_draft(
    db: AsyncSession,
    session: StoryEvolutionSession,
    title: str,
    content: str,
    user_id: uuid.UUID,
) -> StoryVersion:
    """Create or replace the draft StoryVersion for this session."""
    # Get next version number
    max_result = await db.execute(
        select(StoryVersion.version_number)
        .where(StoryVersion.story_id == session.story_id)
        .order_by(StoryVersion.version_number.desc())
        .limit(1)
    )
    max_version = max_result.scalar_one_or_none() or 0

    # Delete existing draft if any
    if session.draft_version_id:
        existing = await db.execute(
            select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
        )
        old_draft = existing.scalar_one_or_none()
        if old_draft:
            await db.delete(old_draft)
            await db.flush()

    draft = StoryVersion(
        story_id=session.story_id,
        version_number=max_version + 1,
        title=title,
        content=content,
        status="draft",
        source="story_evolution",
        created_by=user_id,
    )
    db.add(draft)
    await db.flush()

    session.draft_version_id = draft.id
    session.phase = "review"
    await db.commit()
    await db.refresh(draft)

    return draft


async def update_draft(
    db: AsyncSession,
    session: StoryEvolutionSession,
    content: str,
) -> StoryVersion:
    """Update an existing draft with revised content."""
    if not session.draft_version_id:
        raise HTTPException(status_code=422, detail="No draft to update")

    result = await db.execute(
        select(StoryVersion).where(StoryVersion.id == session.draft_version_id)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft version not found")

    draft.content = content
    session.revision_count += 1
    await db.commit()
    await db.refresh(draft)

    return draft
