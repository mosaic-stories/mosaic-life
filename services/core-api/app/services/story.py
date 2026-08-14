"""Service layer for story operations."""

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import TypedDict, cast
from urllib.parse import urlparse
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException
from opentelemetry import trace
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..models.associations import StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.story import Story
from ..models.story_reaction import StoryReaction as StoryReactionModel
from ..models.story_response import StoryResponse as StoryResponseModel
from ..models.story_version import StoryVersion
from ..observability.metrics import STORY_SAVE_DURATION
from ..schemas.associations import LegacyAssociationResponse
from ..schemas.story import (
    StoryBacklinkSummary,
    StoryCreate,
    StoryDetail,
    StoryResponse,
    StorySummary,
    StoryUpdate,
)
from ..schemas.story_reaction import ReactionType
from . import story_response as story_response_service
from .story_access import (
    ACTIVE_ROLES,
    can_read_story,
    get_linked_legacy_filters,
    require_story_write_access,
    visible_stories_criteria,
)
from .story_version import create_version as create_story_version
from .story_version import get_draft_version, mint_version_at_boundary

logger = logging.getLogger(__name__)

# Maximum length for content preview
PREVIEW_MAX_LENGTH = 200

# Maximum length for a derived working title
TITLE_MAX_LENGTH = 60

MEDIA_OBJECT_PATH_RE = re.compile(r"^/users/[0-9a-fA-F-]+/([0-9a-fA-F-]{36})\.[^/]+$")


def normalize_media_urls_for_story_content(content: str) -> str:
    """Replace legacy direct S3 media URLs with stable API content URLs."""

    def _replace(match: re.Match[str]) -> str:
        alt_text = match.group(1)
        url = match.group(2)
        title_part = match.group(3) or ""

        try:
            parsed = urlparse(url)
        except ValueError:
            return match.group(0)

        if parsed.scheme not in {"http", "https"}:
            return match.group(0)

        path_match = MEDIA_OBJECT_PATH_RE.match(parsed.path)
        if not path_match:
            return match.group(0)

        media_id = path_match.group(1)
        stable_url = f"/api/media/{media_id}/content"
        return f"![{alt_text}]({stable_url}{title_part})"

    image_link_re = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(\s+\"[^\"]*\")?\)")
    return image_link_re.sub(_replace, content)


# Role levels used for update authorization.
ROLE_LEVELS: dict[str, int] = {
    "creator": 4,
    "admin": 3,
    "advocate": 2,
    "admirer": 1,
}


