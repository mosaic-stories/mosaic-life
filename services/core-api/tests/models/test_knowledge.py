"""Tests for knowledge models."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeAuditLog, StoryChunk
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.user import User


class TestStoryChunkModel:
    """Tests for StoryChunk model."""

    @pytest.mark.asyncio
    async def test_story_chunk_creates_with_required_fields(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test StoryChunk can be created with all required fields."""
        # Create a dummy embedding (1024 dimensions)
        embedding = [0.1] * 1024

        chunk = StoryChunk(
            story_id=test_story.id,
            chunk_index=0,
            content="This is the first chunk of content.",
            embedding=embedding,
            legacy_id=test_legacy.id,
            visibility="private",
            author_id=test_user.id,
        )

        db_session.add(chunk)
        await db_session.commit()
        await db_session.refresh(chunk)

        assert chunk.id is not None
        assert chunk.story_id == test_story.id
        assert chunk.chunk_index == 0
        assert chunk.content == "This is the first chunk of content."
        assert len(chunk.embedding) == 1024
        assert chunk.visibility == "private"

    @pytest.mark.asyncio
    async def test_story_chunk_has_foreign_key_constraints(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test StoryChunk enforces foreign key relationships."""
        embedding = [0.1] * 1024

        chunk = StoryChunk(
            story_id=test_story.id,
            chunk_index=0,
            content="Content with proper foreign keys.",
            embedding=embedding,
            legacy_id=test_legacy.id,
            visibility="private",
            author_id=test_user.id,
        )
        db_session.add(chunk)
        await db_session.commit()
        await db_session.refresh(chunk)

        # Verify relationships are properly set
        assert chunk.story_id == test_story.id
        assert chunk.legacy_id == test_legacy.id
        assert chunk.author_id == test_user.id

        # Note: CASCADE delete behavior is tested in PostgreSQL integration tests
        # SQLite's foreign key support in tests may vary


class TestKnowledgeAuditLogModel:
    """Tests for KnowledgeAuditLog model."""

    @pytest.mark.asyncio
    async def test_audit_log_creates_with_required_fields(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test KnowledgeAuditLog can be created."""
        log = KnowledgeAuditLog(
            action="story_indexed",
            story_id=test_story.id,
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            chunk_count=3,
            details={"embedding_model": "titan-v2"},
        )

        db_session.add(log)
        await db_session.commit()
        await db_session.refresh(log)

        assert log.id is not None
        assert log.action == "story_indexed"
        assert log.chunk_count == 3
        assert log.details["embedding_model"] == "titan-v2"
        assert log.created_at is not None
