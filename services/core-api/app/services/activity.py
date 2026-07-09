"""Activity tracking service — record, query, and cleanup user activity."""

import logging
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any, cast
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.storage import get_storage_adapter
from ..models.activity import UserActivity
from ..models.ai import AIConversation
from ..models.associations import ConversationLegacy, MediaLegacy, StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.media import Media
from ..models.story import Story
from ..models.user import User

logger = logging.getLogger(__name__)

# Retention tiers: action -> max age in days
RETENTION_TIERS: dict[str, int] = {
    # Ephemeral
    "viewed": 30,
    # Standard
    "favorited": 90,
    "unfavorited": 90,
    "shared": 90,
    "joined": 90,
    "invited": 90,
    "ai_conversation_started": 90,
    "ai_story_evolved": 90,
    "responded": 90,
    "reacted": 90,
    # Durable
    "created": 365,
    "updated": 365,
    "deleted": 365,
}

# Group actions by tier for batch cleanup
EPHEMERAL_ACTIONS = ["viewed"]
STANDARD_ACTIONS = [
    "favorited",
    "unfavorited",
    "shared",
    "joined",
    "invited",
    "ai_conversation_started",
    "ai_story_evolved",
    "responded",
    "reacted",
]
DURABLE_ACTIONS = ["created", "updated", "deleted"]


# --- Activity feed sentence templates (activity-feed-language) ---------------
#
# Each activity event is keyed by (action, entity_type). Only pairs with an
# entry below are rendered into the feed; everything else (e.g. all `media`
# CRUD actions, which would otherwise leak a raw filename via `metadata`) is
# dropped from `get_activity_feed`/`get_social_feed` before pagination — see
# `TEMPLATED_ACTIVITY_PAIRS` and `_templated_pairs_clause`.
#
# Renderers receive (actor_name, metadata, entity) where `entity` is the
# enriched entity summary (see `enrich_entities`) when available — populated
# for `get_social_feed`, `None` for the personal `get_activity_feed` — and
# `metadata` is the raw `UserActivity.metadata_` recorded at write time.
SentenceRenderer = Callable[[str, dict[str, Any] | None, dict[str, Any] | None], str]