def create_content_preview(content: str, max_length: int = PREVIEW_MAX_LENGTH) -> str:
    """Create a truncated preview of story content.

    Strips markdown formatting and truncates to max_length characters,
    ending at a word boundary with an ellipsis if truncated.

    Args:
        content: Full story content (may contain markdown)
        max_length: Maximum preview length

    Returns:
        Truncated plain text preview
    """
    # Remove markdown formatting
    # Remove headers
    text = re.sub(r"^#{1,6}\s+", "", content, flags=re.MULTILINE)
    # Remove bold/italic
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}([^_]+)_{1,3}", r"\1", text)
    # Remove links but keep text
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove images
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    # Remove code blocks
    text = re.sub(r"```[^`]*```", "", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Remove blockquotes
    text = re.sub(r"^>\s+", "", text, flags=re.MULTILINE)
    # Remove horizontal rules
    text = re.sub(r"^[-*_]{3,}$", "", text, flags=re.MULTILINE)
    # Collapse multiple newlines/whitespace
    text = re.sub(r"\s+", " ", text).strip()

    if len(text) <= max_length:
        return text

    # Truncate at word boundary
    truncated = text[:max_length]
    last_space = truncated.rfind(" ")
    if last_space > max_length * 0.7:  # Only use word boundary if reasonably close
        truncated = truncated[:last_space]

    return truncated.rstrip(".,;:!?") + "..."


def _as_aware_utc(value: datetime | None) -> datetime | None:
    """Normalize a DB-loaded timestamp to a UTC-aware datetime, or None.

    SQLite (used in tests) hands back naive datetimes even for
    `DateTime(timezone=True)` columns; every write path stores UTC, so a
    naive read is treated as UTC. Without this, comparing a naive read
    against `datetime.now(timezone.utc)` raises `TypeError`. See the same
    pattern in `app.auth.middleware` and `app.services.story_prompts`.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _strip_markdown_line(text: str) -> str:
    """Strip common Markdown syntax from a single line of text."""
    # Strip HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Check if this line is just a fenced code block or tilde block marker
    if re.match(r"^`{3,}[a-zA-Z0-9+-]*\s*$", text) or re.match(
        r"^~{3,}[a-zA-Z0-9+-]*\s*$", text
    ):
        return ""
    text = re.sub(r"^#{1,6}\s+", "", text)
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}([^_]+)_{1,3}", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"^>\s+", "", text)
    text = re.sub(r"^[-*_]{3,}$", "", text)
    return re.sub(r"\s+", " ", text).strip()


def derive_title_from_content(content: str, max_length: int = TITLE_MAX_LENGTH) -> str:
    """Derive a working title from the first non-empty line of content.

    Strips Markdown syntax and truncates to ~max_length characters on a word
    boundary. Returns "" when content has no non-empty lines.

    Args:
        content: Full story content (Markdown)
        max_length: Maximum title length

    Returns:
        Derived title, or "" if content has no usable text
    """
    for raw_line in content.splitlines():
        line = _strip_markdown_line(raw_line)
        if not line:
            continue

        if len(line) <= max_length:
            return line

        truncated = line[:max_length]
        last_space = truncated.rfind(" ")
        if last_space > max_length * 0.5:
            truncated = truncated[:last_space]

        return truncated.rstrip(".,;:!?")

    return ""


async def _get_legacy_names(
    db: AsyncSession, legacy_ids: list[UUID]
) -> dict[UUID, str]:
    """Fetch legacy names by IDs.

    Args:
        db: Database session
        legacy_ids: List of legacy IDs

    Returns:
        Mapping of legacy ID to legacy name
    """
    if not legacy_ids:
        return {}

    result = await db.execute(
        select(Legacy.id, Legacy.name).where(Legacy.id.in_(legacy_ids))
    )
    return {row[0]: row[1] for row in result.all()}


def _primary_legacy_id(story: Story) -> UUID | None:
    """Return a story's primary legacy id, falling back to the first one."""
    if not story.legacy_associations:
        return None
    primary = next(
        (assoc for assoc in story.legacy_associations if assoc.role == "primary"),
        story.legacy_associations[0],
    )
    return primary.legacy_id


async def _load_backlink_summary(
    db: AsyncSession, story_id: UUID | None
) -> StoryBacklinkSummary | None:
    """Resolve a story's title + primary legacy for a backlink summary.

    Returns None when `story_id` is None, or when the story no longer exists
    (e.g. the source story was deleted, which auto-nulls the backlink FK —
    this defensive lookup-miss path should not normally be hit).
    """
    if story_id is None:
        return None
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()
    if story is None:
        return None
    return StoryBacklinkSummary(
        id=story.id,
        title=story.title,
        legacy_id=_primary_legacy_id(story),
    )


async def _load_grown_from_responses(
    db: AsyncSession, story_id: UUID, user_id: UUID
) -> list[StoryBacklinkSummary]:
    """Stories whose `source_story_id` points at `story_id`, viewer-filtered.

    Reciprocal side of the source-story backlink: "stories grown from
    responses on this story." Filtered per-candidate with `can_read_story`
    (plus the same author-only draft rule `get_story_detail` applies to the
    story itself) so private/draft stories grown from someone else's
    response are never leaked. The candidate set is expected to be small, so
    a per-row authorization loop is used rather than a bulk query.
    """
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.source_story_id == story_id)
        .order_by(Story.created_at.asc())
    )
    candidates = result.scalars().unique().all()

    summaries: list[StoryBacklinkSummary] = []
    for candidate in candidates:
        if candidate.status == "draft" and candidate.author_id != user_id:
            continue
        allowed, _reason = await can_read_story(db, candidate, user_id)
        if not allowed:
            continue
        summaries.append(
            StoryBacklinkSummary(
                id=candidate.id,
                title=candidate.title,
                legacy_id=_primary_legacy_id(candidate),
            )
        )
    return summaries


