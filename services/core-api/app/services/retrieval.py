"""Service for permission-filtered knowledge retrieval."""

import logging
import time
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.knowledge import StoryChunk
from ..models.legacy import LegacyMember
from ..models.legacy_link import LegacyLink, LegacyLinkShare
from ..observability.metrics import AI_RETRIEVAL_DURATION
from ..providers.registry import get_provider_registry
from ..schemas.retrieval import ChunkResult, LinkedLegacyFilter, VisibilityFilter

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.retrieval")

# Roles that can see private content
PRIVATE_ACCESS_ROLES = {"creator", "admin", "advocate"}


async def resolve_visibility_filter(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> VisibilityFilter:
    """Determine what visibility levels a user can access.

    Args:
        db: Database session.
        user_id: User requesting access.
        legacy_id: Legacy to check access for.

    Returns:
        VisibilityFilter with allowed visibilities.

    Raises:
        HTTPException: 403 if user is not a member of the legacy.
    """
    with tracer.start_as_current_span("retrieval.resolve_visibility") as span:
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("legacy_id", str(legacy_id))

        # Get user's membership
        result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == user_id,
                LegacyMember.role != "pending",
            )
        )
        membership = result.scalar_one_or_none()

        if not membership:
            logger.warning(
                "retrieval.access_denied",
                extra={"user_id": str(user_id), "legacy_id": str(legacy_id)},
            )
            raise HTTPException(
                status_code=403,
                detail="Not a member of this legacy",
            )

        role = membership.role
        span.set_attribute("role", role)

        # Determine allowed visibilities based on role
        if role in PRIVATE_ACCESS_ROLES:
            allowed = ["public", "private", "personal"]
        else:
            # Admirers can see public + their own personal
            allowed = ["public", "personal"]

        logger.debug(
            "retrieval.visibility_resolved",
            extra={
                "user_id": str(user_id),
                "legacy_id": str(legacy_id),
                "role": role,
                "allowed_visibilities": allowed,
            },
        )

        return VisibilityFilter(
            allowed_visibilities=allowed,
            personal_author_id=user_id,
        )


async def store_chunks(
    db: AsyncSession,
    story_id: UUID,
    chunks: list[tuple[str, list[float]]],
    legacy_id: UUID,
    visibility: str,
    author_id: UUID,
) -> int:
    """Store story chunks with embeddings.

    Args:
        db: Database session.
        story_id: Story the chunks belong to.
        chunks: List of (content, embedding) tuples.
        legacy_id: Legacy the story belongs to.
        visibility: Story visibility level.
        author_id: Story author ID.

    Returns:
        Number of chunks stored.
    """
    started = time.perf_counter()
    with tracer.start_as_current_span("retrieval.store_chunks") as span:
        span.set_attribute("story_id", str(story_id))
        span.set_attribute("chunk_count", len(chunks))

        for index, (content, embedding) in enumerate(chunks):
            chunk = StoryChunk(
                story_id=story_id,
                chunk_index=index,
                content=content,
                embedding=embedding,
                legacy_id=legacy_id,
                visibility=visibility,
                author_id=author_id,
            )
            db.add(chunk)

        await db.flush()

        logger.info(
            "retrieval.chunks_stored",
            extra={
                "story_id": str(story_id),
                "chunk_count": len(chunks),
            },
        )

        AI_RETRIEVAL_DURATION.labels(operation="store_chunks").observe(
            time.perf_counter() - started
        )
        return len(chunks)


async def delete_chunks_for_story(db: AsyncSession, story_id: UUID) -> int:
    """Delete all chunks for a story.

    Args:
        db: Database session.
        story_id: Story to delete chunks for.

    Returns:
        Number of chunks deleted.
    """
    started = time.perf_counter()
    with tracer.start_as_current_span("retrieval.delete_chunks") as span:
        span.set_attribute("story_id", str(story_id))

        result: Result[Any] = await db.execute(
            delete(StoryChunk).where(StoryChunk.story_id == story_id)
        )
        await db.flush()

        deleted = getattr(result, "rowcount", 0) or 0
        span.set_attribute("deleted_count", deleted)

        logger.info(
            "retrieval.chunks_deleted",
            extra={"story_id": str(story_id), "deleted_count": deleted},
        )

        AI_RETRIEVAL_DURATION.labels(operation="delete_chunks").observe(
            time.perf_counter() - started
        )
        return deleted


