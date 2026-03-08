"""Story prompts service — selection, rotation, and action handling."""

import logging
import random
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.prompt_templates import get_all_templates
from ..models.ai import AIConversation, AIMessage
from ..models.associations import ConversationLegacy, StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.story import Story
from ..models.story_evolution import StoryEvolutionSession
from ..models.story_prompt import StoryPrompt

logger = logging.getLogger(__name__)

ROTATION_HOURS = 24


def render_prompt_text(template_text: str, legacy_name: str) -> str:
    """Substitute {name} placeholder with the legacy's name."""
    return template_text.replace("{name}", legacy_name)


def select_template(
    used_template_ids: set[str],
) -> tuple[str, dict[str, str]] | None:
    """Pick a random unused template, preferring varied categories.

    Returns (category_id, template_dict) or None if all exhausted.
    """
    all_templates = get_all_templates()
    available = [
        (cat, tmpl)
        for cat, tmpl in all_templates
        if tmpl["id"] not in used_template_ids
    ]

    if not available:
        return None

    # Group by category, pick a random category first for variety
    by_category: dict[str, list[tuple[str, dict[str, str]]]] = {}
    for cat, tmpl in available:
        by_category.setdefault(cat, []).append((cat, tmpl))

    chosen_category = random.choice(list(by_category.keys()))
    return random.choice(by_category[chosen_category])


async def select_legacy(db: AsyncSession, user_id: UUID) -> UUID | None:
    """Pick the user's most recently interacted-with legacy.

    Checks recent story updates and conversation activity.
    Falls back to the user's first-joined legacy.
    """
    # Find legacy with most recent story activity
    story_legacy_q = (
        select(StoryLegacy.legacy_id, func.max(Story.updated_at).label("last_at"))
        .join(Story, Story.id == StoryLegacy.story_id)
        .where(Story.author_id == user_id)
        .group_by(StoryLegacy.legacy_id)
    )

    # Find legacy with most recent conversation activity
    conv_legacy_q = (
        select(
            ConversationLegacy.legacy_id,
            func.max(AIConversation.updated_at).label("last_at"),
        )
        .join(
            AIConversation,
            AIConversation.id == ConversationLegacy.conversation_id,
        )
        .where(AIConversation.user_id == user_id)
        .group_by(ConversationLegacy.legacy_id)
    )

    story_result = await db.execute(story_legacy_q)
    conv_result = await db.execute(conv_legacy_q)

    activity: dict[UUID, datetime] = {}
    for row in story_result:
        legacy_id = row.legacy_id
        last_at: datetime = row.last_at
        if legacy_id not in activity or last_at > activity[legacy_id]:
            activity[legacy_id] = last_at

    for row in conv_result:
        legacy_id = row.legacy_id
        last_at = row.last_at
        if legacy_id not in activity or last_at > activity[legacy_id]:
            activity[legacy_id] = last_at

    if activity:
        return max(activity, key=lambda lid: activity[lid])

    # Fallback: user's first-joined legacy (using joined_at, NOT created_at)
    fallback_q = (
        select(LegacyMember.legacy_id)
        .where(LegacyMember.user_id == user_id)
        .order_by(LegacyMember.joined_at.asc())
        .limit(1)
    )
    fallback_result = await db.execute(fallback_q)
    return fallback_result.scalar_one_or_none()


async def get_used_template_ids(
    db: AsyncSession, user_id: UUID, legacy_id: UUID
) -> set[str]:
    """Get template IDs already used for this user+legacy combination."""
    q = select(StoryPrompt.template_id).where(
        StoryPrompt.user_id == user_id,
        StoryPrompt.legacy_id == legacy_id,
        StoryPrompt.template_id.isnot(None),
    )
    result = await db.execute(q)
    return {tid for tid in result.scalars() if tid is not None}


async def get_or_create_active_prompt(
    db: AsyncSession, user_id: UUID
) -> StoryPrompt | None:
    """Get the user's current active prompt, or create one.

    Auto-rotates prompts older than ROTATION_HOURS.
    Returns None if user has no legacies.
    """
    q = select(StoryPrompt).where(
        StoryPrompt.user_id == user_id,
        StoryPrompt.status == "active",
    )
    result = await db.execute(q)
    active = result.scalar_one_or_none()

    if active:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=ROTATION_HOURS)
        if active.created_at.replace(tzinfo=timezone.utc) < cutoff:
            active.status = "rotated"
            await db.flush()
        else:
            return active

    return await _generate_prompt(db, user_id)