async def _ensure_contributor_access(
    db: AsyncSession,
    user_id: UUID,
    legacy_ids: list[UUID],
) -> None:
    """Require advocate-or-higher membership in every target legacy."""
    if not legacy_ids:
        raise HTTPException(
            status_code=403,
            detail="Must select at least one legacy to create a story",
        )

    result = await db.execute(
        select(LegacyMember.legacy_id, LegacyMember.role).where(
            LegacyMember.user_id == user_id,
            LegacyMember.legacy_id.in_(legacy_ids),
            LegacyMember.role.in_(ACTIVE_ROLES),
        )
    )
    roles_by_legacy = {row[0]: row[1] for row in result.all()}

    missing_or_readonly = [
        legacy_id
        for legacy_id in legacy_ids
        if ROLE_LEVELS.get(roles_by_legacy.get(legacy_id, ""), 0)
        < ROLE_LEVELS["advocate"]
    ]
    if missing_or_readonly:
        logger.warning(
            "story.contributor_access_denied",
            extra={
                "user_id": str(user_id),
                "legacy_ids": [str(lid) for lid in missing_or_readonly],
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Must be an advocate or higher for every target legacy",
        )


async def create_story(
    db: AsyncSession,
    user_id: UUID,
    data: StoryCreate,
) -> StoryResponse:
    """Create a new story.

    User must be a member of at least one of the specified legacies.

    Args:
        db: Database session
        user_id: User creating the story
        data: Story creation data

    Returns:
        Created story

    Raises:
        HTTPException: 403 if not a member of any legacy
    """
    # Extract legacy IDs from the legacies list
    legacy_ids = [leg.legacy_id for leg in data.legacies]

    await _ensure_contributor_access(db, user_id, legacy_ids)

    # Create-from-response wiring: only the response's own author may convert
    # it. Loaded up front so an unauthorized/missing response 403s/404s
    # before any story row is created.
    source_response: StoryResponseModel | None = None
    if data.source_response_id is not None:
        source_response = await story_response_service.load_response_for_conversion(
            db=db,
            response_id=data.source_response_id,
            user_id=user_id,
        )
        # A converted story must stay associated with (at least one of) the
        # source response's story's legacies — the offer's contract is "same
        # legacy," and an arbitrary `data.legacies` here would produce a
        # confusing cross-legacy backlink.
        source_legacy_ids_result = await db.execute(
            select(StoryLegacy.legacy_id).where(
                StoryLegacy.story_id == source_response.story_id
            )
        )
        source_legacy_ids = {row[0] for row in source_legacy_ids_result.all()}
        if source_legacy_ids.isdisjoint(legacy_ids):
            raise HTTPException(
                status_code=400,
                detail="A story converted from a response must be associated "
                "with the same legacy as the response's story",
            )

    provided_title = (data.title or "").strip()
    if provided_title:
        title = provided_title
        title_derived = False
    else:
        title = derive_title_from_content(data.content)
        title_derived = bool(title)

    # Create story (without legacy_id - using many-to-many)
    story = Story(
        author_id=user_id,
        title=title,
        content=data.content,
        visibility=data.visibility,
        status=data.status,
    )
    if source_response is not None:
        story.source_story_id = source_response.story_id
    db.add(story)
    await db.flush()  # Get story.id without committing

    if source_response is not None:
        # Only possible now that story.id exists (post-flush).
        source_response.converted_story_id = story.id

    # Create StoryLegacy associations
    for leg_assoc in data.legacies:
        story_legacy = StoryLegacy(
            story_id=story.id,
            legacy_id=leg_assoc.legacy_id,
            role=leg_assoc.role,
            position=leg_assoc.position,
        )
        db.add(story_legacy)

    # Create v1
    await create_story_version(
        db=db,
        story=story,
        title=title,
        content=data.content,
        source="manual_edit",
        user_id=user_id,
        change_summary="Initial version",
    )

    await db.commit()
    await db.refresh(story)

    # Get legacy names for response
    legacy_names = await _get_legacy_names(db, legacy_ids)

    # Build legacies response
    legacies = [
        LegacyAssociationResponse(
            legacy_id=leg.legacy_id,
            legacy_name=legacy_names.get(leg.legacy_id, "Unknown"),
            role=leg.role,
            position=leg.position,
        )
        for leg in sorted(data.legacies, key=lambda x: x.position)
    ]

    trace.get_current_span().set_attribute("title_derived", title_derived)
    logger.info(
        "story.created",
        extra={
            "story_id": str(story.id),
            "legacy_ids": [str(lid) for lid in legacy_ids],
            "author_id": str(user_id),
            "visibility": data.visibility,
            "title_derived": title_derived,
        },
    )

    if source_response is not None:
        primary_legacy_id = next(
            (leg.legacy_id for leg in data.legacies if leg.role == "primary"),
            data.legacies[0].legacy_id,
        )
        story_response_service.record_conversion(
            new_story_id=story.id,
            source_response_id=source_response.id,
            source_story_id=source_response.story_id,
            legacy_id=primary_legacy_id,
            user_id=user_id,
        )

    return StoryResponse(
        id=story.id,
        title=story.title,
        visibility=story.visibility,
        status=story.status,
        legacies=legacies,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def get_shared_story_ids(
    db: AsyncSession, legacy_id: UUID
) -> tuple[set[UUID], dict[UUID, str]]:
    """Get story IDs shared to this legacy via active links.

    For each active link involving this legacy, determine which stories the
    *other* legacy is sharing. The share mode (``requester_share_mode`` /
    ``target_share_mode``) on the *other* side controls how many stories are
    included:

    - ``"all"``        – every story belonging to the other legacy
    - ``"selective"``  – only stories explicitly listed in LegacyLinkShare

    Args:
        db: Database session
        legacy_id: The legacy whose story feed we are enriching

    Returns:
        Tuple of:
          - ``story_ids`` – set of UUIDs for stories shared into this legacy
          - ``source_map`` – mapping of story_id → human-readable source name
    """
    link_filters = await get_linked_legacy_filters(db, legacy_id)
    if not link_filters:
        return set(), {}

    story_ids: set[UUID] = set()
    source_map: dict[UUID, str] = {}

    for link_filter in link_filters:
        other_legacy_result = await db.execute(
            select(Legacy).where(Legacy.id == link_filter.legacy_id)
        )
        other_legacy = other_legacy_result.scalar_one_or_none()
        if other_legacy is None:
            continue

        source_name = (
            other_legacy.name
            if other_legacy.visibility == "public"
            else "another legacy"
        )

        if link_filter.share_mode == "all":
            sl_result = await db.execute(
                select(StoryLegacy.story_id).where(
                    StoryLegacy.legacy_id == link_filter.legacy_id
                )
            )
            for (sid,) in sl_result.all():
                story_ids.add(sid)
                source_map[sid] = source_name
        else:
            for story_id in link_filter.story_ids:
                story_ids.add(story_id)
                source_map[story_id] = source_name

    return story_ids, source_map


async def list_legacy_stories(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID | None = None,
    orphaned: bool = False,
) -> list[StorySummary]:
    """List stories with visibility filtering.

    Visibility rules:
    - Member sees: public + private + own personal stories
    - Non-member sees: only public stories

    Args:
        db: Database session
        user_id: Requesting user ID
        legacy_id: Optional filter by legacy
        orphaned: If True, return only orphaned stories (no legacy associations)

    Returns:
        List of stories visible to the user
    """
    # Build base query
    query = select(Story).options(
        selectinload(Story.author),
        selectinload(Story.legacy_associations),
    )

    if orphaned:
        # Find stories with no legacy associations owned by user
        query = query.where(
            Story.author_id == user_id,
            ~Story.id.in_(select(StoryLegacy.story_id)),
        )
    elif legacy_id:
        # Check if user is a member (not pending)
        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == user_id,
                LegacyMember.role.in_(ACTIVE_ROLES),
            )
        )
        member = member_result.scalar_one_or_none()

        # Filter by specific legacy
        query = query.join(StoryLegacy, Story.id == StoryLegacy.story_id).where(
            StoryLegacy.legacy_id == legacy_id
        )

        query = query.where(
            visible_stories_criteria(
                user_id,
                legacy_id=legacy_id,
                membership_role=member.role if member else None,
                link_filters=[],
            )
        )

        # Filter drafts: only the author sees their own drafts
        query = query.where(
            or_(
                Story.status == "published",
                Story.author_id == user_id,
            )
        )
    else:
        # No filter specified - this shouldn't happen in normal flow
        # Return empty list or raise error
        return []

    query = query.order_by(Story.created_at.desc())

    story_result = await db.execute(query)
    stories = story_result.scalars().unique().all()

    # Collect IDs of stories already in the main result set
    own_story_ids: set[UUID] = {s.id for s in stories}

    # Get all unique legacy IDs from all stories
    all_legacy_ids: set[UUID] = set()
    for story in stories:
        all_legacy_ids.update(assoc.legacy_id for assoc in story.legacy_associations)

    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    # Build the base list of summaries from the legacy's own stories
    summaries: list[StorySummary] = [
        StorySummary(
            id=story.id,
            title=story.title,
            content_preview=create_content_preview(story.content),
            author_id=story.author_id,
            author_name=story.author.name,
            author_username=story.author.username,
            author_avatar_url=story.author.avatar_url,
            visibility=story.visibility,
            status=story.status,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
            ],
            favorite_count=story.favorite_count or 0,
            response_count=story.response_count or 0,
            reaction_heart_count=story.reaction_heart_count or 0,
            reaction_candle_count=story.reaction_candle_count or 0,
            reaction_smile_count=story.reaction_smile_count or 0,
            created_at=story.created_at,
            updated_at=story.updated_at,
        )
        for story in stories
    ]

    # Append shared stories from linked legacies (only when listing by legacy_id)
    if legacy_id and not orphaned and member:
        shared_ids, source_map = await get_shared_story_ids(db, legacy_id)

        # Exclude stories already present in the main result and non-public stories
        new_shared_ids = shared_ids - own_story_ids
        if new_shared_ids:
            shared_result = await db.execute(
                select(Story)
                .options(
                    selectinload(Story.author),
                    selectinload(Story.legacy_associations),
                )
                .where(
                    Story.id.in_(new_shared_ids),
                    Story.visibility.in_(["public", "private"]),
                    Story.status == "published",
                )
                .order_by(Story.created_at.desc())
            )
            shared_stories = shared_result.scalars().unique().all()

            # Resolve legacy names for the shared stories
            shared_legacy_ids: set[UUID] = set()
            for story in shared_stories:
                shared_legacy_ids.update(
                    assoc.legacy_id for assoc in story.legacy_associations
                )
            shared_legacy_names = await _get_legacy_names(
                db, list(shared_legacy_ids - set(legacy_names.keys()))
            )
            all_legacy_names = {**legacy_names, **shared_legacy_names}

            for story in shared_stories:
                summaries.append(
                    StorySummary(
                        id=story.id,
                        title=story.title,
                        content_preview=create_content_preview(story.content),
                        author_id=story.author_id,
                        author_name=story.author.name,
                        author_username=story.author.username,
                        author_avatar_url=story.author.avatar_url,
                        visibility=story.visibility,
                        status=story.status,
                        legacies=[
                            LegacyAssociationResponse(
                                legacy_id=assoc.legacy_id,
                                legacy_name=all_legacy_names.get(
                                    assoc.legacy_id, "Unknown"
                                ),
                                role=assoc.role,
                                position=assoc.position,
                            )
                            for assoc in sorted(
                                story.legacy_associations, key=lambda a: a.position
                            )
                        ],
                        favorite_count=story.favorite_count or 0,
                        response_count=story.response_count or 0,
                        reaction_heart_count=story.reaction_heart_count or 0,
                        reaction_candle_count=story.reaction_candle_count or 0,
                        reaction_smile_count=story.reaction_smile_count or 0,
                        shared_from=source_map.get(story.id),
                        created_at=story.created_at,
                        updated_at=story.updated_at,
                    )
                )

    logger.info(
        "story.list",
        extra={
            "legacy_id": str(legacy_id) if legacy_id else None,
            "user_id": str(user_id),
            "orphaned": orphaned,
            "count": len(summaries),
        },
    )

    return summaries


