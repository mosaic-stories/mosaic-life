"""Service for permission-filtered knowledge retrieval."""

import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import delete, func, select, text
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.bedrock import get_bedrock_adapter
from ..models.knowledge import StoryChunk
from ..models.legacy import LegacyMember
from ..schemas.retrieval import ChunkResult, VisibilityFilter

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

        await db.commit()

        logger.info(
            "retrieval.chunks_stored",
            extra={
                "story_id": str(story_id),
                "chunk_count": len(chunks),
            },
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
    with tracer.start_as_current_span("retrieval.delete_chunks") as span:
        span.set_attribute("story_id", str(story_id))

        result: Result[Any] = await db.execute(
            delete(StoryChunk).where(StoryChunk.story_id == story_id)
        )
        await db.commit()

        deleted = getattr(result, "rowcount", 0) or 0
        span.set_attribute("deleted_count", deleted)

        logger.info(
            "retrieval.chunks_deleted",
            extra={"story_id": str(story_id), "deleted_count": deleted},
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
    with tracer.start_as_current_span("retrieval.retrieve_context") as span:
        span.set_attribute("legacy_id", str(legacy_id))
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("top_k", top_k)

        # 1. Resolve permissions
        visibility_filter = await resolve_visibility_filter(db, user_id, legacy_id)

        # 2. Embed the query
        bedrock = get_bedrock_adapter()
        [query_embedding] = await bedrock.embed_texts([query])

        span.set_attribute("query_embedded", True)

        # 3. Build and execute vector search query
        # Using raw SQL for pgvector similarity search
        query_sql = text("""
            SELECT
                id,
                story_id,
                content,
                1 - (embedding <=> :query_embedding::vector) AS similarity
            FROM story_chunks
            WHERE
                legacy_id = :legacy_id
                AND (
                    visibility IN :public_visibilities
                    OR (visibility = 'personal' AND author_id = :author_id)
                )
            ORDER BY embedding <=> :query_embedding::vector
            LIMIT :top_k
        """)

        # Filter out 'personal' from public visibilities since it's handled separately
        public_visibilities = tuple(
            v for v in visibility_filter.allowed_visibilities if v != "personal"
        )

        result = await db.execute(
            query_sql,
            {
                "query_embedding": str(query_embedding),
                "legacy_id": str(legacy_id),
                "public_visibilities": public_visibilities,
                "author_id": str(visibility_filter.personal_author_id),
                "top_k": top_k,
            },
        )

        rows = result.fetchall()

        chunks = [
            ChunkResult(
                chunk_id=row.id,
                story_id=row.story_id,
                content=row.content,
                similarity=float(row.similarity),
            )
            for row in rows
        ]

        span.set_attribute("results_count", len(chunks))

        logger.info(
            "retrieval.context_retrieved",
            extra={
                "legacy_id": str(legacy_id),
                "user_id": str(user_id),
                "query_length": len(query),
                "results_count": len(chunks),
            },
        )

        return chunks
