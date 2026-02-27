"""Graph Access Filter - enforces PostgreSQL permission model on graph-discovered story IDs."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.story import Story
from ..schemas.retrieval import VisibilityFilter
from .retrieval import get_linked_legacy_filters, resolve_visibility_filter

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.graph_access_filter")


class GraphAccessFilter:
    """Filters graph-discovered story IDs through the PostgreSQL permission model.

    Ensures that stories surfaced by graph traversal are only returned to users
    who have the appropriate access rights according to the existing legacy
    membership and story visibility rules.
    """

    async def filter_story_ids(
        self,
        story_ids_with_sources: list[tuple[UUID, UUID, float]],
        user_id: UUID,
        primary_legacy_id: UUID,
        db: AsyncSession,
    ) -> list[tuple[UUID, float]]:
        """Return filtered (story_id, score) tuples the user can access.

        Args:
            story_ids_with_sources: List of (story_id, source_legacy_id, score) tuples
                from the graph traversal layer.
            user_id: ID of the user making the request.
            primary_legacy_id: The legacy the user is currently browsing.
            db: Async database session.

        Returns:
            List of (story_id, score) tuples for stories the user may access.
            Returns an empty list on permission errors or when no input is provided.
        """
        if not story_ids_with_sources:
            return []

        with tracer.start_as_current_span(
            "graph_access_filter.filter_story_ids"
        ) as span:
            span.set_attribute("user_id", str(user_id))
            span.set_attribute("primary_legacy_id", str(primary_legacy_id))
            span.set_attribute("input_count", len(story_ids_with_sources))

            # 1. Resolve user's visibility permissions for the primary legacy.
            #    If this raises (e.g. user is not a member) return empty gracefully.
            try:
                visibility_filter = await resolve_visibility_filter(
                    db, user_id, primary_legacy_id
                )
            except HTTPException as exc:
                logger.warning(
                    "graph_access_filter.permission_denied",
                    extra={
                        "user_id": str(user_id),
                        "primary_legacy_id": str(primary_legacy_id),
                        "status_code": exc.status_code,
                    },
                )
                span.set_attribute("permission_denied", True)
                return []

            # 2. Fetch the linked-legacy access rules for the primary legacy.
            linked_legacy_filters = await get_linked_legacy_filters(
                db, primary_legacy_id
            )

            # Build a fast lookup: linked_legacy_id -> LinkedLegacyFilter
            linked_map = {lf.legacy_id: lf for lf in linked_legacy_filters}

            # 3. Batch-fetch all story rows at once to avoid N+1 queries.
            all_story_ids = [s[0] for s in story_ids_with_sources]
            result = await db.execute(select(Story).where(Story.id.in_(all_story_ids)))
            stories_in_db = {s.id: s for s in result.scalars().all()}

            span.set_attribute("db_stories_found", len(stories_in_db))

            # 4. Apply access rules per story.
            allowed: list[tuple[UUID, float]] = []

            for story_id, source_legacy_id, score in story_ids_with_sources:
                story = stories_in_db.get(story_id)
                if story is None:
                    # Story was not found in the database - skip it.
                    logger.debug(
                        "graph_access_filter.story_not_found",
                        extra={"story_id": str(story_id)},
                    )
                    continue

                if source_legacy_id == primary_legacy_id:
                    # Primary legacy story: apply visibility filter.
                    if _is_visible(story, visibility_filter):
                        allowed.append((story_id, score))
                    else:
                        logger.debug(
                            "graph_access_filter.primary_story_filtered",
                            extra={
                                "story_id": str(story_id),
                                "visibility": story.visibility,
                            },
                        )
                else:
                    # Cross-legacy story: apply linked-legacy access rules.
                    linked_filter = linked_map.get(source_legacy_id)
                    if linked_filter is None:
                        # Legacy is not linked to primary - drop entirely.
                        logger.debug(
                            "graph_access_filter.unlinked_legacy_story_dropped",
                            extra={
                                "story_id": str(story_id),
                                "source_legacy_id": str(source_legacy_id),
                            },
                        )
                        continue

                    if linked_filter.share_mode == "all":
                        allowed.append((story_id, score))
                    elif linked_filter.share_mode == "selective":
                        if story_id in linked_filter.story_ids:
                            allowed.append((story_id, score))
                        else:
                            logger.debug(
                                "graph_access_filter.selective_story_excluded",
                                extra={
                                    "story_id": str(story_id),
                                    "source_legacy_id": str(source_legacy_id),
                                },
                            )

            logger.info(
                "graph_access_filter.filter_complete",
                extra={
                    "user_id": str(user_id),
                    "primary_legacy_id": str(primary_legacy_id),
                    "input_count": len(story_ids_with_sources),
                    "output_count": len(allowed),
                },
            )
            span.set_attribute("output_count", len(allowed))

            return allowed


def _is_visible(story: Story, visibility_filter: VisibilityFilter) -> bool:
    """Check whether a story satisfies the given visibility filter.

    For 'personal' visibility the story must also be authored by the requesting
    user (personal_author_id on the filter).

    Args:
        story: The Story ORM object.
        visibility_filter: The resolved visibility permissions for the user.

    Returns:
        True if the story should be surfaced to the user.
    """
    if story.visibility not in visibility_filter.allowed_visibilities:
        return False

    if story.visibility == "personal":
        return story.author_id == visibility_filter.personal_author_id

    return True
