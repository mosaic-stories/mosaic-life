"""Story response service — create, list, update, delete, notification fan-out.

Access gating (§2 of the story-responses design) is intentionally a *new*,
narrower rule layered on top of `app.services.story_access`: even a public
story that anyone can read requires legacy membership (or authorship) to
respond to. This module does not modify `story_access.py`; it re-implements
the same "non-pending member of any legacy the story is associated with, or
the story's author" check that `story_access._can_read_story`'s private-story
branch already applies, reusing its `ACTIVE_ROLES` constant so "non-pending"
stays in sync with that module's definition.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from prometheus_client import Counter
from sqlalchemy import case, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.legacy import LegacyMember
from ..models.story import Story
from ..models.story_response import StoryResponse as StoryResponseModel
from ..models.user import User
from ..schemas.story_response import (
    StoryResponseCreate,
    StoryResponseItem,
    StoryResponseUpdate,
)
from ..services import notification as notification_service
from ..services.story_access import ACTIVE_ROLES

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.story_response")

RESPONSES_CREATED = Counter(
    "story_responses_created_total",
    "Story responses created",
    ["service", "component"],
)

# Legacy roles allowed to remove another member's response (per spec's
# removal-rights requirement: story author or legacy creator/admin; advocate
# and admirer are excluded).
DELETE_ADMIN_ROLES = {"creator", "admin"}


async def _load_story_with_legacies(db: AsyncSession, story_id: UUID) -> Story:
    """Load a story with its legacy associations, or raise 404."""
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()
    if story is None:
        raise HTTPException(status_code=404, detail="Story not found")
    return story


async def require_legacy_member_or_story_author(
    db: AsyncSession, story: Story, user_id: UUID
) -> None:
    """Additional response/reaction gate: non-pending legacy member or author.

    Narrower than `story_access.can_read_story`: a user who could read a
    *public* story cannot respond to it unless they are also a legacy member.
    Draft and personal stories remain author-only, mirroring
    `story_access`'s existing read restrictions for those cases (a response
    implies the actor could read the story in the first place, per the
    story-responses spec's "on a story they can read" requirement).
    """
    if story.author_id == user_id:
        return

    if story.status == "draft":
        # Non-authors never see drafts (matches require_story_read_access).
        raise HTTPException(status_code=404, detail="Story not found")

    if story.visibility == "personal":
        raise HTTPException(
            status_code=403, detail="Not authorized to respond to this story"
        )

    story_legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
    if story_legacy_ids:
        result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(story_legacy_ids),
                LegacyMember.role.in_(ACTIVE_ROLES),
            )
        )
        if result.scalars().first() is not None:
            return

    raise HTTPException(
        status_code=403, detail="Not authorized to respond to this story"
    )


def _primary_legacy_id(story: Story) -> UUID | None:
    """Return the story's primary legacy id, falling back to the first one."""
    if not story.legacy_associations:
        return None
    primary = next(
        (assoc for assoc in story.legacy_associations if assoc.role == "primary"),
        story.legacy_associations[0],
    )
    return primary.legacy_id


def _serialize_response(
    response: StoryResponseModel, user: User | None
) -> StoryResponseItem:
    display_name = ""
    username = ""
    avatar_url = None
    if user is not None:
        display_name = user.name or user.username
        username = user.username
        avatar_url = user.avatar_url
    return StoryResponseItem(
        id=response.id,
        story_id=response.story_id,
        user_id=response.user_id,
        user_name=display_name,
        user_username=username,
        user_avatar_url=avatar_url,
        body=response.body,
        created_at=response.created_at,
        edited_at=response.edited_at,
    )


async def _load_response(
    db: AsyncSession, story_id: UUID, response_id: UUID
) -> StoryResponseModel:
    result = await db.execute(
        select(StoryResponseModel).where(
            StoryResponseModel.id == response_id,
            StoryResponseModel.story_id == story_id,
            StoryResponseModel.deleted_at.is_(None),
        )
    )
    response = result.scalar_one_or_none()
    if response is None:
        raise HTTPException(status_code=404, detail="Response not found")
    return response


async def _notify_on_create(
    db: AsyncSession,
    story: Story,
    response: StoryResponseModel,
    actor: User | None,
    prior_responder_ids: set[UUID],
    legacy_id: UUID | None,
) -> None:
    """Notify the story author and every distinct prior responder.

    The actor is never notified of their own action. Calls
    `notification_service.create_notification` synchronously, matching the
    existing favorite/invitation/legacy_link notification call sites (no
    background job, no new transport).
    """
    actor_name = "Someone"
    if actor is not None:
        actor_name = actor.name or actor.username

    link = f"/legacy/{legacy_id}/story/{story.id}" if legacy_id else None

    if story.author_id != response.user_id:
        await notification_service.create_notification(
            db=db,
            user_id=story.author_id,
            notification_type="story_response",
            title="New response",
            message=f'{actor_name} responded to "{story.title}"',
            link=link,
            actor_id=response.user_id,
            resource_type="story_response",
            resource_id=response.id,
        )

    also_notify = prior_responder_ids - {response.user_id, story.author_id}
    for prior_user_id in also_notify:
        await notification_service.create_notification(
            db=db,
            user_id=prior_user_id,
            notification_type="story_response",
            title="Also responded",
            message=f'{actor_name} also responded to "{story.title}"',
            link=link,
            actor_id=response.user_id,
            resource_type="story_response",
            resource_id=response.id,
        )


