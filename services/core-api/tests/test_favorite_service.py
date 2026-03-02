"""Tests for favorite service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.media import Media
from app.models.story import Story
from app.models.user import User
from app.services import favorite as favorite_service


class TestToggleFavorite:
    """Tests for toggle_favorite."""

    @pytest.mark.asyncio
    async def test_favorite_story(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        """Favoriting a story creates a record and increments count."""
        result = await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )

        assert result["favorited"] is True
        assert result["favorite_count"] == 1

    @pytest.mark.asyncio
    async def test_unfavorite_story(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        """Toggling again removes the favorite and decrements count."""
        # First toggle: favorite
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )
        # Second toggle: unfavorite
        result = await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )

        assert result["favorited"] is False
        assert result["favorite_count"] == 0

    @pytest.mark.asyncio
    async def test_favorite_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Favoriting a legacy works."""
        result = await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="legacy",
            entity_id=test_legacy.id,
        )

        assert result["favorited"] is True
        assert result["favorite_count"] == 1

    @pytest.mark.asyncio
    async def test_favorite_media(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_media: Media,
    ):
        """Favoriting a media item works."""
        result = await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="media",
            entity_id=test_media.id,
        )

        assert result["favorited"] is True
        assert result["favorite_count"] == 1

    @pytest.mark.asyncio
    async def test_favorite_nonexistent_entity(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Favoriting a nonexistent entity raises 404."""
        from uuid import uuid4

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await favorite_service.toggle_favorite(
                db=db_session,
                user_id=test_user.id,
                entity_type="story",
                entity_id=uuid4(),
            )
        assert exc_info.value.status_code == 404


class TestBatchCheckFavorites:
    """Tests for batch_check_favorites."""

    @pytest.mark.asyncio
    async def test_batch_check(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_story_public: Story,
    ):
        """Batch check returns correct favorited status."""
        # Favorite one story
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )

        result = await favorite_service.batch_check_favorites(
            db=db_session,
            user_id=test_user.id,
            entity_ids=[test_story.id, test_story_public.id],
        )

        assert result[str(test_story.id)] is True
        assert result[str(test_story_public.id)] is False

    @pytest.mark.asyncio
    async def test_batch_check_empty(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Batch check with empty list returns empty dict."""
        result = await favorite_service.batch_check_favorites(
            db=db_session,
            user_id=test_user.id,
            entity_ids=[],
        )

        assert result == {}


class TestListFavorites:
    """Tests for list_favorites."""

    @pytest.mark.asyncio
    async def test_list_all_favorites(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ):
        """List returns all user favorites with entity metadata."""
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="legacy",
            entity_id=test_legacy.id,
        )

        result = await favorite_service.list_favorites(
            db=db_session,
            user_id=test_user.id,
        )

        assert result["total"] == 2
        assert len(result["items"]) == 2

    @pytest.mark.asyncio
    async def test_list_favorites_filtered_by_type(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ):
        """List filtered by entity_type returns only matching favorites."""
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
            entity_id=test_story.id,
        )
        await favorite_service.toggle_favorite(
            db=db_session,
            user_id=test_user.id,
            entity_type="legacy",
            entity_id=test_legacy.id,
        )

        result = await favorite_service.list_favorites(
            db=db_session,
            user_id=test_user.id,
            entity_type="story",
        )

        assert result["total"] == 1
        assert result["items"][0]["entity_type"] == "story"