async def get_story_stats(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, int]:
    """Get story-specific stats for a user.

    Returns counts for: stories authored, favorites given to stories,
    stories evolved via AI, distinct legacies written for.
    """
    from app.models.favorite import UserFavorite
    from app.models.story_evolution import StoryEvolutionSession

    # Count stories authored by user
    my_stories_result = await db.execute(
        select(func.count(Story.id)).where(Story.author_id == user_id)
    )
    my_stories_count = my_stories_result.scalar() or 0

    # Count favorites given to stories
    fav_result = await db.execute(
        select(func.count(UserFavorite.id)).where(
            UserFavorite.user_id == user_id,
            UserFavorite.entity_type == "story",
        )
    )
    favorites_given_count = fav_result.scalar() or 0

    # Count stories evolved via AI (completed sessions)
    evolved_result = await db.execute(
        select(func.count(func.distinct(StoryEvolutionSession.story_id))).where(
            StoryEvolutionSession.created_by == user_id,
            StoryEvolutionSession.phase == "completed",
        )
    )
    stories_evolved_count = evolved_result.scalar() or 0

    # Count distinct legacies user has written stories for
    legacies_result = await db.execute(
        select(func.count(func.distinct(StoryLegacy.legacy_id)))
        .join(Story, StoryLegacy.story_id == Story.id)
        .where(Story.author_id == user_id)
    )
    legacies_written_for_count = legacies_result.scalar() or 0

    logger.info(
        "story.stats",
        extra={"user_id": str(user_id)},
    )

    return {
        "my_stories_count": my_stories_count,
        "favorites_given_count": favorites_given_count,
        "stories_evolved_count": stories_evolved_count,
        "legacies_written_for_count": legacies_written_for_count,
    }