async def create_response(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    data: StoryResponseCreate,
) -> StoryResponseItem:
    """Create a response on a story.

    Membership-gated: the actor must be the story's author or a non-pending
    member of a legacy associated with the story (see
    `require_legacy_member_or_story_author`).
    """
    with tracer.start_as_current_span("story_response.create") as span:
        span.set_attribute("component", "story-responses")
        span.set_attribute("story_id", str(story_id))
        span.set_attribute("user_id", str(user_id))

        story = await _load_story_with_legacies(db, story_id)
        await require_legacy_member_or_story_author(db, story, user_id)

        # Distinct prior responders, computed before inserting the new row.
        # Includes soft-deleted responders on purpose: soft delete exists
        # precisely to keep "also responded" history consistent (design §1).
        prior_result = await db.execute(
            select(StoryResponseModel.user_id)
            .where(StoryResponseModel.story_id == story_id)
            .distinct()
        )
        prior_responder_ids = {row[0] for row in prior_result.all()}

        response = StoryResponseModel(
            story_id=story_id,
            user_id=user_id,
            body=data.body,
        )
        db.add(response)

        # Atomic DB-side increment, same transaction as the insert — mirrors
        # favorite.py's Legacy.favorite_count pattern.
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(response_count=Story.response_count + 1)
        )

        await db.commit()
        await db.refresh(response)

        legacy_id = _primary_legacy_id(story)

        RESPONSES_CREATED.labels(service="core-api", component="story-responses").inc()
        logger.info(
            "story_response.created",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "legacy_id": str(legacy_id) if legacy_id else None,
            },
        )

        actor = await db.get(User, user_id)
        await _notify_on_create(
            db=db,
            story=story,
            response=response,
            actor=actor,
            prior_responder_ids=prior_responder_ids,
            legacy_id=legacy_id,
        )

        return _serialize_response(response, actor)


async def list_responses(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    cursor: datetime | None,
    limit: int,
) -> dict[str, Any]:
    """List a story's non-deleted responses, oldest first, cursor-paginated."""
    story = await _load_story_with_legacies(db, story_id)
    await require_legacy_member_or_story_author(db, story, user_id)

    filters = [
        StoryResponseModel.story_id == story_id,
        StoryResponseModel.deleted_at.is_(None),
    ]
    if cursor:
        filters.append(StoryResponseModel.created_at > cursor)

    query = (
        select(StoryResponseModel)
        .where(*filters)
        .order_by(StoryResponseModel.created_at.asc())
        .limit(limit + 1)  # fetch one extra to check has_more
    )
    result = await db.execute(query)
    responses = list(result.scalars().all())

    has_more = len(responses) > limit
    if has_more:
        responses = responses[:limit]

    next_cursor = (
        responses[-1].created_at.isoformat() if responses and has_more else None
    )

    user_ids = list({r.user_id for r in responses})
    users_by_id: dict[UUID, User] = {}
    if user_ids:
        user_rows = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_by_id = {u.id: u for u in user_rows.scalars().all()}

    items = [_serialize_response(r, users_by_id.get(r.user_id)) for r in responses]

    return {"items": items, "next_cursor": next_cursor, "has_more": has_more}


async def update_response(
    db: AsyncSession,
    story_id: UUID,
    response_id: UUID,
    user_id: UUID,
    data: StoryResponseUpdate,
) -> StoryResponseItem:
    """Edit a response's body. Author-only; sets `edited_at`."""
    with tracer.start_as_current_span("story_response.update") as span:
        span.set_attribute("component", "story-responses")
        span.set_attribute("story_id", str(story_id))
        span.set_attribute("response_id", str(response_id))
        span.set_attribute("user_id", str(user_id))

        response = await _load_response(db, story_id, response_id)

        if response.user_id != user_id:
            raise HTTPException(
                status_code=403, detail="Only the response author can edit it"
            )

        response.body = data.body
        response.edited_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(response)

        logger.info(
            "story_response.updated",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "response_id": str(response_id),
            },
        )

        actor = await db.get(User, user_id)
        return _serialize_response(response, actor)


async def delete_response(
    db: AsyncSession,
    story_id: UUID,
    response_id: UUID,
    user_id: UUID,
) -> None:
    """Soft-delete a response and decrement the story's response_count.

    Allowed for the response's own author, or a member with role
    creator/admin on a legacy associated with the story (advocate/admirer
    cannot remove another member's response).
    """
    with tracer.start_as_current_span("story_response.delete") as span:
        span.set_attribute("component", "story-responses")
        span.set_attribute("story_id", str(story_id))
        span.set_attribute("response_id", str(response_id))
        span.set_attribute("user_id", str(user_id))

        response = await _load_response(db, story_id, response_id)
        is_author = response.user_id == user_id

        is_legacy_admin = False
        if not is_author:
            story = await _load_story_with_legacies(db, story_id)
            legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
            if legacy_ids:
                admin_result = await db.execute(
                    select(LegacyMember).where(
                        LegacyMember.user_id == user_id,
                        LegacyMember.legacy_id.in_(legacy_ids),
                        LegacyMember.role.in_(DELETE_ADMIN_ROLES),
                    )
                )
                is_legacy_admin = admin_result.scalars().first() is not None

        if not is_author and not is_legacy_admin:
            raise HTTPException(
                status_code=403, detail="Not authorized to delete this response"
            )

        response.deleted_at = datetime.now(timezone.utc)

        # Atomic DB-side decrement, clamped at zero — mirrors favorite.py.
        await db.execute(
            update(Story)
            .where(Story.id == story_id)
            .values(
                response_count=case(
                    (Story.response_count > 0, Story.response_count - 1),
                    else_=0,
                )
            )
        )

        await db.commit()

        logger.info(
            "story_response.deleted",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "response_id": str(response_id),
                "deleted_by": "author" if is_author else "legacy_admin",
            },
        )
