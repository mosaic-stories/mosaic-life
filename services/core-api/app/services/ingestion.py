"""Service for indexing story content into vector store."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from opentelemetry import trace
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.knowledge import KnowledgeAuditLog
from ..providers.registry import get_provider_registry
from .chunking import chunk_story

if TYPE_CHECKING:
    from ..adapters.graph_adapter import GraphAdapter
    from .entity_extraction import ExtractedEntities

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

        # Wrap entire operation in a transaction for atomicity
        # If embedding or storage fails, delete is rolled back
        async with db.begin_nested():
            vector_store = get_provider_registry().get_vector_store()

            # 1. Delete existing chunks (for reindexing)
            old_count = await vector_store.delete_chunks_for_story(
                db=db, story_id=story_id
            )
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
            embedding_provider = get_provider_registry().get_embedding_provider()
            embeddings = await embedding_provider.embed_texts(chunks)

            # 4. Store chunks with embeddings
            chunks_with_embeddings = list(zip(chunks, embeddings))
            chunk_count = await vector_store.store_chunks(
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

        # Commit the entire transaction
        await db.commit()

        logger.info(
            f"ingestion.{action}",
            extra={
                "story_id": str(story_id),
                "chunk_count": chunk_count,
                "old_chunk_count": old_count,
            },
        )

        # 6. Best-effort entity extraction for graph database
        try:
            settings = get_settings()
            if settings.graph_augmentation_enabled:
                registry = get_provider_registry()
                graph_adapter = registry.get_graph_adapter()
                if graph_adapter:
                    from .entity_extraction import EntityExtractionService

                    llm_provider = registry.get_llm_provider()
                    extraction_service = EntityExtractionService(
                        llm_provider=llm_provider,
                        model_id=settings.entity_extraction_model_id,
                    )
                    entities = await extraction_service.extract_entities(content)
                    filtered = entities.filter_by_confidence(0.7)

                    # Sync extracted entities to graph
                    await _sync_entities_to_graph(
                        graph_adapter, story_id, legacy_id, filtered
                    )
        except Exception as exc:
            # Entity extraction is best-effort — never block ingestion
            logger.warning(
                "ingestion.entity_extraction_failed",
                extra={"story_id": str(story_id), "error": str(exc)},
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


async def _sync_entities_to_graph(
    graph_adapter: GraphAdapter,
    story_id: UUID,
    legacy_id: UUID,
    entities: ExtractedEntities,
) -> None:
    """Sync extracted entities to the graph database."""
    sid = str(story_id)

    for place in entities.places:
        place_id = f"place-{place.name.lower().replace(' ', '-')}-{legacy_id}"
        await graph_adapter.upsert_node(
            "Place",
            place_id,
            {"name": place.name, "type": place.type, "location": place.location},
        )
        await graph_adapter.create_relationship(
            "Story",
            sid,
            "TOOK_PLACE_AT",
            "Place",
            place_id,
        )

    for event in entities.events:
        event_id = f"event-{event.name.lower().replace(' ', '-')}-{legacy_id}"
        await graph_adapter.upsert_node(
            "Event",
            event_id,
            {"name": event.name, "type": event.type, "date": event.date},
        )
        await graph_adapter.create_relationship(
            "Story",
            sid,
            "REFERENCES",
            "Event",
            event_id,
        )

    for obj in entities.objects:
        obj_id = f"object-{obj.name.lower().replace(' ', '-')}-{legacy_id}"
        await graph_adapter.upsert_node(
            "Object",
            obj_id,
            {"name": obj.name, "type": obj.type, "description": obj.context},
        )
        await graph_adapter.create_relationship(
            "Story",
            sid,
            "REFERENCES",
            "Object",
            obj_id,
        )

    logger.info(
        "ingestion.entities_synced",
        extra={
            "story_id": str(story_id),
            "places": len(entities.places),
            "events": len(entities.events),
            "objects": len(entities.objects),
        },
    )
