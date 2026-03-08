"""Service layer for story operations."""

import logging
import re
from datetime import datetime, timezone
from typing import TypedDict
from urllib.parse import urlparse
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.associations import StoryLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.story import Story
from ..models.story_version import StoryVersion
from ..schemas.associations import LegacyAssociationResponse
from .change_summary import generate_change_summary
from .story_version import create_version as create_story_version
from .story_version import get_draft_version
from ..schemas.story import (
    StoryCreate,
    StoryDetail,
    StoryResponse,
    StorySummary,
    StoryUpdate,
)

logger = logging.getLogger(__name__)

# Maximum length for content preview
PREVIEW_MAX_LENGTH = 200

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


async def _get_highest_story_member_role(
    db: AsyncSession,
    user_id: UUID,
    legacy_ids: list[UUID],
) -> str | None:
    """Get user's highest role across a story's linked legacies."""
    if not legacy_ids:
        return None

    result = await db.execute(
        select(LegacyMember.role).where(
            LegacyMember.user_id == user_id,
            LegacyMember.legacy_id.in_(legacy_ids),
            LegacyMember.role != "pending",
        )
    )
    roles = result.scalars().all()
    if not roles:
        return None

    return max(roles, key=lambda role: ROLE_LEVELS.get(role, 0))


def _can_edit_story(
    story: Story,
    user_id: UUID,
    member_role: str | None,
) -> bool:
    """Check whether a user can edit a story.

    Rules:
    - Author can always edit
    - Creator/Admin can edit any story in linked legacies
    - Advocate can edit private stories
    """
    if story.author_id == user_id:
        return True

    level = ROLE_LEVELS.get(member_role or "", 0)
    if level >= ROLE_LEVELS["admin"]:
        return True

    return story.visibility == "private" and level >= ROLE_LEVELS["advocate"]


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

    # Verify user is a member of at least one legacy
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.user_id == user_id,
            LegacyMember.legacy_id.in_(legacy_ids),
            LegacyMember.role != "pending",
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        logger.warning(
            "story.create_denied",
            extra={
                "user_id": str(user_id),
                "legacy_ids": [str(lid) for lid in legacy_ids],
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Must be a member of at least one legacy to create a story",
        )

    # Create story (without legacy_id - using many-to-many)
    story = Story(
        author_id=user_id,
        title=data.title,
        content=data.content,
        visibility=data.visibility,
        status=data.status,
    )
    db.add(story)
    await db.flush()  # Get story.id without committing

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
        title=data.title,
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

    logger.info(
        "story.created",
        extra={
            "story_id": str(story.id),
            "legacy_ids": [str(lid) for lid in legacy_ids],
            "author_id": str(user_id),
            "visibility": data.visibility,
        },
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
    from ..models.associations import StoryLegacy as _StoryLegacy
    from ..models.legacy_link import LegacyLink, LegacyLinkShare

    # 1. Find all active links where this legacy participates
    links_result = await db.execute(
        select(LegacyLink).where(
            LegacyLink.status == "active",
            or_(
                LegacyLink.requester_legacy_id == legacy_id,
                LegacyLink.target_legacy_id == legacy_id,
            ),
        )
    )
    links = links_result.scalars().all()

    if not links:
        return set(), {}

    story_ids: set[UUID] = set()
    source_map: dict[UUID, str] = {}

    for link in links:
        # Determine which side "we" are and which side is the "other"
        if link.requester_legacy_id == legacy_id:
            other_legacy_id = link.target_legacy_id
            other_share_mode = link.target_share_mode
        else:
            other_legacy_id = link.requester_legacy_id
            other_share_mode = link.requester_share_mode

        # Fetch the other legacy to resolve its name and visibility
        other_legacy_result = await db.execute(
            select(Legacy).where(Legacy.id == other_legacy_id)
        )
        other_legacy = other_legacy_result.scalar_one_or_none()
        if other_legacy is None:
            continue

        source_name = (
            other_legacy.name
            if other_legacy.visibility == "public"
            else "another legacy"
        )

        if other_share_mode == "all":
            # Collect all story IDs belonging to the other legacy
            sl_result = await db.execute(
                select(_StoryLegacy.story_id).where(
                    _StoryLegacy.legacy_id == other_legacy_id
                )
            )
            for (sid,) in sl_result.all():
                story_ids.add(sid)
                source_map[sid] = source_name
        else:
            # "selective" – only explicitly shared stories
            shares_result = await db.execute(
                select(LegacyLinkShare).where(
                    LegacyLinkShare.legacy_link_id == link.id,
                    LegacyLinkShare.source_legacy_id == other_legacy_id,
                    LegacyLinkShare.resource_type == "story",
                )
            )
            for share in shares_result.scalars().all():
                story_ids.add(share.resource_id)
                source_map[share.resource_id] = source_name

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
                LegacyMember.role != "pending",
            )
        )
        member = member_result.scalar_one_or_none()

        # Filter by specific legacy
        query = query.join(StoryLegacy, Story.id == StoryLegacy.story_id).where(
            StoryLegacy.legacy_id == legacy_id
        )

        if member:
            # Member sees: public + private + own personal stories
            query = query.where(
                or_(
                    Story.visibility == "public",
                    Story.visibility == "private",
                    and_(Story.visibility == "personal", Story.author_id == user_id),
                )
            )
        else:
            # Non-member sees only public stories
            query = query.where(Story.visibility == "public")

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
            created_at=story.created_at,
            updated_at=story.updated_at,
        )
        for story in stories
    ]

    # Append shared stories from linked legacies (only when listing by legacy_id)
    if legacy_id and not orphaned:
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
                    Story.visibility == "public",
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
        LegacyMember.role != "pending",
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
            or_(
                Story.visibility == "public",
                Story.visibility == "private",
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
    authorized = await _check_story_visibility(db, user_id, story)

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
        version_count=version_count,
        has_draft=has_draft,
        source_conversation_id=story.source_conversation_id,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def update_story(
    db: AsyncSession,
    user_id: UUID,
    story_id: UUID,
    data: StoryUpdate,
) -> StoryResponse:
    """Update a story.

    Only author can update.

    Args:
        db: Database session
        user_id: User updating the story
        story_id: Story ID
        data: Update data

    Returns:
        Updated story

    Raises:
        HTTPException: 404 if not found, 403 if not author
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

    # Author-only updates
    if story.author_id != user_id:
        logger.warning(
            "story.update_denied",
            extra={
                "story_id": str(story_id),
                "user_id": str(user_id),
                "author_id": str(story.author_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Only the story author can update this story",
        )

    # Determine if title/content changed (versioned fields)
    new_title = data.title if data.title is not None else story.title
    new_content = data.content if data.content is not None else story.content
    content_changed = (data.title is not None and data.title != story.title) or (
        data.content is not None and data.content != story.content
    )

    version_number = None
    if content_changed:
        # Capture old content before version creation updates story fields
        old_content = story.content

        # Generate change summary
        change_summary = await generate_change_summary(
            old_content=old_content,
            new_content=new_content,
            source="manual_edit",
        )

        # Create new version (handles deactivation, stale marking, story field updates)
        new_version = await create_story_version(
            db=db,
            story=story,
            title=new_title,
            content=new_content,
            source="manual_edit",
            user_id=user_id,
            change_summary=change_summary,
        )
        version_number = new_version.version_number

    # Handle visibility update (not versioned)
    if data.visibility is not None:
        story.visibility = data.visibility

    # Update legacy associations if provided
    if data.legacies is not None:
        # Verify user is member of at least one new legacy
        legacy_ids = [leg.legacy_id for leg in data.legacies]
        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        member = member_result.scalar_one_or_none()

        if not member:
            logger.warning(
                "story.update_denied",
                extra={
                    "story_id": str(story_id),
                    "user_id": str(user_id),
                    "legacy_ids": [str(lid) for lid in legacy_ids],
                },
            )
            raise HTTPException(
                status_code=403,
                detail="Must be a member of at least one legacy",
            )

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

    await db.commit()
    await db.refresh(story, ["legacy_associations"])

    # Get legacy names for response
    legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]
    legacy_names = await _get_legacy_names(db, legacy_ids)

    logger.info(
        "story.updated",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
        },
    )

    return StoryResponse(
        id=story.id,
        title=story.title,
        version_number=version_number,
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


async def _check_story_visibility(
    db: AsyncSession,
    user_id: UUID,
    story: Story,
) -> bool:
    """Check if user can view a story based on visibility rules.

    Union access: User can view if member of ANY linked legacy.

    Args:
        db: Database session
        user_id: Requesting user ID
        story: Story to check (must have legacy_associations loaded)

    Returns:
        True if authorized, False otherwise
    """
    # Public stories are visible to everyone
    if story.visibility == "public":
        return True

    # Personal stories are only visible to author
    if story.visibility == "personal":
        return story.author_id == user_id

    # Private stories are visible to members of ANY linked legacy (union access)
    if story.visibility == "private":
        # Get legacy IDs from story associations
        story_legacy_ids = [assoc.legacy_id for assoc in story.legacy_associations]

        if not story_legacy_ids:
            # Story has no legacy associations - only author can view
            return story.author_id == user_id

        # Check if user is a member of ANY linked legacy
        result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(story_legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        member = result.scalar_one_or_none()
        return member is not None

    # Unknown visibility (shouldn't happen)
    return False