class TopLegacyItem(TypedDict):
    """Internal typed dict for top legacy query results."""

    legacy_id: UUID
    legacy_name: str
    profile_image_url: str | None
    story_count: int


class StoryScopedCounts(TypedDict):
    """Internal typed dict for scoped story counts."""

    all: int
    mine: int
    shared: int


class StoryScopedResult(TypedDict):
    """Internal typed dict for scoped story list result."""

    items: list[StorySummary]
    counts: StoryScopedCounts


async def get_top_legacies(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 6,
) -> list[TopLegacyItem]:
    """Get legacies the user has written the most stories about.

    Returns legacy_id, legacy_name, profile_image_url, and story_count,
    ordered by story_count descending.
    """
    from ..services.legacy import get_profile_image_url

    # Count stories per legacy for this author
    result = await db.execute(
        select(
            StoryLegacy.legacy_id,
            func.count(StoryLegacy.story_id).label("story_count"),
        )
        .join(Story, StoryLegacy.story_id == Story.id)
        .where(Story.author_id == user_id)
        .group_by(StoryLegacy.legacy_id)
        .order_by(func.count(StoryLegacy.story_id).desc())
        .limit(limit)
    )
    rows = result.all()

    if not rows:
        return []

    # Fetch legacy details
    legacy_ids = [row[0] for row in rows]
    legacy_result = await db.execute(
        select(Legacy)
        .options(selectinload(Legacy.profile_image))
        .where(Legacy.id.in_(legacy_ids))
    )
    legacies_by_id = {leg.id: leg for leg in legacy_result.scalars().all()}

    items: list[TopLegacyItem] = []
    for legacy_id, story_count in rows:
        legacy = legacies_by_id.get(legacy_id)
        if legacy:
            items.append(
                TopLegacyItem(
                    legacy_id=legacy.id,
                    legacy_name=legacy.name,
                    profile_image_url=get_profile_image_url(legacy),
                    story_count=story_count,
                )
            )

    logger.info(
        "story.top_legacies",
        extra={"user_id": str(user_id), "count": len(items)},
    )

    return items


async def list_stories_scoped(
    db: AsyncSession,
    user_id: UUID,
    scope: str = "all",
) -> StoryScopedResult:
    """List stories by scope with filter counts.

    Scopes:
        all: all stories the user can see (authored + shared)
        mine: stories authored by the user
        shared: stories by others on legacies the user is a member of
        favorites: stories the user has favorited
        drafts: user's own draft stories
    """
    from app.models.favorite import UserFavorite

    # Query user's own stories
    mine_result = await db.execute(
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
        .where(Story.author_id == user_id)
        .order_by(Story.created_at.desc())
    )
    mine_stories = list(mine_result.scalars().unique().all())

    # Query shared stories (by others on legacies user is a member of)
    user_legacy_ids = select(LegacyMember.legacy_id).where(
        LegacyMember.user_id == user_id,
        LegacyMember.role.in_(ACTIVE_ROLES),
    )
    shared_result = await db.execute(
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
        .join(StoryLegacy, Story.id == StoryLegacy.story_id)
        .where(
            StoryLegacy.legacy_id.in_(user_legacy_ids),
            Story.author_id != user_id,
            Story.status == "published",
            visible_stories_criteria(
                user_id,
                legacy_id=None,
                membership_role="admirer",
                link_filters=[],
            ),
        )
        .order_by(Story.created_at.desc())
    )
    shared_stories = list(shared_result.scalars().unique().all())

    # Compute counts (published only for mine count to match visible items)
    mine_published = [s for s in mine_stories if s.status == "published"]
    counts: StoryScopedCounts = {
        "all": len(mine_published) + len(shared_stories),
        "mine": len(mine_published),
        "shared": len(shared_stories),
    }

    # Resolve legacy names for all stories
    all_stories_combined = mine_stories + shared_stories
    all_legacy_ids: set[UUID] = set()
    for story in all_stories_combined:
        all_legacy_ids.update(assoc.legacy_id for assoc in story.legacy_associations)
    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    def to_summary(story: Story) -> StorySummary:
        return StorySummary(
            id=story.id,
            title=story.title,
            content_preview=create_content_preview(story.content),
            author_id=story.author_id,
            author_name=story.author.name,
            author_username=story.author.username,
            author_avatar_url=story.author.avatar_url,
            visibility=story.visibility,
            status=story.status,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
            ],
            favorite_count=story.favorite_count or 0,
            response_count=story.response_count or 0,
            reaction_heart_count=story.reaction_heart_count or 0,
            reaction_candle_count=story.reaction_candle_count or 0,
            reaction_smile_count=story.reaction_smile_count or 0,
            created_at=story.created_at,
            updated_at=story.updated_at,
        )

    # Select items based on scope
    if scope == "mine":
        items = [to_summary(s) for s in mine_published]
    elif scope == "shared":
        items = [to_summary(s) for s in shared_stories]
    elif scope == "favorites":
        fav_result = await db.execute(
            select(UserFavorite.entity_id).where(
                UserFavorite.user_id == user_id,
                UserFavorite.entity_type == "story",
            )
        )
        fav_ids = {row[0] for row in fav_result.all()}
        all_summaries = [to_summary(s) for s in mine_published + shared_stories]
        items = [s for s in all_summaries if s.id in fav_ids]
    elif scope == "drafts":
        drafts = [s for s in mine_stories if s.status == "draft"]
        items = [to_summary(s) for s in drafts]
    else:
        # "all" — mine (published) + shared
        items = [to_summary(s) for s in mine_published + shared_stories]

    logger.info(
        "story.list_scoped",
        extra={"user_id": str(user_id), "scope": scope, "count": len(items)},
    )

    return StoryScopedResult(items=items, counts=counts)