async def _generate_prompt(
    db: AsyncSession,
    user_id: UUID,
    exclude_template_id: str | None = None,
) -> StoryPrompt | None:
    """Generate a new active prompt for the user."""
    legacy_id = await select_legacy(db, user_id)
    if not legacy_id:
        return None

    legacy = await db.get(Legacy, legacy_id)
    if not legacy:
        return None

    used_ids = await get_used_template_ids(db, user_id, legacy_id)
    if exclude_template_id:
        used_ids.add(exclude_template_id)

    selection = select_template(used_ids)
    if not selection:
        # All templates exhausted — reset and try again, excluding only the current
        selection = select_template(
            set() if not exclude_template_id else {exclude_template_id}
        )
        if not selection:
            return None

    category, template = selection
    prompt_text = render_prompt_text(template["text"], legacy.name)

    prompt = StoryPrompt(
        user_id=user_id,
        legacy_id=legacy_id,
        template_id=template["id"],
        prompt_text=prompt_text,
        category=category,
        status="active",
    )
    db.add(prompt)
    await db.flush()

    logger.info(
        "story_prompt.created",
        extra={
            "user_id": str(user_id),
            "legacy_id": str(legacy_id),
            "template_id": template["id"],
        },
    )
    return prompt


async def shuffle_prompt(
    db: AsyncSession, prompt_id: UUID, user_id: UUID
) -> StoryPrompt | None:
    """Rotate the current prompt and generate a new one."""
    current = await db.get(StoryPrompt, prompt_id)
    if not current or current.user_id != user_id:
        raise HTTPException(status_code=404, detail="Prompt not found")

    old_template_id = current.template_id
    current.status = "rotated"
    await db.flush()

    return await _generate_prompt(db, user_id, exclude_template_id=old_template_id)


async def act_on_prompt(
    db: AsyncSession,
    prompt_id: UUID,
    action: str,
    user_id: UUID,
) -> dict[str, str | None]:
    """Handle user action on a prompt — write_story or discuss."""
    prompt = await db.get(StoryPrompt, prompt_id)
    if not prompt or prompt.user_id != user_id:
        raise HTTPException(status_code=404, detail="Prompt not found")
    if prompt.status != "active":
        raise HTTPException(status_code=400, detail="Prompt is no longer active")

    legacy = await db.get(Legacy, prompt.legacy_id)
    legacy_name = legacy.name if legacy else "Unknown"

    if action == "write_story":
        return await _act_write_story(db, prompt, user_id, legacy_name)
    elif action == "discuss":
        return await _act_discuss(db, prompt, user_id)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")


async def _act_write_story(
    db: AsyncSession,
    prompt: StoryPrompt,
    user_id: UUID,
    legacy_name: str,
) -> dict[str, str | None]:
    """Create a draft story + evolution session from the prompt."""
    # 1. Create conversation
    conversation = AIConversation(
        user_id=user_id,
        persona_id="biographer",
    )
    db.add(conversation)
    await db.flush()

    # Link conversation to legacy
    db.add(
        ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=prompt.legacy_id,
            role="primary",
            position=0,
        )
    )

    # Seed the prompt as first user message
    db.add(
        AIMessage(
            conversation_id=conversation.id,
            role="user",
            content=prompt.prompt_text,
        )
    )

    # 2. Create draft story
    story = Story(
        author_id=user_id,
        title=f"Story about {legacy_name}",
        content="",
        visibility="personal",
        status="draft",
        source_conversation_id=conversation.id,
    )
    db.add(story)
    await db.flush()

    # Link story to legacy
    db.add(
        StoryLegacy(
            story_id=story.id,
            legacy_id=prompt.legacy_id,
            role="primary",
            position=0,
        )
    )

    # 3. Create evolution session
    evo_session = StoryEvolutionSession(
        story_id=story.id,
        base_version_number=1,
        conversation_id=conversation.id,
        phase="elicitation",
        created_by=user_id,
    )
    db.add(evo_session)
    await db.flush()

    # Update prompt
    prompt.status = "used_story"
    prompt.acted_on_at = datetime.now(timezone.utc)
    prompt.story_id = story.id
    prompt.conversation_id = conversation.id

    logger.info(
        "story_prompt.write_story",
        extra={
            "user_id": str(user_id),
            "prompt_id": str(prompt.id),
            "story_id": str(story.id),
        },
    )

    return {
        "action": "write_story",
        "legacy_id": str(prompt.legacy_id),
        "story_id": str(story.id),
        "conversation_id": str(conversation.id),
    }


async def _act_discuss(
    db: AsyncSession,
    prompt: StoryPrompt,
    user_id: UUID,
) -> dict[str, str | None]:
    """Create a conversation and seed it with the prompt."""
    conversation = AIConversation(
        user_id=user_id,
        persona_id="biographer",
    )
    db.add(conversation)
    await db.flush()

    # Link to legacy
    db.add(
        ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=prompt.legacy_id,
            role="primary",
            position=0,
        )
    )

    # Seed with prompt as first user message
    db.add(
        AIMessage(
            conversation_id=conversation.id,
            role="user",
            content=prompt.prompt_text,
        )
    )

    # Update prompt
    prompt.status = "used_discuss"
    prompt.acted_on_at = datetime.now(timezone.utc)
    prompt.conversation_id = conversation.id

    await db.flush()

    logger.info(
        "story_prompt.discuss",
        extra={
            "user_id": str(user_id),
            "prompt_id": str(prompt.id),
            "conversation_id": str(conversation.id),
        },
    )

    return {
        "action": "discuss",
        "legacy_id": str(prompt.legacy_id),
        "conversation_id": str(conversation.id),
    }
