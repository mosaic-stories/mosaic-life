"""Tests for ingestion service."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.story import Story
from app.models.user import User
from app.services.ingestion import index_story_chunks, log_deletion_audit
from app.services.retrieval import count_chunks_for_story


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
        with patch("app.services.ingestion.get_bedrock_adapter") as mock_bedrock:
            mock_adapter = AsyncMock()
            mock_adapter.embed_texts = AsyncMock(
                return_value=[[0.1] * 1024]  # One chunk
            )
            mock_bedrock.return_value = mock_adapter

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
        with patch("app.services.ingestion.get_bedrock_adapter") as mock_bedrock:
            mock_adapter = AsyncMock()
            mock_adapter.embed_texts = AsyncMock(return_value=[[0.1] * 1024])
            mock_bedrock.return_value = mock_adapter

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
        with patch("app.services.ingestion.get_bedrock_adapter") as mock_bedrock:
            mock_adapter = AsyncMock()
            mock_bedrock.return_value = mock_adapter

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

        with patch("app.services.ingestion.get_bedrock_adapter") as mock_bedrock:
            mock_adapter = AsyncMock()
            mock_adapter.embed_texts = AsyncMock(return_value=[[0.1] * 1024])
            mock_bedrock.return_value = mock_adapter

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