async def list_public_stories(
    db: AsyncSession,
    legacy_id: UUID,
) -> list[StorySummary]:
    """List public stories for a legacy (no auth required).

    Args:
        db: Database session
        legacy_id: Legacy ID

    Returns:
        List of public stories for the legacy
    """
    query = (
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
        .join(StoryLegacy, Story.id == StoryLegacy.story_id)
        .where(StoryLegacy.legacy_id == legacy_id)
        .where(Story.visibility == "public")
        .where(Story.status == "published")
        .order_by(Story.created_at.desc())
    )

    story_result = await db.execute(query)
    stories = story_result.scalars().unique().all()

    # Get all unique legacy IDs from all stories
    all_legacy_ids: set[UUID] = set()
    for story in stories:
        all_legacy_ids.update(assoc.legacy_id for assoc in story.legacy_associations)

    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    logger.info(
        "story.list.public",
        extra={
            "legacy_id": str(legacy_id),
            "count": len(stories),
        },
    )

    return [
        StorySummary(
            id=story.id,
            title=story.title,
            content_preview=create_content_preview(story.content),
            author_id=story.author_id,
            author_name=story.author.name,
            author_username=story.author.username,
            author_avatar_url=story.author.avatar_url,
            visibility=story.visibility,
            status=story.status,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
            ],
            favorite_count=story.favorite_count or 0,
            response_count=story.response_count or 0,
            reaction_heart_count=story.reaction_heart_count or 0,
            reaction_candle_count=story.reaction_candle_count or 0,
            reaction_smile_count=story.reaction_smile_count or 0,
            created_at=story.created_at,
            updated_at=story.updated_at,
        )
        for story in stories
    ]


