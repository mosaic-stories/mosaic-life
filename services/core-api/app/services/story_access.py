"""Shared story authorization policy for story-scoped surfaces."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import and_, or_, select
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.associations import StoryLegacy
from app.models.legacy import LegacyMember
from app.models.legacy_link import LegacyLink, LegacyLinkShare
from app.models.story import Story
from app.observability.metrics import AUTHZ_DECISIONS
from app.schemas.retrieval import LinkedLegacyFilter

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.authz")

ACTIVE_ROLES = {"creator", "admin", "advocate", "admirer"}


async def require_story_read_access(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
) -> Story:
    """Load story and enforce visibility-based read access.

    WARNING: this is a READ-only gate. It must never be the sole gate on an
    endpoint that mutates story-owned state — use `require_story_write_access`
    for that case instead.
    """
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if story.status == "draft" and story.author_id != user_id:
        raise HTTPException(status_code=404, detail="Story not found")

    allowed, _reason = await can_read_story(db=db, story=story, user_id=user_id)
    if allowed:
        return story

    raise HTTPException(status_code=403, detail="Not authorized to view this story")


async def require_story_write_access(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    *,
    action: str = "modify",
) -> Story:
    """Load a story and enforce author-only write access.

    Composes `require_story_read_access` first, so draft-existence hiding
    and read denials are identical to every read surface, then enforces the
    story-access spec's author-only editing rule on top.
    """
    story = await require_story_read_access(db=db, story_id=story_id, user_id=user_id)
    allowed, _reason = await can_write_story(
        story=story, user_id=user_id, action=action
    )
    if not allowed:
        raise HTTPException(
            status_code=403, detail=f"Only the story author can {action} this story"
        )
    return story


def allowed_visibilities(role: str | None) -> list[str]:
    """Return story visibilities a role may see in a legacy-scoped surface."""
    if role in ACTIVE_ROLES:
        return ["public", "private", "personal"]
    return ["public"]


async def get_linked_legacy_filters(
    db: AsyncSession,
    legacy_id: UUID,
) -> list[LinkedLegacyFilter]:
    """Return active linked legacy filters for stories shared into a legacy."""
    result = await db.execute(
        select(LegacyLink).where(
            LegacyLink.status == "active",
            or_(
                LegacyLink.requester_legacy_id == legacy_id,
                LegacyLink.target_legacy_id == legacy_id,
            ),
        )
    )
    links = result.scalars().all()
    filters: list[LinkedLegacyFilter] = []

    for link in links:
        if link.requester_legacy_id == legacy_id:
            linked_legacy_id = link.target_legacy_id
            share_mode = link.target_share_mode
        else:
            linked_legacy_id = link.requester_legacy_id
            share_mode = link.requester_share_mode

        if share_mode == "all":
            filters.append(
                LinkedLegacyFilter(
                    legacy_id=linked_legacy_id,
                    share_mode="all",
                    story_ids=[],
                )
            )
            continue

        shares_result = await db.execute(
            select(LegacyLinkShare).where(
                LegacyLinkShare.legacy_link_id == link.id,
                LegacyLinkShare.source_legacy_id == linked_legacy_id,
                LegacyLinkShare.resource_type == "story",
            )
        )
        story_ids = [share.resource_id for share in shares_result.scalars().all()]
        if story_ids:
            filters.append(
                LinkedLegacyFilter(
                    legacy_id=linked_legacy_id,
                    share_mode="selective",
                    story_ids=story_ids,
                )
            )

    return filters


async def can_read_story(
    db: AsyncSession, story: Story, user_id: UUID
) -> tuple[bool, str]:
    """Return whether a user may read a story and the deciding reason."""
    with tracer.start_as_current_span("authz.can_read_story") as span:
        span.set_attribute("story_id", str(story.id))
        span.set_attribute("user_id", str(user_id))

        allowed, reason = await _can_read_story(db, story, user_id)
        decision = "allow" if allowed else "deny"
        span.set_attribute("decision", decision)
        span.set_attribute("reason", reason)
        AUTHZ_DECISIONS.labels(
            decision=decision, reason=reason, service="core-api"
        ).inc()

        if not allowed:
            logger.warning(
                "authz.access_denied",
                extra={
                    "user_id": str(user_id),
                    "story_id": str(story.id),
                    "visibility": story.visibility,
                    "reason": reason,
                },
            )

        return allowed, reason


async def can_write_story(
    story: Story, user_id: UUID, *, action: str = "modify"
) -> tuple[bool, str]:
    """Return whether a user may write (mutate) a story and the deciding reason."""
    with tracer.start_as_current_span("authz.can_write_story") as span:
        span.set_attribute("story_id", str(story.id))
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("action", action)

        allowed = story.author_id == user_id
        reason = "author" if allowed else "not_author"
        decision = "allow" if allowed else "deny"
        span.set_attribute("decision", decision)
        span.set_attribute("reason", reason)
        AUTHZ_DECISIONS.labels(
            decision=decision, reason=reason, service="core-api"
        ).inc()

        if not allowed:
            logger.warning(
                "authz.write_denied",
                extra={
                    "user_id": str(user_id),
                    "story_id": str(story.id),
                    "author_id": str(story.author_id),
                    "action": action,
                    "visibility": story.visibility,
                    "status": story.status,
                },
            )

        return allowed, reason


async def _can_read_story(
    db: AsyncSession, story: Story, user_id: UUID
) -> tuple[bool, str]:
    if story.visibility == "public":
        return True, "public"

    if story.visibility == "personal":
        return (
            story.author_id == user_id,
            "author" if story.author_id == user_id else "denied",
        )

    if story.visibility == "private":
        if story.author_id == user_id:
            return True, "author"

        story_legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
        if not story_legacy_ids:
            return False, "denied"

        result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(story_legacy_ids),
                LegacyMember.role.in_(ACTIVE_ROLES),
            )
        )
        if result.scalars().first() is not None:
            return True, "member"

        user_legacy_result = await db.execute(
            select(LegacyMember.legacy_id).where(
                LegacyMember.user_id == user_id,
                LegacyMember.role.in_(ACTIVE_ROLES),
            )
        )
        user_legacy_ids = user_legacy_result.scalars().all()
        for user_legacy_id in user_legacy_ids:
            filters = await get_linked_legacy_filters(db, user_legacy_id)
            for link_filter in filters:
                if link_filter.legacy_id not in story_legacy_ids:
                    continue
                if link_filter.share_mode == "all" or story.id in link_filter.story_ids:
                    return True, "link_share"

    return False, "denied"


def visible_stories_criteria(
    user_id: UUID,
    *,
    legacy_id: UUID | None,
    membership_role: str | None,
    link_filters: list[LinkedLegacyFilter],
) -> ColumnElement[bool]:
    """Build SQLAlchemy criteria for stories visible in list-style surfaces."""
    with tracer.start_as_current_span("authz.visibility_criteria") as span:
        span.set_attribute("legacy_id", str(legacy_id) if legacy_id else "")
        span.set_attribute("role", membership_role or "")
        span.set_attribute("link_filter_count", len(link_filters))

        direct_visibilities = [
            v for v in allowed_visibilities(membership_role) if v != "personal"
        ]
        clauses: list[ColumnElement[bool]] = [
            Story.visibility.in_(direct_visibilities),
            and_(Story.visibility == "personal", Story.author_id == user_id),
        ]

        for link_filter in link_filters:
            if link_filter.share_mode == "all":
                clauses.append(
                    and_(
                        StoryLegacy.legacy_id == link_filter.legacy_id,
                        Story.visibility.in_(["public", "private"]),
                    )
                )
            elif link_filter.story_ids:
                clauses.append(
                    and_(
                        Story.id.in_(link_filter.story_ids),
                        Story.visibility.in_(["public", "private"]),
                    )
                )

        return or_(*clauses)
