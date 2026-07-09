"""Story reaction service — toggle + notification fan-out.

Access gating reuses `story_response.require_legacy_member_or_story_author`
as-is (per the story-responses design §2: reactions follow the exact same
"non-pending member of any legacy the story is associated with, or the
story's author" gate as responses do). This module does not duplicate that
logic or modify `story_access.py`.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from prometheus_client import Counter
from sqlalchemy import case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.story import Story
from ..models.story_reaction import StoryReaction as StoryReactionModel
from ..models.user import User
from ..services import notification as notification_service
from ..services.story_response import require_legacy_member_or_story_author

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.story_reaction")

REACTIONS_TOGGLED = Counter(
    "story_reactions_toggled_total",
    "Story reactions toggled (on or off)",
    ["service", "component", "reaction_type"],
)


async def _load_story_with_legacies(db: AsyncSession, story_id: UUID) -> Story:
    """Load a story with its legacy associations, or raise 404.

    Duplicated from `story_response.py` rather than imported, mirroring how
    each service module (e.g. `favorite.py`) owns its own entity loader; the
    piece that must not be duplicated per the design is the *gating logic*
    (`require_legacy_member_or_story_author`), which is imported instead.
    """
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()
    if story is None:
        raise HTTPException(status_code=404, detail="Story not found")
    return story


def _primary_legacy_id(story: Story) -> UUID | None:
    """Return the story's primary legacy id, falling back to the first one."""
    if not story.legacy_associations:
        return None
    primary = next(
        (assoc for assoc in story.legacy_associations if assoc.role == "primary"),
        story.legacy_associations[0],
    )
    return primary.legacy_id


async def _increment_reaction_count(
    db: AsyncSession, story_id: UUID, reaction_type: str
) -> None:
    """Atomic DB-side increment for the given reaction type's counter column."""
    if reaction_type == "heart":
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(reaction_heart_count=Story.reaction_heart_count + 1)
        )
    elif reaction_type == "candle":
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(reaction_candle_count=Story.reaction_candle_count + 1)
        )
    else:
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(reaction_smile_count=Story.reaction_smile_count + 1)
        )


async def _decrement_reaction_count(
    db: AsyncSession, story_id: UUID, reaction_type: str
) -> None:
    """Atomic DB-side decrement, clamped at zero — mirrors favorite.py."""
    if reaction_type == "heart":
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(
                reaction_heart_count=case(
                    (Story.reaction_heart_count > 0, Story.reaction_heart_count - 1),
                    else_=0,
                )
            )
        )
    elif reaction_type == "candle":
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(
                reaction_candle_count=case(
                    (Story.reaction_candle_count > 0, Story.reaction_candle_count - 1),
                    else_=0,
                )
            )
        )
    else:
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(
                reaction_smile_count=case(
                    (Story.reaction_smile_count > 0, Story.reaction_smile_count - 1),
                    else_=0,
                )
            )
        )


def _toggle_result(reacted: bool, reaction_type: str, story: Story) -> dict[str, Any]:
    return {
        "reacted": reacted,
        "reaction_type": reaction_type,
        "reaction_heart_count": story.reaction_heart_count or 0,
        "reaction_candle_count": story.reaction_candle_count or 0,
        "reaction_smile_count": story.reaction_smile_count or 0,
    }


async def _notify_on_reaction(
    db: AsyncSession,
    story: Story,
    actor: User | None,
    actor_id: UUID,
    reaction_id: UUID | None,
    legacy_id: UUID | None,
) -> None:
    """Notify the story author when someone else reacts.

    Only called on toggle-*on* (a new reaction row was created), never on
    toggle-off, and never when the actor is the story's own author — matches
    `story_response.py`'s notification call-site pattern (plain
    `create_notification` call in the same request, no background job).
    """
    if story.author_id == actor_id:
        return

    actor_name = "Someone"
    if actor is not None:
        actor_name = actor.name or actor.username

    link = f"/legacy/{legacy_id}/story/{story.id}" if legacy_id else None

    await notification_service.create_notification(
        db=db,
        user_id=story.author_id,
        notification_type="story_reaction",
        title="New reaction",
        message=f'{actor_name} reacted to "{story.title}"',
        link=link,
        actor_id=actor_id,
        resource_type="story_reaction",
        resource_id=reaction_id,
    )


async def toggle_reaction(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    reaction_type: str,
) -> dict[str, Any]:
    """Toggle a reaction on/off for a story.

    Membership-gated via `require_legacy_member_or_story_author`. One row per
    (story, user, reaction_type) — the unique constraint gives "one of each
    type per user, toggleable" for free via insert-or-delete, mirroring
    `favorite.py`'s toggle pattern.
    """
    with tracer.start_as_current_span("story_reaction.toggle") as span:
        span.set_attribute("component", "story-responses")
        span.set_attribute("story_id", str(story_id))
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("reaction_type", reaction_type)

        story = await _load_story_with_legacies(db, story_id)
        await require_legacy_member_or_story_author(db, story, user_id)

        # Computed before commit/refresh: `story.legacy_associations` is only
        # populated via the eager `selectinload` from `_load_story_with_legacies`.
        # A later `db.refresh(story)` expires relationship attributes too (as
        # does the `db.commit()` that precedes it, since expire_on_commit is
        # the SQLAlchemy default), and re-accessing an unloaded relationship
        # outside of a sync-compatible context raises `MissingGreenlet`.
        legacy_id = _primary_legacy_id(story)

        result = await db.execute(
            select(StoryReactionModel).where(
                StoryReactionModel.story_id == story_id,
                StoryReactionModel.user_id == user_id,
                StoryReactionModel.reaction_type == reaction_type,
            )
        )
        existing = result.scalar_one_or_none()

        reacted: bool
        reaction_id: UUID | None = None

        if existing:
            await db.delete(existing)
            await _decrement_reaction_count(db, story_id, reaction_type)
            reacted = False
        else:
            reaction = StoryReactionModel(
                story_id=story_id,
                user_id=user_id,
                reaction_type=reaction_type,
            )
            db.add(reaction)
            try:
                await db.flush()
            except IntegrityError:
                # Concurrent insert already created the row — rollback and
                # report the current state, mirroring favorite.py's toggle.
                await db.rollback()
                await db.refresh(story)
                REACTIONS_TOGGLED.labels(
                    service="core-api",
                    component="story-responses",
                    reaction_type=reaction_type,
                ).inc()
                return _toggle_result(True, reaction_type, story)
            await _increment_reaction_count(db, story_id, reaction_type)
            reacted = True
            reaction_id = reaction.id

        await db.commit()
        await db.refresh(story)

        REACTIONS_TOGGLED.labels(
            service="core-api",
            component="story-responses",
            reaction_type=reaction_type,
        ).inc()
        logger.info(
            "story_reaction.toggled",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "legacy_id": str(legacy_id) if legacy_id else None,
                "reaction_type": reaction_type,
                "reacted": reacted,
            },
        )

        if reacted:
            actor = await db.get(User, user_id)
            await _notify_on_reaction(
                db=db,
                story=story,
                actor=actor,
                actor_id=user_id,
                reaction_id=reaction_id,
                legacy_id=legacy_id,
            )

        return _toggle_result(reacted, reaction_type, story)