async def get_story_detail(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
) -> StoryDetail:
    """Get story detail.

    Enforces visibility rules.

    Args:
        db: Database session
        user_id: Requesting user ID
        story_id: Story ID

    Returns:
        Story details

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    # Load story with relationships
    result = await db.execute(
        select(Story)
        .options(
            selectinload(Story.author),
            selectinload(Story.legacy_associations),
        )
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        logger.warning(
            "story.not_found",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
            },
        )
        raise HTTPException(
            status_code=404,
            detail="Story not found",
        )

    # Check visibility
    authorized, _reason = await can_read_story(db, story, user_id)

    if not authorized:
        logger.warning(
            "story.access_denied",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "visibility": story.visibility,
                "author_id": str(story.author_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Not authorized to view this story",
        )

    # Draft stories are only visible to the author; return 404 to non-authors
    # (do not leak that the draft exists to other legacy members)
    if story.status == "draft" and story.author_id != user_id:
        raise HTTPException(
            status_code=404,
            detail="Story not found",
        )

    # Get legacy names for response
    legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
    legacy_names = await _get_legacy_names(db, legacy_ids)

    # Story-to-story backlinks (response-to-story conversion): this story's
    # link back to the story it grew out of, and the reciprocal set of
    # stories that grew out of responses left here.
    source_story_summary = await _load_backlink_summary(db, story.source_story_id)
    grown_from_responses = await _load_grown_from_responses(db, story.id, user_id)

    # Reaction types the requesting user has already made on this story, so
    # the frontend can render toggled-on state on load rather than only
    # after an in-session toggle response.
    my_reactions_result = await db.execute(
        select(StoryReactionModel.reaction_type).where(
            StoryReactionModel.story_id == story_id,
            StoryReactionModel.user_id == user_id,
        )
    )
    # The column is a plain `str` at the SQLAlchemy layer (see StoryReaction
    # model); values are always one of the three reaction types written by
    # `toggle_reaction`, so the narrowing cast is safe.
    my_reactions = cast(list[ReactionType], list(my_reactions_result.scalars().all()))

    # Count versions and check for draft (only for author)
    version_count = None
    has_draft = None
    if story.author_id == user_id:
        from sqlalchemy import func as sa_func

        count_result = await db.execute(
            select(sa_func.count())
            .select_from(StoryVersion)
            .where(StoryVersion.story_id == story_id)
        )
        version_count = count_result.scalar_one()

        draft = await get_draft_version(db, story_id)
        has_draft = draft is not None

    logger.info(
        "story.detail",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
        },
    )

    return StoryDetail(
        id=story.id,
        author_id=story.author_id,
        author_name=story.author.name,
        author_username=story.author.username,
        author_avatar_url=story.author.avatar_url,
        author_email=story.author.email,
        title=story.title,
        content=normalize_media_urls_for_story_content(story.content),
        visibility=story.visibility,
        status=story.status,
        legacies=[
            LegacyAssociationResponse(
                legacy_id=assoc.legacy_id,
                legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                role=assoc.role,
                position=assoc.position,
            )
            for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
        ],
        favorite_count=story.favorite_count or 0,
        response_count=story.response_count or 0,
        reaction_heart_count=story.reaction_heart_count or 0,
        reaction_candle_count=story.reaction_candle_count or 0,
        reaction_smile_count=story.reaction_smile_count or 0,
        my_reactions=my_reactions,
        version_count=version_count,
        has_draft=has_draft,
        source_conversation_id=story.source_conversation_id,
        source_story=source_story_summary,
        grown_from_responses=grown_from_responses,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def update_story(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
    data: StoryUpdate,
    background_tasks: BackgroundTasks,
) -> StoryResponse:
    """Update a story.

    Only author can update.

    A content-changing save is a single `UPDATE stories` -- it never mints a
    story version and never waits on an LLM call or a re-index. Versions are
    minted only at boundaries (publish, Evolve entry, AI rewrite, restore, or
    an editing-session boundary); see design.md Decisions 1 and 2 in
    `openspec/changes/story-save-path-performance`.

    Before applying the incoming update, this function evaluates whether the
    *previous* editing session (tracked via `story.pending_edit_since`) has
    crossed a boundary -- gone idle, or exceeded the max session interval --
    and, if so, mints a version capturing the content as it was stored
    coming into this request, not the content arriving in this request. At
    most one version is minted per call. If the incoming update itself
    changes the title or content and no session is currently open, a new
    session is opened (`pending_edit_since` is set); if one is already open,
    it continues untouched.

    Args:
        db: Database session
        user_id: User updating the story
        story_id: Story ID
        data: Update data
        background_tasks: The request's `BackgroundTasks`. Forwarded to
            `mint_version_at_boundary()` so its post-commit work
            (change-summary upgrade, search re-index) can be scheduled when
            a session boundary mints a version during this call.

    Returns:
        Updated story. `version_number` reports a version minted by *this*
        request's boundary evaluation (Step A below), if any -- it is
        **not** the story's current/active version number. It is `None` on
        an ordinary content save where no session boundary was crossed.

    Raises:
        HTTPException: delegates to `require_story_write_access` — 404 if not
            found, 404 if it's another author's draft (existence hidden),
            403 if the caller can't read it at all, 403 if the caller can
            read it but isn't the author.
    """
    started = time.perf_counter()

    # Load story and enforce author-only write access via the canonical gate.
    story = await require_story_write_access(
        db=db, story_id=story_id, user_id=user_id, action="update"
    )

    now = datetime.now(timezone.utc)
    settings = get_settings()

    # --- Step A: evaluate the *previous* session's boundary BEFORE applying
    # the incoming update. This ordering is critical -- a boundary mint must
    # capture the content as currently stored (the state the previous
    # editing session ended at), not the content arriving in this request.
    # `mint_version_at_boundary()` reads `story.title`/`story.content` as its
    # snapshot and does not change their values, so it's safe to run before
    # Step B computes/applies the new title and content. At most one mint
    # happens per request; the helper clears `pending_edit_since` itself.
    minted_version_number: int | None = None
    pending_edit_since = _as_aware_utc(story.pending_edit_since)
    if pending_edit_since is not None:
        idle_cutoff = now - timedelta(seconds=settings.story_edit_session_idle_seconds)
        max_cutoff = now - timedelta(seconds=settings.story_edit_session_max_seconds)
        updated_at = _as_aware_utc(story.updated_at)

        # Known imprecision: `updated_at` also moves on a visibility-only
        # update, so a visibility change can extend an editing session's
        # idle clock. The max-interval rule below is measured from
        # `pending_edit_since`, which visibility changes never touch, so it
        # still bounds a session regardless.
        if updated_at is not None and updated_at < idle_cutoff:
            minted = await mint_version_at_boundary(
                db,
                story,
                reason="session_idle",
                user_id=user_id,
                background_tasks=background_tasks,
            )
            minted_version_number = minted.version_number
        elif pending_edit_since < max_cutoff:
            minted = await mint_version_at_boundary(
                db,
                story,
                reason="session_max_interval",
                user_id=user_id,
                background_tasks=background_tasks,
            )
            minted_version_number = minted.version_number

    # --- Step B: apply the incoming update, exactly as before.
    # Determine new title/content (versioned fields).
    # Omitted title (None) leaves the stored title untouched; an explicitly
    # blank title falls back to a working title derived from content.
    new_content = data.content if data.content is not None else story.content

    title_derived = False
    if data.title is not None:
        provided_title = data.title.strip()
        if provided_title:
            new_title = provided_title
        else:
            new_title = derive_title_from_content(new_content)
            title_derived = bool(new_title)
    else:
        new_title = story.title

    content_changed = new_title != story.title or new_content != story.content

    story.title = new_title
    story.content = new_content

    # Handle visibility update (not versioned)
    if data.visibility is not None:
        story.visibility = data.visibility

    # Update legacy associations if provided
    if data.legacies is not None:
        # Verify user can contribute to every new legacy
        legacy_ids = [leg.legacy_id for leg in data.legacies]
        await _ensure_contributor_access(db, user_id, legacy_ids)

        # Delete existing associations
        await db.execute(select(StoryLegacy).where(StoryLegacy.story_id == story_id))
        for assoc in story.legacy_associations:
            await db.delete(assoc)

        # Create new associations
        for leg_assoc in data.legacies:
            story_legacy = StoryLegacy(
                story_id=story.id,
                legacy_id=leg_assoc.legacy_id,
                role=leg_assoc.role,
                position=leg_assoc.position,
            )
            db.add(story_legacy)

    story.updated_at = datetime.now(timezone.utc)

    # --- Step C: open a new editing session if content changed and none is
    # already open. No version is minted for an ordinary content save --
    # that's the entire point of this change. If a session is already open,
    # leave `pending_edit_since` untouched; it continues.
    if content_changed and story.pending_edit_since is None:
        story.pending_edit_since = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(story, ["legacy_associations"])

    # Get legacy names for response
    legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
    legacy_names = await _get_legacy_names(db, legacy_ids)

    version_minted = minted_version_number is not None
    STORY_SAVE_DURATION.labels(minted=str(version_minted).lower()).observe(
        time.perf_counter() - started
    )

    trace.get_current_span().set_attribute("title_derived", title_derived)
    logger.info(
        "story.updated",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
            "title_derived": title_derived,
            "version_minted": version_minted,
        },
    )

    return StoryResponse(
        id=story.id,
        title=story.title,
        version_number=minted_version_number,
        visibility=story.visibility,
        status=story.status,
        legacies=[
            LegacyAssociationResponse(
                legacy_id=assoc.legacy_id,
                legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                role=assoc.role,
                position=assoc.position,
            )
            for assoc in sorted(story.legacy_associations, key=lambda a: a.position)
        ],
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def close_edit_session(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
    background_tasks: BackgroundTasks,
) -> None:
    """Close an editing session in response to the client's navigate-away hint.

    The client posts this best-effort, `fetch(..., { keepalive: true })`
    signal when the author leaves the Edit page (design.md Decision 2,
    `openspec/changes/story-save-path-performance`). If an editing session
    is open (`story.pending_edit_since is not None`), this mints a version
    capturing the session's content via `mint_version_at_boundary()` with
    `reason="session_close"` -- the same boundary helper `update_story()`
    uses for its idle/max-interval checks, so the fallback summary,
    `pending_edit_since` clearing, and post-commit change-summary/reindex
    scheduling all behave identically.

    Idempotent and safe to lose: if no session is open (already closed by a
    prior call, or by a save's own idle/max-interval check), this is a
    no-op. If the client's request never arrives at all (tab crash, offline),
    nothing is lost -- the same session boundary is still evaluated lazily
    on the next save or the next version-history read (design.md Decision 2,
    "Editing sessions close without user action").

    Args:
        db: Database session
        user_id: User closing the session (must be the story's author)
        story_id: Story ID
        background_tasks: The request's `BackgroundTasks`. Forwarded to
            `mint_version_at_boundary()` so its post-commit work
            (change-summary upgrade, search re-index) can be scheduled when
            a version is minted.

    Raises:
        HTTPException: delegates to `require_story_write_access` -- 404 if
            not found, 404 if it's another author's draft (existence
            hidden), 403 if the caller can't read it at all, 403 if the
            caller can read it but isn't the author.
    """
    story = await require_story_write_access(
        db=db, story_id=story_id, user_id=user_id, action="update"
    )

    if story.pending_edit_since is not None:
        await mint_version_at_boundary(
            db,
            story,
            reason="session_close",
            user_id=user_id,
            background_tasks=background_tasks,
        )

    await db.commit()


async def delete_story(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
) -> dict[str, str]:
    """Delete a story.

    Only author or creator of ANY linked legacy can delete.

    Args:
        db: Database session
        user_id: User deleting the story
        story_id: Story ID

    Returns:
        Success message

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    # Load story with associations
    result = await db.execute(
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(
            status_code=404,
            detail="Story not found",
        )

    # Check if user is author
    is_author = story.author_id == user_id

    # Check if user is creator of ANY linked legacy
    is_creator = False
    if not is_author:
        legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
        if legacy_ids:
            # Check if user is creator of any linked legacy
            creator_result = await db.execute(
                select(Legacy).where(
                    Legacy.id.in_(legacy_ids),
                    Legacy.created_by == user_id,
                )
            )
            creator_legacy = creator_result.scalar_one_or_none()
            is_creator = creator_legacy is not None

    if not is_author and not is_creator:
        logger.warning(
            "story.delete_denied",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "author_id": str(story.author_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Only the author or creator of a linked legacy can delete this story",
        )

    story_title = story.title

    # Delete story (associations will cascade)
    await db.delete(story)
    await db.commit()

    logger.info(
        "story.deleted",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
            "deleted_by": "author" if is_author else "creator",
        },
    )

    return {"message": "Story deleted", "title": story_title}
