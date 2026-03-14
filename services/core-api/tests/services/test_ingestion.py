"""Tests for ingestion service."""

from contextlib import contextmanager
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.storytelling import PostgresVectorStoreAdapter
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.user import User
from app.services.entity_extraction import ExtractedEntities, ExtractedEntity
from app.services.ingestion import (
    _sync_entities_to_graph,
    index_story_chunks,
    log_deletion_audit,
)
from app.services.retrieval import count_chunks_for_story


def _mock_ingestion_registry(
    mock_registry: AsyncMock,
    embedding_vectors: list[list[float]] | None = None,
) -> AsyncMock:
    embedding_provider = AsyncMock()
    if embedding_vectors is not None:
        embedding_provider.embed_texts = AsyncMock(return_value=embedding_vectors)
    mock_registry.return_value.get_embedding_provider.return_value = embedding_provider
    mock_registry.return_value.get_vector_store.return_value = (
        PostgresVectorStoreAdapter()
    )
    return embedding_provider


class TestIndexStoryChunks:
    """Tests for story indexing."""

    @pytest.mark.asyncio
    async def test_index_story_creates_chunks(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test indexing a story creates chunks."""
        # Mock the embedding call
        with patch("app.services.ingestion.get_provider_registry") as mock_registry:
            _mock_ingestion_registry(
                mock_registry,
                embedding_vectors=[[0.1] * 1024],  # One chunk
            )

            chunk_count = await index_story_chunks(
                db=db_session,
                story_id=test_story.id,
                content="Short story content.",
                legacy_id=test_legacy.id,
                visibility=test_story.visibility,
                author_id=test_user.id,
            )

        assert chunk_count == 1
        count = await count_chunks_for_story(db_session, test_story.id)
        assert count == 1

    @pytest.mark.asyncio
    async def test_reindex_replaces_existing_chunks(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test reindexing deletes old chunks and creates new."""
        with patch("app.services.ingestion.get_provider_registry") as mock_registry:
            mock_adapter = _mock_ingestion_registry(
                mock_registry,
                embedding_vectors=[[0.1] * 1024],
            )

            # Index first time
            count1 = await index_story_chunks(
                db=db_session,
                story_id=test_story.id,
                content="Original content.",
                legacy_id=test_legacy.id,
                visibility=test_story.visibility,
                author_id=test_user.id,
            )

            assert count1 == 1
            count_first = await count_chunks_for_story(db_session, test_story.id)
            assert count_first == 1

            # Reindex with longer content that will create more chunks
            # Create content long enough to be split into multiple chunks
            # Each chunk needs ~500 tokens = ~2000 chars
            long_paragraph = " ".join(["This is a sentence."] * 150)
            content_with_2_chunks = f"{long_paragraph}\n\n{long_paragraph}"

            # Mock will return embeddings for however many chunks are created
            mock_adapter.embed_texts = AsyncMock(
                side_effect=lambda texts: [
                    [0.1 * (i + 1)] * 1024 for i in range(len(texts))
                ]
            )

            count2 = await index_story_chunks(
                db=db_session,
                story_id=test_story.id,
                content=content_with_2_chunks,
                legacy_id=test_legacy.id,
                visibility=test_story.visibility,
                author_id=test_user.id,
            )

        # Should have at least 1 chunk (could be 1 or 2 depending on chunking)
        assert count2 >= 1
        count_second = await count_chunks_for_story(db_session, test_story.id)
        # Should only have new chunks, not old + new
        assert count_second == count2
        # Verify old chunks were replaced, not added to
        assert count_second >= 1

    @pytest.mark.asyncio
    async def test_empty_content_creates_no_chunks(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test empty content creates no chunks."""
        with patch("app.services.ingestion.get_provider_registry") as mock_registry:
            mock_adapter = _mock_ingestion_registry(mock_registry)

            chunk_count = await index_story_chunks(
                db=db_session,
                story_id=test_story.id,
                content="",
                legacy_id=test_legacy.id,
                visibility=test_story.visibility,
                author_id=test_user.id,
            )

            # embed_texts should not have been called
            mock_adapter.embed_texts.assert_not_called()

        assert chunk_count == 0
        count = await count_chunks_for_story(db_session, test_story.id)
        assert count == 0

    @pytest.mark.asyncio
    async def test_index_story_creates_audit_log(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test indexing creates audit log entry."""
        from sqlalchemy import select

        from app.models.knowledge import KnowledgeAuditLog

        with patch("app.services.ingestion.get_provider_registry") as mock_registry:
            _mock_ingestion_registry(
                mock_registry,
                embedding_vectors=[[0.1] * 1024],
            )

            await index_story_chunks(
                db=db_session,
                story_id=test_story.id,
                content="Test content.",
                legacy_id=test_legacy.id,
                visibility=test_story.visibility,
                author_id=test_user.id,
            )

        # Check audit log was created
        result = await db_session.execute(
            select(KnowledgeAuditLog).where(KnowledgeAuditLog.story_id == test_story.id)
        )
        audit_log = result.scalar_one_or_none()

        assert audit_log is not None
        assert audit_log.action == "story_indexed"
        assert audit_log.legacy_id == test_legacy.id
        assert audit_log.user_id == test_user.id
        assert audit_log.chunk_count == 1


class TestLogDeletionAudit:
    """Tests for deletion audit logging."""

    @pytest.mark.asyncio
    async def test_log_deletion_audit_creates_entry(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        """Test logging deletion creates audit entry."""
        from sqlalchemy import select

        from app.models.knowledge import KnowledgeAuditLog

        story_id = uuid4()

        await log_deletion_audit(
            db=db_session,
            story_id=story_id,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            chunk_count=5,
        )

        # Check audit log was created
        result = await db_session.execute(
            select(KnowledgeAuditLog).where(KnowledgeAuditLog.story_id == story_id)
        )
        audit_log = result.scalar_one_or_none()

        assert audit_log is not None
        assert audit_log.action == "story_deleted"
        assert audit_log.story_id == story_id
        assert audit_log.legacy_id == test_legacy.id
        assert audit_log.user_id == test_user.id
        assert audit_log.chunk_count == 5
        assert audit_log.details.get("deletion_source") == "user_request"


class TestSyncEntitiesToGraph:
    """Tests for graph entity syncing."""

    @pytest.mark.asyncio
    async def test_sync_entities_to_graph_clears_existing_story_relationships(
        self,
    ) -> None:
        graph_adapter = AsyncMock()
        story_id = uuid4()
        entities = ExtractedEntities(
            people=[],
            places=[ExtractedEntity(name="Chicago", type="city", location="Illinois")],
            events=[],
            objects=[],
        )

        await _sync_entities_to_graph(
            graph_adapter=graph_adapter,
            story_id=story_id,
            legacy_id=uuid4(),
            entities=entities,
        )

        graph_adapter.clear_story_entity_relationships.assert_awaited_once_with(
            str(story_id)
        )

    @pytest.mark.asyncio
    async def test_sync_entities_to_graph_counts_story_node_in_span_attributes(
        self,
    ) -> None:
        """Telemetry should include the upserted Story node in node counts."""
        graph_adapter = AsyncMock()
        span = Mock()

        @contextmanager
        def _span_context():
            yield span

        entities = ExtractedEntities(
            people=[],
            places=[
                ExtractedEntity(name="Chicago", type="city", location="Illinois"),
            ],
            events=[
                ExtractedEntity(name="Graduation", type="milestone", date="1999"),
            ],
            objects=[
                ExtractedEntity(
                    name="Watch", type="artifact", context="Gifted on retirement"
                ),
            ],
        )

        with patch(
            "app.services.ingestion.tracer.start_as_current_span",
            return_value=_span_context(),
        ):
            await _sync_entities_to_graph(
                graph_adapter=graph_adapter,
                story_id=uuid4(),
                legacy_id=uuid4(),
                entities=entities,
            )

        span.set_attribute.assert_any_call("nodes_upserted", 4)
        span.set_attribute.assert_any_call("edges_created", 3)

        span.set_attribute.assert_any_call("nodes_upserted", 4)
        span.set_attribute.assert_any_call("edges_created", 3)


class TestSyncEntitiesToGraphPersons:
    """Test person entity sync to graph."""

    @pytest.mark.asyncio
    async def test_creates_person_nodes_and_edges(self) -> None:
        """Extracted people create Person nodes and Story→Person edges."""
        graph = AsyncMock()
        story_id = uuid4()
        legacy_id = uuid4()
        author_id = uuid4()

        entities = ExtractedEntities(
            people=[
                ExtractedEntity(name="Uncle Jim", context="uncle", confidence=0.8),
                ExtractedEntity(name="Sarah", context="friend", confidence=0.95),
            ],
        )

        await _sync_entities_to_graph(
            graph,
            story_id,
            legacy_id,
            entities,
            story_title="Remembering Sarah",
            author_id=author_id,
            legacy_person_id=str(legacy_id),
        )

        # Should upsert Person nodes for both extracted people
        person_calls = [
            c for c in graph.upsert_node.call_args_list if c.args[0] == "Person"
        ]
        assert len(person_calls) == 3  # 2 extracted + 1 author

        # Should create edges
        rel_calls = [
            c
            for c in graph.create_relationship.call_args_list
            if c.args[0] == "Story" and c.args[3] == "Person"
        ]
        rel_types = [c.args[2] for c in rel_calls]
        assert "MENTIONS" in rel_types
        assert "WRITTEN_ABOUT" in rel_types
        assert "AUTHORED_BY" in rel_types

    @pytest.mark.asyncio
    async def test_infers_person_to_person_relationship(self) -> None:
        """Extraction context 'uncle' creates FAMILY_OF edge."""
        graph = AsyncMock()
        story_id = uuid4()
        legacy_id = uuid4()

        entities = ExtractedEntities(
            people=[
                ExtractedEntity(name="Uncle Jim", context="uncle", confidence=0.8),
            ],
        )

        await _sync_entities_to_graph(
            graph,
            story_id,
            legacy_id,
            entities,
            story_title="A story",
            author_id=uuid4(),
            legacy_person_id=str(legacy_id),
        )

        # Should create FAMILY_OF edge between Uncle Jim and legacy person
        p2p_calls = [
            c
            for c in graph.create_relationship.call_args_list
            if c.args[0] == "Person" and c.args[3] == "Person"
        ]
        assert len(p2p_calls) == 1
        assert p2p_calls[0].args[2] == "FAMILY_OF"