def _story_title(
    metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str | None:
    if entity and entity.get("title"):
        return cast(str, entity["title"])
    if metadata and metadata.get("title"):
        return cast(str, metadata["title"])
    return None


def _story_legacy_name(entity: dict[str, Any] | None) -> str | None:
    """Only available via entity enrichment (join to the story's legacy)."""
    if entity and entity.get("legacy_name"):
        return cast(str, entity["legacy_name"])
    return None


def _legacy_display_name(
    metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str | None:
    if entity and entity.get("name"):
        return cast(str, entity["name"])
    if metadata and metadata.get("name"):
        return cast(str, metadata["name"])
    return None


def _conversation_title(
    metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str | None:
    if entity and entity.get("title"):
        return cast(str, entity["title"])
    if metadata and metadata.get("title"):
        return cast(str, metadata["title"])
    return None


def _tmpl_story_created(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    legacy_name = _story_legacy_name(entity)
    if legacy_name:
        return f"{actor} added a memory to {legacy_name}'s legacy"
    title = _story_title(metadata, entity)
    if title:
        return f'{actor} added a new memory: "{title}"'
    return f"{actor} added a new memory"


def _tmpl_story_updated(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    title = _story_title(metadata, entity)
    if title:
        return f'{actor} updated the memory "{title}"'
    return f"{actor} updated a memory"


def _tmpl_story_deleted(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    title = _story_title(metadata, entity)
    if title:
        return f'{actor} removed the memory "{title}"'
    return f"{actor} removed a memory"


def _tmpl_story_viewed(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    title = _story_title(metadata, entity)
    if title:
        return f'{actor} viewed "{title}"'
    return f"{actor} viewed a memory"


def _tmpl_story_favorited(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    title = _story_title(metadata, entity)
    if title:
        return f'{actor} favorited "{title}"'
    return f"{actor} favorited a memory"


def _tmpl_story_responded(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    legacy_name = _story_legacy_name(entity)
    if legacy_name:
        return f"{actor} responded to a memory about {legacy_name}'s legacy"
    title = _story_title(metadata, entity)
    if title:
        return f'{actor} responded to "{title}"'
    return f"{actor} responded to a memory"


def _tmpl_story_reacted(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    reaction_type = metadata.get("reaction_type") if metadata else None
    if reaction_type:
        return f"{actor} reacted with a {reaction_type} to a memory"
    return f"{actor} reacted to a memory"


def _tmpl_legacy_created(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    name = _legacy_display_name(metadata, entity)
    if name:
        return f"{actor} created {name}'s legacy"
    return f"{actor} created a new legacy"


def _tmpl_legacy_updated(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    name = _legacy_display_name(metadata, entity)
    if name:
        return f"{actor} updated {name}'s legacy"
    return f"{actor} updated a legacy"


def _tmpl_legacy_deleted(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    name = _legacy_display_name(metadata, entity)
    if name:
        return f"{actor} deleted {name}'s legacy"
    return f"{actor} deleted a legacy"


def _tmpl_legacy_viewed(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    name = _legacy_display_name(metadata, entity)
    if name:
        return f"{actor} viewed {name}'s legacy"
    return f"{actor} viewed a legacy"


def _tmpl_legacy_favorited(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    name = _legacy_display_name(metadata, entity)
    if name:
        return f"{actor} favorited {name}'s legacy"
    return f"{actor} favorited a legacy"


def _tmpl_legacy_joined(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    name = _legacy_display_name(metadata, entity)
    if name:
        return f"{actor} joined {name}'s legacy"
    return f"{actor} joined a legacy"


def _tmpl_legacy_invited(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    name = _legacy_display_name(metadata, entity)
    if name:
        return f"{actor} invited a new member to {name}'s legacy"
    return f"{actor} invited a new member"


def _tmpl_conversation_started(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    title = _conversation_title(metadata, entity)
    if title:
        return f'{actor} started a conversation: "{title}"'
    return f"{actor} started a conversation"


def _tmpl_story_evolved(
    actor: str, metadata: dict[str, Any] | None, entity: dict[str, Any] | None
) -> str:
    return f"{actor} evolved a memory with AI assistance"


# The (action, entity_type) -> sentence-template map (design §5). Deliberately
# excludes every `media` action: media CRUD metadata carries the raw uploaded
# filename (see `app/routes/media.py`), and the spec requires that a filename
# never be shown verbatim in the feed — the simplest way to guarantee that is
# to never template media events at all, so they're dropped entirely rather
# than risk a future metadata field leaking through.
_SENTENCE_TEMPLATES: dict[tuple[str, str], SentenceRenderer] = {
    ("created", "story"): _tmpl_story_created,
    ("updated", "story"): _tmpl_story_updated,
    ("deleted", "story"): _tmpl_story_deleted,
    ("viewed", "story"): _tmpl_story_viewed,
    ("favorited", "story"): _tmpl_story_favorited,
    ("responded", "story"): _tmpl_story_responded,
    ("reacted", "story"): _tmpl_story_reacted,
    ("created", "legacy"): _tmpl_legacy_created,
    ("updated", "legacy"): _tmpl_legacy_updated,
    ("deleted", "legacy"): _tmpl_legacy_deleted,
    ("viewed", "legacy"): _tmpl_legacy_viewed,
    ("favorited", "legacy"): _tmpl_legacy_favorited,
    ("joined", "legacy"): _tmpl_legacy_joined,
    ("invited", "legacy"): _tmpl_legacy_invited,
    ("ai_conversation_started", "conversation"): _tmpl_conversation_started,
    ("ai_story_evolved", "conversation"): _tmpl_story_evolved,
}

# The set of (action, entity_type) pairs that have a sentence template —
# exposed for the SQL-level pre-pagination filter in `get_activity_feed`/
# `get_social_feed`.
TEMPLATED_ACTIVITY_PAIRS: frozenset[tuple[str, str]] = frozenset(_SENTENCE_TEMPLATES)


def render_activity_sentence(
    action: str,
    entity_type: str,
    actor_name: str,
    metadata: dict[str, Any] | None = None,
    entity: dict[str, Any] | None = None,
) -> str | None:
    """Render a human sentence for a templated (action, entity_type) pair.

    Returns `None` when no template is defined for the pair — callers use
    this both to render the feed-facing `summary` field and (via
    `TEMPLATED_ACTIVITY_PAIRS`) to decide which events are feed-worthy at
    all. Never falls back to a generic/raw string: an untemplated event is
    simply absent from the feed rather than rendered some other way.
    """
    renderer = _SENTENCE_TEMPLATES.get((action, entity_type))
    if renderer is None:
        return None
    return renderer(actor_name, metadata, entity)


def _templated_pairs_clause() -> Any:
    """SQL clause matching only (action, entity_type) pairs with a template.

    Applied as part of the query's WHERE clause — i.e. before the
    `limit`/`limit + 1` pagination logic — so that `limit` reflects only
    feed-worthy (templated) items, per the activity-feed-language design.
    """
    return or_(
        *[
            and_(UserActivity.action == action, UserActivity.entity_type == entity_type)
            for action, entity_type in TEMPLATED_ACTIVITY_PAIRS
        ]
    )


async def record_activity(
    db: AsyncSession,
    user_id: UUID,
    action: str,
    entity_type: str,
    entity_id: UUID,
    metadata: dict[str, Any] | None = None,
    deduplicate_minutes: int = 0,
) -> None:
    """Record a user activity event.

    Respects privacy preference — skips recording if tracking is disabled.
    Optionally deduplicates by checking for a recent identical event.
    Failures are logged but never raised.
    """
    try:
        # Check privacy preference
        result = await db.execute(select(User.preferences).where(User.id == user_id))
        prefs = result.scalar_one_or_none()
        if prefs and not prefs.get("activity_tracking_enabled", True):
            return

        # Deduplication check for views
        if deduplicate_minutes > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=deduplicate_minutes)
            dup_result = await db.execute(
                select(UserActivity.id)
                .where(
                    UserActivity.user_id == user_id,
                    UserActivity.action == action,
                    UserActivity.entity_type == entity_type,
                    UserActivity.entity_id == entity_id,
                    UserActivity.created_at > cutoff,
                )
                .limit(1)
            )
            if dup_result.scalar_one_or_none() is not None:
                return

        activity = UserActivity(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_=metadata,
            created_at=datetime.now(timezone.utc),
        )
        db.add(activity)
        await db.commit()

        logger.info(
            "activity.recorded",
            extra={
                "user_id": str(user_id),
                "action": action,
                "entity_type": entity_type,
                "entity_id": str(entity_id),
            },
        )
    except Exception:
        logger.warning(
            "activity.record_failed",
            extra={
                "user_id": str(user_id),
                "action": action,
                "entity_type": entity_type,
                "entity_id": str(entity_id),
            },
            exc_info=True,
        )


async def get_activity_feed(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str | None = None,
    action: str | None = None,
    cursor: datetime | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Get paginated activity feed for a user."""
    # Check if tracking is enabled
    user_result = await db.execute(select(User.preferences).where(User.id == user_id))
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {
            "items": [],
            "next_cursor": None,
            "has_more": False,
            "tracking_enabled": False,
        }

    filters = [UserActivity.user_id == user_id, _templated_pairs_clause()]
    if entity_type:
        filters.append(UserActivity.entity_type == entity_type)
    if action:
        filters.append(UserActivity.action == action)
    if cursor:
        filters.append(UserActivity.created_at < cursor)

    query = (
        select(UserActivity)
        .where(*filters)
        .order_by(UserActivity.created_at.desc())
        .limit(limit + 1)  # fetch one extra to check has_more
    )

    result = await db.execute(query)
    activities = list(result.scalars().all())

    has_more = len(activities) > limit
    if has_more:
        activities = activities[:limit]

    next_cursor = (
        activities[-1].created_at.isoformat() if activities and has_more else None
    )

    return {
        "items": activities,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "tracking_enabled": True,
    }


async def get_recent_items(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Get deduplicated recent items grouped by entity."""
    # Check if tracking is enabled
    user_result = await db.execute(select(User.preferences).where(User.id == user_id))
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {"items": [], "tracking_enabled": False}

    # Subquery: latest activity per (entity_type, entity_id)
    filters = [UserActivity.user_id == user_id]
    if entity_type:
        filters.append(UserActivity.entity_type == entity_type)

    # Use group_by approach for SQLite compat in tests
    subq = (
        select(
            UserActivity.entity_type,
            UserActivity.entity_id,
            func.max(UserActivity.created_at).label("last_activity_at"),
        )
        .where(*filters)
        .group_by(UserActivity.entity_type, UserActivity.entity_id)
        .order_by(func.max(UserActivity.created_at).desc())
        .limit(limit)
        .subquery()
    )

    # Join back to get the actual activity record for metadata.
    # Use distinct on (entity_type, entity_id) to avoid duplicates when
    # multiple rows share the exact same created_at timestamp.
    query = (
        select(UserActivity)
        .join(
            subq,
            (UserActivity.entity_type == subq.c.entity_type)
            & (UserActivity.entity_id == subq.c.entity_id)
            & (UserActivity.created_at == subq.c.last_activity_at),
        )
        .where(UserActivity.user_id == user_id)
        .order_by(UserActivity.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(query)
    raw_activities = list(result.scalars().unique().all())

    # Python-side dedup: the join can return multiple rows for the same entity
    # when two activity rows share the exact same max(created_at) timestamp.
    seen: set[tuple[str, UUID]] = set()
    activities = []
    for a in raw_activities:
        key = (a.entity_type, a.entity_id)
        if key not in seen:
            seen.add(key)
            activities.append(a)

    items = [
        {
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "last_action": a.action,
            "last_activity_at": a.created_at,
            "metadata": a.metadata_,
        }
        for a in activities
    ]

    return {"items": items, "tracking_enabled": True}


async def clear_user_activity(db: AsyncSession, user_id: UUID) -> int:
    """Delete all activity data for a user. Returns count of deleted rows."""
    result = await db.execute(
        delete(UserActivity).where(UserActivity.user_id == user_id)
    )
    await db.flush()
    return cast(int, getattr(result, "rowcount", 0))


async def run_retention_cleanup(db: AsyncSession, batch_size: int = 1000) -> int:
    """Run tiered retention cleanup. Returns total rows deleted."""
    now = datetime.now(timezone.utc)
    total_deleted = 0

    tiers = [
        ("ephemeral", EPHEMERAL_ACTIONS, 30),
        ("standard", STANDARD_ACTIONS, 90),
        ("durable", DURABLE_ACTIONS, 365),
    ]

    for tier_name, actions, days in tiers:
        cutoff = now - timedelta(days=days)
        deleted_in_tier = 0

        # Batch delete loop
        while True:
            # Use a subquery to limit the delete batch
            subq = (
                select(UserActivity.id)
                .where(
                    UserActivity.action.in_(actions),
                    UserActivity.created_at < cutoff,
                )
                .limit(batch_size)
                .subquery()
            )
            result = await db.execute(
                delete(UserActivity).where(UserActivity.id.in_(select(subq.c.id)))
            )
            batch_count: int = cast(int, getattr(result, "rowcount", 0))
            deleted_in_tier += batch_count
            await db.flush()

            if batch_count < batch_size:
                break

        total_deleted += deleted_in_tier
        if deleted_in_tier > 0:
            logger.info(
                "activity.cleanup.tier_complete",
                extra={
                    "tier": tier_name,
                    "deleted_count": deleted_in_tier,
                    "cutoff": cutoff.isoformat(),
                },
            )

    return total_deleted


async def enrich_entities(
    db: AsyncSession,
    items: list[tuple[str, UUID]],
) -> dict[tuple[str, UUID], dict[str, Any]]:
    """Batch-load entity details for activity items.

    Returns a dict keyed by (entity_type, entity_id) with entity summary dicts.
    Missing entities (deleted) are omitted from the result.
    """
    if not items:
        return {}

    result: dict[tuple[str, UUID], dict[str, Any]] = {}

    # Group by entity type for batch queries
    legacy_ids = [eid for etype, eid in items if etype == "legacy"]
    story_ids = [eid for etype, eid in items if etype == "story"]

    # Enrich legacies (eagerly load profile_image for URL generation)
    if legacy_ids:
        from sqlalchemy.orm import selectinload

        rows = await db.execute(
            select(Legacy)
            .options(selectinload(Legacy.profile_image))
            .where(Legacy.id.in_(legacy_ids))
        )
        storage = get_storage_adapter()
        for legacy in rows.scalars().all():
            profile_image_url = None
            if legacy.profile_image and legacy.profile_image.storage_path:
                profile_image_url = storage.generate_download_url(
                    legacy.profile_image.storage_path
                )
            result[("legacy", legacy.id)] = {
                "name": legacy.name,
                "profile_image_url": profile_image_url,
                "biography": legacy.biography,
                "visibility": legacy.visibility,
                "birth_date": str(legacy.birth_date) if legacy.birth_date else None,
                "death_date": str(legacy.death_date) if legacy.death_date else None,
            }

    # Enrich stories (with primary legacy info and author name)
    if story_ids:
        story_rows = await db.execute(select(Story).where(Story.id.in_(story_ids)))
        stories = list(story_rows.scalars().all())

        # Get primary legacy associations for these stories
        if stories:
            sl_rows = await db.execute(
                select(StoryLegacy, Legacy.id, Legacy.name)
                .join(Legacy, StoryLegacy.legacy_id == Legacy.id)
                .where(
                    StoryLegacy.story_id.in_([s.id for s in stories]),
                    StoryLegacy.role == "primary",
                )
            )
            # Build story_id -> (legacy_id, legacy_name) map
            story_legacy_map: dict[UUID, tuple[str, str]] = {}
            for sl, leg_id, leg_name in sl_rows.all():
                story_legacy_map[sl.story_id] = (str(leg_id), leg_name)

            # Get author names
            author_ids = list({s.author_id for s in stories})
            author_rows = await db.execute(
                select(User.id, User.name, User.username).where(User.id.in_(author_ids))
            )
            author_map: dict[UUID, tuple[str, str]] = {
                uid: (name or "", username) for uid, name, username in author_rows.all()
            }

            for story in stories:
                legacy_info = story_legacy_map.get(story.id)
                content_preview = (story.content or "")[:200]
                author_name, author_username = author_map.get(story.author_id, ("", ""))
                result[("story", story.id)] = {
                    "title": story.title,
                    "content_preview": content_preview,
                    "visibility": story.visibility,
                    "author_name": author_name,
                    "author_username": author_username,
                    "legacy_id": legacy_info[0] if legacy_info else None,
                    "legacy_name": legacy_info[1] if legacy_info else None,
                }

    # Enrich media items (filename, content_type, legacy_id)
    media_ids = [eid for etype, eid in items if etype == "media"]
    if media_ids:
        media_rows = await db.execute(select(Media).where(Media.id.in_(media_ids)))
        medias = list(media_rows.scalars().all())

        ml_rows = await db.execute(
            select(MediaLegacy).where(
                MediaLegacy.media_id.in_(media_ids),
                MediaLegacy.role == "primary",
            )
        )
        media_legacy_map: dict[UUID, str] = {
            ml.media_id: str(ml.legacy_id) for ml in ml_rows.scalars().all()
        }

        for media in medias:
            result[("media", media.id)] = {
                "filename": media.filename,
                "content_type": media.content_type,
                "legacy_id": media_legacy_map.get(media.id),
            }

    # Enrich conversation items (title, persona_id, legacy_id)
    conversation_ids = [eid for etype, eid in items if etype == "conversation"]
    if conversation_ids:
        conv_rows = await db.execute(
            select(AIConversation).where(AIConversation.id.in_(conversation_ids))
        )
        convs = list(conv_rows.scalars().all())

        cl_rows = await db.execute(
            select(ConversationLegacy).where(
                ConversationLegacy.conversation_id.in_(conversation_ids),
                ConversationLegacy.role == "primary",
            )
        )
        conv_legacy_map: dict[UUID, str] = {
            cl.conversation_id: str(cl.legacy_id) for cl in cl_rows.scalars().all()
        }

        for conv in convs:
            result[("conversation", conv.id)] = {
                "title": conv.title,
                "persona_id": conv.persona_id,
                "legacy_id": conv_legacy_map.get(conv.id),
            }

    return result


async def get_social_feed(
    db: AsyncSession,
    user_id: UUID,
    cursor: datetime | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Get social activity feed — own actions + co-member actions on shared legacies.

    Excludes 'viewed' (ephemeral) actions. Enriches items with actor and entity data.
    """
    # Check if tracking is enabled
    user_result = await db.execute(select(User.preferences).where(User.id == user_id))
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {"items": [], "has_more": False, "next_cursor": None}

    # 1. Find all legacy IDs the user is a member of
    membership_result = await db.execute(
        select(LegacyMember.legacy_id).where(LegacyMember.user_id == user_id)
    )
    my_legacy_ids = [row[0] for row in membership_result.all()]

    # 2. Find co-member user IDs for those legacies (actors we trust in the feed).
    # This prevents non-members who interact with public entities from leaking into
    # the social feed just because the entity happens to be in scope.
    co_member_ids: set[UUID] = {user_id}  # always include self
    if my_legacy_ids:
        co_member_result = await db.execute(
            select(LegacyMember.user_id).where(
                LegacyMember.legacy_id.in_(my_legacy_ids)
            )
        )
        co_member_ids.update(row[0] for row in co_member_result.all())

    # 3. Find story IDs linked to those legacies (only when user has memberships)
    related_story_ids: list[UUID] = []
    if my_legacy_ids:
        story_result = await db.execute(
            select(StoryLegacy.story_id).where(StoryLegacy.legacy_id.in_(my_legacy_ids))
        )
        related_story_ids = [row[0] for row in story_result.all()]

    # 4. Build activity query:
    #    - Legacy/story scope: entity is in scope AND actor is a co-member of those legacies
    #    - Own media/conversation: always included (already actor-scoped to user_id)
    scope_filters = [
        # Always include the user's own media/conversation activity
        (UserActivity.user_id == user_id)
        & (UserActivity.entity_type.in_(["media", "conversation"])),
    ]
    if my_legacy_ids:
        scope_filters.append(
            (UserActivity.entity_type == "legacy")
            & (UserActivity.entity_id.in_(my_legacy_ids))
            & (UserActivity.user_id.in_(co_member_ids))
        )
    if related_story_ids:
        scope_filters.append(
            (UserActivity.entity_type == "story")
            & (UserActivity.entity_id.in_(related_story_ids))
            & (UserActivity.user_id.in_(co_member_ids))
        )

    filters = [
        or_(*scope_filters),
        UserActivity.action != "viewed",  # Exclude ephemeral
        _templated_pairs_clause(),
    ]
    if cursor:
        filters.append(UserActivity.created_at < cursor)

    query = (
        select(UserActivity)
        .where(*filters)
        .order_by(UserActivity.created_at.desc())
        .limit(limit + 1)
    )

    result = await db.execute(query)
    activities = list(result.scalars().all())

    has_more = len(activities) > limit
    if has_more:
        activities = activities[:limit]

    next_cursor = (
        activities[-1].created_at.isoformat() if activities and has_more else None
    )

    # 4. Batch-load actor info
    actor_ids = list({a.user_id for a in activities})
    actor_map: dict[UUID, dict[str, Any]] = {}
    if actor_ids:
        actor_rows = await db.execute(
            select(User.id, User.name, User.username, User.avatar_url).where(
                User.id.in_(actor_ids)
            )
        )
        for uid, name, username, avatar_url in actor_rows.all():
            actor_map[uid] = {
                "id": uid,
                "name": name or "",
                "username": username,
                "avatar_url": avatar_url,
            }

    # 5. Batch-load entity details
    entity_keys = [(a.entity_type, a.entity_id) for a in activities]
    entity_map = await enrich_entities(db=db, items=entity_keys)

    # 6. Build response items
    items = []
    for a in activities:
        entity_data = entity_map.get((a.entity_type, a.entity_id))
        actor_info = actor_map.get(
            a.user_id,
            {"id": a.user_id, "name": "", "username": "", "avatar_url": None},
        )
        # The actor's own actions are phrased as "You ..." rather than their
        # own name, matching how the feed is presented to that same user.
        if a.user_id == user_id:
            actor_display_name = "You"
        else:
            actor_display_name = actor_info.get("name") or actor_info.get(
                "username", ""
            )
            actor_display_name = actor_display_name or "Someone"

        summary = render_activity_sentence(
            action=a.action,
            entity_type=a.entity_type,
            actor_name=actor_display_name,
            metadata=a.metadata_,
            entity=entity_data,
        )
        if summary is None:
            # Unreachable in practice: `_templated_pairs_clause()` above
            # already restricts the query to templated (action, entity_type)
            # pairs. Skip defensively rather than ever emit a raw fallback.
            logger.warning(
                "activity.social_feed.missing_template",
                extra={"action": a.action, "entity_type": a.entity_type},
            )
            continue

        items.append(
            {
                "id": a.id,
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "created_at": a.created_at,
                "metadata": a.metadata_,
                "actor": actor_info,
                "entity": entity_data,
                "summary": summary,
            }
        )

    return {"items": items, "has_more": has_more, "next_cursor": next_cursor}


async def get_enriched_recent_items(
    db: AsyncSession,
    user_id: UUID,
    action: str | None = None,
    entity_type: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Get deduplicated recent items with entity enrichment.

    Like get_recent_items but with optional action filter and entity data.
    """
    # Check if tracking is enabled
    user_result = await db.execute(select(User.preferences).where(User.id == user_id))
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {"items": [], "tracking_enabled": False}

    filters = [UserActivity.user_id == user_id]
    if entity_type:
        filters.append(UserActivity.entity_type == entity_type)
    if action:
        filters.append(UserActivity.action == action)

    subq = (
        select(
            UserActivity.entity_type,
            UserActivity.entity_id,
            func.max(UserActivity.created_at).label("last_activity_at"),
        )
        .where(*filters)
        .group_by(UserActivity.entity_type, UserActivity.entity_id)
        .order_by(func.max(UserActivity.created_at).desc())
        .limit(limit)
        .subquery()
    )

    query = (
        select(UserActivity)
        .join(
            subq,
            (UserActivity.entity_type == subq.c.entity_type)
            & (UserActivity.entity_id == subq.c.entity_id)
            & (UserActivity.created_at == subq.c.last_activity_at),
        )
        .where(UserActivity.user_id == user_id)
        .order_by(UserActivity.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(query)
    raw_activities = list(result.scalars().unique().all())

    # Python-side dedup: guard against duplicate rows sharing the same max(created_at)
    seen_enriched: set[tuple[str, UUID]] = set()
    activities = []
    for a in raw_activities:
        key = (a.entity_type, a.entity_id)
        if key not in seen_enriched:
            seen_enriched.add(key)
            activities.append(a)

    # Enrich entities
    entity_keys = [(a.entity_type, a.entity_id) for a in activities]
    entity_map = await enrich_entities(db=db, items=entity_keys)

    items = [
        {
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "last_action": a.action,
            "last_activity_at": a.created_at,
            "metadata": a.metadata_,
            "entity": entity_map.get((a.entity_type, a.entity_id)),
        }
        for a in activities
    ]

    return {"items": items, "tracking_enabled": True}