async def count_chunks_for_story(db: AsyncSession, story_id: UUID) -> int:
    """Count chunks for a story.

    Args:
        db: Database session.
        story_id: Story to count chunks for.

    Returns:
        Number of chunks.
    """
    result = await db.execute(
        select(func.count())
        .select_from(StoryChunk)
        .where(StoryChunk.story_id == story_id)
    )
    return result.scalar() or 0


async def get_linked_legacy_filters(
    db: AsyncSession,
    legacy_id: UUID,
) -> list[LinkedLegacyFilter]:
    """Return filters describing which chunks from linked legacies to include.

    For each active link involving ``legacy_id`` this function determines:

    - ``all`` share mode   → include all public/private chunks from that legacy.
    - ``selective`` mode   → include only the specifically shared story IDs.

    The function is intentionally free of vector/pgvector logic so it can be
    tested against the in-memory SQLite engine used in the test suite.

    Args:
        db: Database session.
        legacy_id: The primary legacy whose links should be resolved.

    Returns:
        List of :class:`LinkedLegacyFilter` objects, one per active linked legacy.
    """
    # Find active links where this legacy is either the requester or target
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

    if not links:
        return []

    filters: list[LinkedLegacyFilter] = []

    for link in links:
        # Determine which side is "ours" and which is the linked legacy
        if link.requester_legacy_id == legacy_id:
            linked_legacy_id = link.target_legacy_id
            # The target's share mode governs what the target shares with us
            share_mode = link.target_share_mode
        else:
            linked_legacy_id = link.requester_legacy_id
            # The requester's share mode governs what the requester shares with us
            share_mode = link.requester_share_mode

        if share_mode == "all":
            filters.append(
                LinkedLegacyFilter(
                    legacy_id=linked_legacy_id,
                    share_mode="all",
                    story_ids=[],
                )
            )
        else:
            # selective: collect the story IDs explicitly shared by the linked legacy
            shares_result = await db.execute(
                select(LegacyLinkShare).where(
                    LegacyLinkShare.legacy_link_id == link.id,
                    LegacyLinkShare.source_legacy_id == linked_legacy_id,
                    LegacyLinkShare.resource_type == "story",
                )
            )
            shares = shares_result.scalars().all()
            story_ids = [share.resource_id for share in shares]

            # Only add a filter entry if there are shared stories to include
            if story_ids:
                filters.append(
                    LinkedLegacyFilter(
                        legacy_id=linked_legacy_id,
                        share_mode="selective",
                        story_ids=story_ids,
                    )
                )

    return filters


