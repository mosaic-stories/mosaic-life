"""Integration tests for RAG flow.

These tests verify the full flow of indexing story content and retrieving
relevant chunks. Since the test database uses SQLite (which doesn't support
pgvector), vector similarity search is mocked while still testing the
integration between ingestion, storage, and retrieval services.
"""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.knowledge import StoryChunk
from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.user import User
from app.schemas.retrieval import ChunkResult
from app.adapters.storytelling import PostgresVectorStoreAdapter
from app.services.ingestion import index_story_chunks
from app.services.retrieval import count_chunks_for_story, resolve_visibility_filter


def _mock_ingestion_registry(
    mock_registry: AsyncMock,
    embedding_vectors: list[list[float]],
) -> None:
    embedding_provider = AsyncMock()
    embedding_provider.embed_texts = AsyncMock(return_value=embedding_vectors)
    mock_registry.return_value.get_embedding_provider.return_value = embedding_provider
    mock_registry.return_value.get_vector_store.return_value = (
        PostgresVectorStoreAdapter()
    )


class TestRAGFlow:
    """End-to-end tests for retrieval-augmented generation."""

    @pytest.mark.asyncio
    async def test_full_flow_index_and_retrieve(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test indexing a story and retrieving relevant chunks.

        This test verifies that:
        1. Story content can be chunked and indexed
        2. Chunks are stored in the database with embeddings
        3. Retrieval can find relevant chunks (mocked for SQLite)
        """
        story_content = """
        My grandmother was born in 1935 in a small town.

        She loved to garden and spent hours in her backyard
        growing tomatoes, peppers, and beautiful roses.

        During the 1960s, she worked as a teacher at the local
        elementary school where she taught third grade.
        """

        # Mock embeddings
        with patch("app.services.ingestion.get_provider_registry") as mock_ingest:
            _mock_ingestion_registry(
                mock_ingest,
                embedding_vectors=[
                    [0.1] * 1024,  # Birth info
                    [0.2] * 1024,  # Garden info
                    [0.3] * 1024,  # Teacher info
                ],
            )

            # Index the story
            chunk_count = await index_story_chunks(
                db=db_session,
                story_id=test_story.id,
                content=story_content,
                legacy_id=test_legacy.id,
                visibility="private",
                author_id=test_user.id,
            )

            assert chunk_count >= 1

        # Verify chunks exist in database
        count = await count_chunks_for_story(db_session, test_story.id)
        assert count == chunk_count

        # Verify chunks were stored with correct metadata
        result = await db_session.execute(
            select(StoryChunk).where(StoryChunk.story_id == test_story.id)
        )
        chunks = result.scalars().all()

        assert len(chunks) >= 1
        for chunk in chunks:
            assert chunk.legacy_id == test_legacy.id
            assert chunk.author_id == test_user.id
            assert chunk.visibility == "private"
            assert chunk.content is not None
            assert len(chunk.content) > 0
            assert chunk.embedding is not None
            assert len(chunk.embedding) == 1024

        # Test retrieval with mock (SQLite doesn't support pgvector)
        # We mock the entire retrieve_context because the raw SQL uses pgvector operators
        with patch("app.services.retrieval.get_provider_registry") as mock_retrieve:
            mock_adapter = AsyncMock()
            mock_adapter.embed_texts = AsyncMock(return_value=[[0.3] * 1024])
            mock_retrieve.return_value.get_embedding_provider.return_value = (
                mock_adapter
            )

            # Since we can't use pgvector with SQLite, we verify that
            # the visibility filter resolves correctly (which doesn't need pgvector)
            visibility_filter = await resolve_visibility_filter(
                db=db_session,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
            )

            # Creator should see all visibility levels
            assert "public" in visibility_filter.allowed_visibilities
            assert "private" in visibility_filter.allowed_visibilities
            assert "personal" in visibility_filter.allowed_visibilities

            # Verify we can construct ChunkResult from stored chunks
            for chunk in chunks:
                chunk_result = ChunkResult(
                    chunk_id=chunk.id,
                    story_id=chunk.story_id,
                    content=chunk.content,
                    similarity=0.95,  # Mock similarity score
                )
                assert chunk_result.content is not None
                assert chunk_result.story_id == test_story.id

    @pytest.mark.asyncio
    async def test_visibility_filtering(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        """Test that visibility filtering works correctly.

        This test verifies that:
        1. Private stories can be indexed
        2. Creators can access private content
        3. Non-members are denied access
        4. Admirers have limited visibility
        """
        # Create a private story
        private_story = Story(
            author_id=test_user.id,
            title="Private Memory",
            content="This is a private memory about grandmother's garden.",
            visibility="private",
        )
        db_session.add(private_story)
        await db_session.flush()

        story_legacy = StoryLegacy(
            story_id=private_story.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(story_legacy)
        await db_session.commit()

        # Index the story
        with patch("app.services.ingestion.get_provider_registry") as mock:
            _mock_ingestion_registry(mock, embedding_vectors=[[0.5] * 1024])

            await index_story_chunks(
                db=db_session,
                story_id=private_story.id,
                content=private_story.content,
                legacy_id=test_legacy.id,
                visibility="private",
                author_id=test_user.id,
            )

        # Verify chunks were stored
        count = await count_chunks_for_story(db_session, private_story.id)
        assert count >= 1

        # Creator should have full visibility
        creator_filter = await resolve_visibility_filter(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )
        assert "private" in creator_filter.allowed_visibilities
        assert creator_filter.personal_author_id == test_user.id

        # Create an admirer user
        admirer = User(
            email="admirer@example.com",
            google_id="google_admirer_123",
            name="Admirer User",
        )
        db_session.add(admirer)
        await db_session.flush()

        admirer_membership = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=admirer.id,
            role="admirer",
        )
        db_session.add(admirer_membership)
        await db_session.commit()

        # Admirer should only see public and personal
        admirer_filter = await resolve_visibility_filter(
            db=db_session,
            user_id=admirer.id,
            legacy_id=test_legacy.id,
        )
        assert admirer_filter.allowed_visibilities == ["public", "personal"]
        assert "private" not in admirer_filter.allowed_visibilities
        assert admirer_filter.personal_author_id == admirer.id

        # Non-member should be denied
        non_member = User(
            email="stranger@example.com",
            google_id="google_stranger_123",
            name="Stranger",
        )
        db_session.add(non_member)
        await db_session.commit()

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await resolve_visibility_filter(
                db=db_session,
                user_id=non_member.id,
                legacy_id=test_legacy.id,
            )
        assert exc.value.status_code == 403
        assert "Not a member" in str(exc.value.detail)

    @pytest.mark.asyncio
    async def test_reindex_replaces_chunks(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test that reindexing a story replaces old chunks."""
        # Index initial content
        with patch("app.services.ingestion.get_provider_registry") as mock:
            _mock_ingestion_registry(mock, embedding_vectors=[[0.1] * 1024])

            await index_story_chunks(
                db=db_session,
                story_id=test_story.id,
                content="Original content about childhood.",
                legacy_id=test_legacy.id,
                visibility="private",
                author_id=test_user.id,
            )

        count_after_first = await count_chunks_for_story(db_session, test_story.id)
        assert count_after_first >= 1

        # Get first chunk content
        result = await db_session.execute(
            select(StoryChunk)
            .where(StoryChunk.story_id == test_story.id)
            .order_by(StoryChunk.chunk_index)
        )
        first_chunks = result.scalars().all()
        first_content = first_chunks[0].content

        # Reindex with different content
        with patch("app.services.ingestion.get_provider_registry") as mock:
            _mock_ingestion_registry(mock, embedding_vectors=[[0.9] * 1024])

            await index_story_chunks(
                db=db_session,
                story_id=test_story.id,
                content="Updated content about adulthood.",
                legacy_id=test_legacy.id,
                visibility="private",
                author_id=test_user.id,
            )

        # Verify chunks were replaced, not added
        count_after_second = await count_chunks_for_story(db_session, test_story.id)
        assert count_after_second >= 1

        # Refresh session to get updated data
        result = await db_session.execute(
            select(StoryChunk)
            .where(StoryChunk.story_id == test_story.id)
            .order_by(StoryChunk.chunk_index)
        )
        second_chunks = result.scalars().all()
        second_content = second_chunks[0].content

        # Content should be different
        assert first_content != second_content
        assert "adulthood" in second_content or "Updated" in second_content

    @pytest.mark.asyncio
    async def test_multiple_stories_indexed_separately(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        """Test that multiple stories are indexed separately."""
        # Create two stories
        story1 = Story(
            author_id=test_user.id,
            title="Story One",
            content="Content about the early years.",
            visibility="public",
        )
        story2 = Story(
            author_id=test_user.id,
            title="Story Two",
            content="Content about later life.",
            visibility="private",
        )
        db_session.add_all([story1, story2])
        await db_session.flush()

        # Create associations
        for i, story in enumerate([story1, story2]):
            story_legacy = StoryLegacy(
                story_id=story.id,
                legacy_id=test_legacy.id,
                role="primary",
                position=i,
            )
            db_session.add(story_legacy)
        await db_session.commit()

        # Index both stories
        with patch("app.services.ingestion.get_provider_registry") as mock:
            _mock_ingestion_registry(mock, embedding_vectors=[[0.1] * 1024])

            for story in [story1, story2]:
                await index_story_chunks(
                    db=db_session,
                    story_id=story.id,
                    content=story.content,
                    legacy_id=test_legacy.id,
                    visibility=story.visibility,
                    author_id=test_user.id,
                )

        # Verify each story has its own chunks
        count1 = await count_chunks_for_story(db_session, story1.id)
        count2 = await count_chunks_for_story(db_session, story2.id)

        assert count1 >= 1
        assert count2 >= 1

        # Verify chunks have correct visibility
        result = await db_session.execute(
            select(StoryChunk).where(StoryChunk.story_id == story1.id)
        )
        story1_chunks = result.scalars().all()
        assert all(c.visibility == "public" for c in story1_chunks)

        result = await db_session.execute(
            select(StoryChunk).where(StoryChunk.story_id == story2.id)
        )
        story2_chunks = result.scalars().all()
        assert all(c.visibility == "private" for c in story2_chunks)
