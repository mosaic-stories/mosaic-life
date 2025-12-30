"""Service for indexing story content into vector store."""

import logging
from uuid import UUID

from opentelemetry import trace
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.bedrock import get_bedrock_adapter
from ..models.knowledge import KnowledgeAuditLog
from .chunking import chunk_story
from .retrieval import delete_chunks_for_story, store_chunks

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.ingestion")


async def index_story_chunks(
    db: AsyncSession,
    story_id: UUID,
    content: str,
    legacy_id: UUID,
    visibility: str,
    author_id: UUID,
    user_id: UUID | None = None,
) -> int:
    """Index story content by chunking, embedding, and storing.

    This is the main ingestion entry point. It:
    1. Deletes any existing chunks for the story
    2. Chunks the content
    3. Generates embeddings via Bedrock Titan
    4. Stores chunks with embeddings
    5. Logs the operation for audit

    Args:
        db: Database session.
        story_id: Story being indexed.
        content: Story content to index.
        legacy_id: Legacy the story belongs to.
        visibility: Story visibility level.
        author_id: Story author ID.
        user_id: User who triggered indexing (for audit, defaults to author).

    Returns:
        Number of chunks created.
    """
    with tracer.start_as_current_span("ingestion.index_story") as span:
        span.set_attribute("story_id", str(story_id))
        span.set_attribute("content_length", len(content))

        # 1. Delete existing chunks (for reindexing)
        old_count = await delete_chunks_for_story(db, story_id)
        span.set_attribute("old_chunk_count", old_count)

        # 2. Chunk the content
        chunks = chunk_story(content)

        if not chunks:
            logger.info(
                "ingestion.no_content",
                extra={"story_id": str(story_id)},
            )
            return 0

        span.set_attribute("new_chunk_count", len(chunks))

        # 3. Generate embeddings
        bedrock = get_bedrock_adapter()
        embeddings = await bedrock.embed_texts(chunks)

        # 4. Store chunks with embeddings
        chunks_with_embeddings = list(zip(chunks, embeddings))
        chunk_count = await store_chunks(
            db=db,
            story_id=story_id,
            chunks=chunks_with_embeddings,
            legacy_id=legacy_id,
            visibility=visibility,
            author_id=author_id,
        )

        # 5. Create audit log entry
        action = "story_reindexed" if old_count > 0 else "story_indexed"
        audit_log = KnowledgeAuditLog(
            action=action,
            story_id=story_id,
            legacy_id=legacy_id,
            user_id=user_id or author_id,
            chunk_count=chunk_count,
            details={
                "content_length": len(content),
                "old_chunk_count": old_count,
                "embedding_model": "amazon.titan-embed-text-v2:0",
            },
        )
        db.add(audit_log)
        await db.commit()

        logger.info(
            f"ingestion.{action}",
            extra={
                "story_id": str(story_id),
                "chunk_count": chunk_count,
                "old_chunk_count": old_count,
            },
        )

        return chunk_count


async def log_deletion_audit(
    db: AsyncSession,
    story_id: UUID,
    legacy_id: UUID,
    user_id: UUID,
    chunk_count: int,
) -> None:
    """Log a story deletion for audit purposes.

    Args:
        db: Database session.
        story_id: Deleted story ID.
        legacy_id: Legacy the story belonged to.
        user_id: User who deleted the story.
        chunk_count: Number of chunks that were deleted.
    """
    audit_log = KnowledgeAuditLog(
        action="story_deleted",
        story_id=story_id,
        legacy_id=legacy_id,
        user_id=user_id,
        chunk_count=chunk_count,
        details={"deletion_source": "user_request"},
    )
    db.add(audit_log)
    await db.commit()

    logger.info(
        "ingestion.story_deleted_audit",
        extra={
            "story_id": str(story_id),
            "user_id": str(user_id),
            "chunk_count": chunk_count,
        },
    )