async def retrieve_context(
    db: AsyncSession,
    query: str,
    legacy_id: UUID,
    user_id: UUID,
    top_k: int = 5,
) -> list[ChunkResult]:
    """Retrieve relevant story chunks with permission filtering.

    Args:
        db: Database session.
        query: User's question to find relevant content for.
        legacy_id: Legacy to search within.
        user_id: User making the request.
        top_k: Maximum number of results.

    Returns:
        List of relevant chunks the user is authorized to see.
    """
    started = time.perf_counter()
    with tracer.start_as_current_span("retrieval.retrieve_context") as span:
        span.set_attribute("legacy_id", str(legacy_id))
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("top_k", top_k)

        # 1. Resolve permissions
        visibility_filter = await resolve_visibility_filter(db, user_id, legacy_id)

        # 2. Embed the query
        embedding_provider = get_provider_registry().get_embedding_provider()
        [query_embedding] = await embedding_provider.embed_texts([query])

        span.set_attribute("query_embedded", True)

        # 3. Build and execute vector search query
        # Using raw SQL for pgvector similarity search
        # Format embedding as pgvector string format: '[1,2,3]'
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

        # Filter out 'personal' from public visibilities since it's handled separately
        public_visibilities = [
            v for v in visibility_filter.allowed_visibilities if v != "personal"
        ]

        # Build IN clause dynamically for public visibilities
        if public_visibilities:
            visibility_placeholders = ", ".join(
                f":vis_{i}" for i in range(len(public_visibilities))
            )
            visibility_condition = f"visibility IN ({visibility_placeholders})"
        else:
            # No public visibilities, only match personal condition
            visibility_condition = "FALSE"

        query_sql = text(f"""
            SELECT
                id,
                story_id,
                content,
                1 - (embedding <=> (:query_embedding)::vector) AS similarity
            FROM story_chunks
            WHERE
                legacy_id = :legacy_id
                AND (
                    {visibility_condition}
                    OR (visibility = 'personal' AND author_id = :author_id)
                )
            ORDER BY embedding <=> (:query_embedding)::vector
            LIMIT :top_k
        """)

        # Build parameter dict with visibility values
        params: dict[str, Any] = {
            "query_embedding": embedding_str,
            "legacy_id": str(legacy_id),
            "author_id": str(visibility_filter.personal_author_id),
            "top_k": top_k,
        }
        for i, vis in enumerate(public_visibilities):
            params[f"vis_{i}"] = vis

        result = await db.execute(query_sql, params)
        rows = result.fetchall()

        primary_chunks = [
            ChunkResult(
                chunk_id=row.id,
                story_id=row.story_id,
                content=row.content,
                similarity=float(row.similarity),
            )
            for row in rows
        ]

        # 4. Retrieve chunks from linked legacies
        linked_filters = await get_linked_legacy_filters(db, legacy_id)
        span.set_attribute("linked_legacy_count", len(linked_filters))

        linked_chunks: list[ChunkResult] = []
        for lf in linked_filters:
            if lf.share_mode == "all":
                # Include all public/private chunks from the linked legacy
                linked_sql = text("""
                    SELECT
                        id,
                        story_id,
                        content,
                        1 - (embedding <=> (:query_embedding)::vector) AS similarity
                    FROM story_chunks
                    WHERE
                        legacy_id = :linked_legacy_id
                        AND visibility IN ('public', 'private')
                    ORDER BY embedding <=> (:query_embedding)::vector
                    LIMIT :top_k
                """)
                linked_result = await db.execute(
                    linked_sql,
                    {
                        "query_embedding": embedding_str,
                        "linked_legacy_id": str(lf.legacy_id),
                        "top_k": top_k,
                    },
                )
            else:
                # selective: only include explicitly shared stories
                story_id_strs = [str(sid) for sid in lf.story_ids]
                story_id_list = ", ".join(f"'{sid}'" for sid in story_id_strs)
                linked_sql = text(f"""
                    SELECT
                        id,
                        story_id,
                        content,
                        1 - (embedding <=> (:query_embedding)::vector) AS similarity
                    FROM story_chunks
                    WHERE
                        legacy_id = :linked_legacy_id
                        AND story_id IN ({story_id_list})
                        AND visibility IN ('public', 'private')
                    ORDER BY embedding <=> (:query_embedding)::vector
                    LIMIT :top_k
                """)
                linked_result = await db.execute(
                    linked_sql,
                    {
                        "query_embedding": embedding_str,
                        "linked_legacy_id": str(lf.legacy_id),
                        "top_k": top_k,
                    },
                )

            linked_rows = linked_result.fetchall()
            linked_chunks.extend(
                ChunkResult(
                    chunk_id=row.id,
                    story_id=row.story_id,
                    content=row.content,
                    similarity=float(row.similarity),
                )
                for row in linked_rows
            )

        # 5. Merge primary + linked results, re-rank by similarity, return top-k
        all_chunks = primary_chunks + linked_chunks
        all_chunks.sort(key=lambda c: c.similarity, reverse=True)
        chunks = all_chunks[:top_k]

        span.set_attribute("results_count", len(chunks))

        logger.info(
            "retrieval.context_retrieved",
            extra={
                "legacy_id": str(legacy_id),
                "user_id": str(user_id),
                "query_length": len(query),
                "results_count": len(chunks),
                "linked_legacy_count": len(linked_filters),
            },
        )

        AI_RETRIEVAL_DURATION.labels(operation="retrieve_context").observe(
            time.perf_counter() - started
        )
        return chunks
