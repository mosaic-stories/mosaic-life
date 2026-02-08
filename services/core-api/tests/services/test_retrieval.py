"""Tests for retrieval service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.user import User
from app.services.retrieval import (
    count_chunks_for_story,
    delete_chunks_for_story,
    resolve_visibility_filter,
    store_chunks,
)


class TestResolveVisibilityFilter:
    """Tests for permission resolution."""

    @pytest.mark.asyncio
    async def test_creator_sees_all_visibilities(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        """Test creator can see all visibility levels."""
        # test_user is creator via fixture
        result = await resolve_visibility_filter(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        assert "public" in result.allowed_visibilities
        assert "private" in result.allowed_visibilities
        assert "personal" in result.allowed_visibilities
        assert result.personal_author_id == test_user.id

    @pytest.mark.asyncio
    async def test_admirer_sees_public_and_personal(
        self,
        db_session: AsyncSession,
        test_legacy: Legacy,
    ) -> None:
        """Test admirer can see public stories and their own personal stories."""
        # Create admirer user
        admirer = User(
            email="admirer@example.com",
            google_id="google_admirer",
            name="Admirer User",
        )
        db_session.add(admirer)
        await db_session.flush()

        # Add as admirer
        membership = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=admirer.id,
            role="admirer",
        )
        db_session.add(membership)
        await db_session.commit()

        result = await resolve_visibility_filter(
            db=db_session,
            user_id=admirer.id,
            legacy_id=test_legacy.id,
        )

        assert result.allowed_visibilities == ["public", "personal"]
        assert result.personal_author_id == admirer.id

    @pytest.mark.asyncio
    async def test_non_member_raises_permission_error(
        self,
        db_session: AsyncSession,
        test_legacy: Legacy,
    ) -> None:
        """Test non-member cannot access legacy."""
        from fastapi import HTTPException

        non_member = User(
            email="nonmember@example.com",
            google_id="google_nonmember",
            name="Non Member",
        )
        db_session.add(non_member)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await resolve_visibility_filter(
                db=db_session,
                user_id=non_member.id,
                legacy_id=test_legacy.id,
            )

        assert exc.value.status_code == 403


class TestStoreAndDeleteChunks:
    """Tests for chunk storage operations."""

    @pytest.mark.asyncio
    async def test_store_chunks_creates_records(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test storing chunks creates database records."""
        chunks_data = [
            ("First chunk content", [0.1] * 1024),
            ("Second chunk content", [0.2] * 1024),
        ]

        await store_chunks(
            db=db_session,
            story_id=test_story.id,
            chunks=chunks_data,
            legacy_id=test_legacy.id,
            visibility=test_story.visibility,
            author_id=test_user.id,
        )

        count = await count_chunks_for_story(db_session, test_story.id)
        assert count == 2

    @pytest.mark.asyncio
    async def test_delete_chunks_removes_all(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test deleting chunks removes all for story."""
        # First store some chunks
        chunks_data = [
            ("Chunk 1", [0.1] * 1024),
            ("Chunk 2", [0.2] * 1024),
        ]
        await store_chunks(
            db=db_session,
            story_id=test_story.id,
            chunks=chunks_data,
            legacy_id=test_legacy.id,
            visibility=test_story.visibility,
            author_id=test_user.id,
        )

        # Verify they exist
        count_before = await count_chunks_for_story(db_session, test_story.id)
        assert count_before == 2

        # Delete them
        deleted = await delete_chunks_for_story(db_session, test_story.id)
        assert deleted == 2

        # Verify they're gone
        count_after = await count_chunks_for_story(db_session, test_story.id)
        assert count_after == 0
