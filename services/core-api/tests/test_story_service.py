"""Unit tests for story service layer."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.story import Story
from app.models.user import User
from app.schemas.story import StoryCreate, StoryUpdate
from app.services import story as story_service


class TestCreateStory:
    """Tests for create_story function."""

    @pytest.mark.asyncio
    async def test_create_story_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful story creation."""
        data = StoryCreate(
            legacy_id=test_legacy.id,
            title="My First Story",
            content="# Heading\n\nThis is the story content.",
            visibility="private",
        )

        story = await story_service.create_story(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )

        assert story.title == "My First Story"
        assert story.legacy_id == test_legacy.id
        assert story.visibility == "private"

    @pytest.mark.asyncio
    async def test_create_story_requires_membership(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that creating story requires legacy membership."""
        data = StoryCreate(
            legacy_id=test_legacy.id,
            title="Unauthorized Story",
            content="Content",
            visibility="private",
        )

        with pytest.raises(HTTPException) as exc:
            await story_service.create_story(
                db=db_session,
                user_id=test_user_2.id,
                data=data,
            )
        assert exc.value.status_code == 403


class TestListLegacyStories:
    """Tests for list_legacy_stories function with visibility filtering."""

    @pytest.mark.asyncio
    async def test_member_sees_public_and_private(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story_public: Story,
        test_story_private: Story,
        test_story_personal: Story,
    ):
        """Test member sees public + private + own personal stories."""
        stories = await story_service.list_legacy_stories(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        # Should see all 3 stories (public, private, own personal)
        assert len(stories) == 3
        story_ids = {str(s.id) for s in stories}
        assert str(test_story_public.id) in story_ids
        assert str(test_story_private.id) in story_ids
        assert str(test_story_personal.id) in story_ids

    @pytest.mark.asyncio
    async def test_non_member_sees_only_public(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story_public: Story,
        test_story_private: Story,
        test_story_personal: Story,
    ):
        """Test non-member sees only public stories."""
        stories = await story_service.list_legacy_stories(
            db=db_session,
            user_id=test_user_2.id,
            legacy_id=test_legacy.id,
        )

        # Should see only public story
        assert len(stories) == 1
        assert str(stories[0].id) == str(test_story_public.id)

    @pytest.mark.asyncio
    async def test_pending_member_sees_only_public(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy_with_pending: Legacy,
    ):
        """Test pending member is treated as non-member."""
        # Create a public story
        public_story = Story(
            legacy_id=test_legacy_with_pending.id,
            author_id=test_user_2.id,
            title="Public Story",
            content="Content",
            visibility="public",
        )
        db_session.add(public_story)
        await db_session.commit()

        # Create a private story
        private_story = Story(
            legacy_id=test_legacy_with_pending.id,
            author_id=test_user_2.id,
            title="Private Story",
            content="Content",
            visibility="private",
        )
        db_session.add(private_story)
        await db_session.commit()

        # Test that pending member (test_user_2) sees only public
        stories = await story_service.list_legacy_stories(
            db=db_session,
            user_id=test_user_2.id,
            legacy_id=test_legacy_with_pending.id,
        )

        assert len(stories) == 1
        assert str(stories[0].id) == str(public_story.id)


class TestGetStoryDetail:
    """Tests for get_story_detail function."""

    @pytest.mark.asyncio
    async def test_get_public_story_as_non_member(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story_public: Story,
    ):
        """Test getting public story as non-member."""
        story = await story_service.get_story_detail(
            db=db_session,
            user_id=test_user_2.id,
            story_id=test_story_public.id,
        )

        assert story.id == test_story_public.id
        assert story.title == test_story_public.title
        assert "content" in str(story.content).lower() or story.content == test_story_public.content

    @pytest.mark.asyncio
    async def test_get_private_story_as_member(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_private: Story,
    ):
        """Test getting private story as member."""
        story = await story_service.get_story_detail(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_private.id,
        )

        assert story.id == test_story_private.id
        assert story.visibility == "private"

    @pytest.mark.asyncio
    async def test_get_private_story_as_non_member_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story_private: Story,
    ):
        """Test getting private story as non-member is denied."""
        with pytest.raises(HTTPException) as exc:
            await story_service.get_story_detail(
                db=db_session,
                user_id=test_user_2.id,
                story_id=test_story_private.id,
            )
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_get_personal_story_as_author(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_personal: Story,
    ):
        """Test author can view their personal story."""
        story = await story_service.get_story_detail(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_personal.id,
        )

        assert story.id == test_story_personal.id
        assert story.visibility == "personal"

    @pytest.mark.asyncio
    async def test_get_personal_story_by_others_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story_personal: Story,
    ):
        """Test personal story cannot be viewed by others."""
        with pytest.raises(HTTPException) as exc:
            await story_service.get_story_detail(
                db=db_session,
                user_id=test_user_2.id,
                story_id=test_story_personal.id,
            )
        assert exc.value.status_code == 403


class TestUpdateStory:
    """Tests for update_story function."""

    @pytest.mark.asyncio
    async def test_update_story_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_public: Story,
    ):
        """Test successful story update by author."""
        data = StoryUpdate(
            title="Updated Title",
            content="Updated content",
            visibility="private",
        )

        story = await story_service.update_story(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_public.id,
            data=data,
        )

        assert story.title == "Updated Title"
        assert story.visibility == "private"

    @pytest.mark.asyncio
    async def test_update_story_only_author(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story_public: Story,
    ):
        """Test that only author can update story."""
        data = StoryUpdate(title="Unauthorized Update")

        with pytest.raises(HTTPException) as exc:
            await story_service.update_story(
                db=db_session,
                user_id=test_user_2.id,
                story_id=test_story_public.id,
                data=data,
            )
        assert exc.value.status_code == 403
        assert "author" in exc.value.detail.lower()

    @pytest.mark.asyncio
    async def test_update_partial_fields(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_public: Story,
    ):
        """Test updating only some fields."""
        original_content = test_story_public.content

        data = StoryUpdate(title="New Title Only")

        story = await story_service.update_story(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_public.id,
            data=data,
        )

        assert story.title == "New Title Only"
        # Content should remain unchanged (verified by fetching from DB)
        from sqlalchemy import select
        result = await db_session.execute(
            select(Story).where(Story.id == test_story_public.id)
        )
        updated_story = result.scalar_one()
        assert updated_story.content == original_content


class TestDeleteStory:
    """Tests for delete_story function."""

    @pytest.mark.asyncio
    async def test_delete_story_by_author(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_public: Story,
    ):
        """Test author can delete their story."""
        result = await story_service.delete_story(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_public.id,
        )

        assert result["message"] == "Story deleted"

        # Verify story deleted
        from sqlalchemy import select
        check_result = await db_session.execute(
            select(Story).where(Story.id == test_story_public.id)
        )
        deleted_story = check_result.scalar_one_or_none()
        assert deleted_story is None

    @pytest.mark.asyncio
    async def test_delete_story_by_legacy_creator(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test legacy creator can delete any story in their legacy."""
        # Create a story by user 2 (not creator)
        from app.models.legacy import LegacyMember

        # Add user_2 as member
        test_user_2_email = "user2@example.com"
        from app.models.user import User as UserModel

        user_2 = UserModel(
            email=test_user_2_email,
            google_id="google_user2",
            name="User 2",
        )
        db_session.add(user_2)
        await db_session.flush()

        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=user_2.id,
            role="member",
        )
        db_session.add(member)
        await db_session.flush()

        # Create story by user_2
        story = Story(
            legacy_id=test_legacy.id,
            author_id=user_2.id,
            title="User 2 Story",
            content="Content",
            visibility="public",
        )
        db_session.add(story)
        await db_session.commit()
        await db_session.refresh(story)

        # test_user (creator) should be able to delete it
        result = await story_service.delete_story(
            db=db_session,
            user_id=test_user.id,
            story_id=story.id,
        )

        assert result["message"] == "Story deleted"

    @pytest.mark.asyncio
    async def test_delete_story_by_non_author_non_creator_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story_public: Story,
    ):
        """Test non-author, non-creator cannot delete story."""
        with pytest.raises(HTTPException) as exc:
            await story_service.delete_story(
                db=db_session,
                user_id=test_user_2.id,
                story_id=test_story_public.id,
            )
        assert exc.value.status_code == 403
        assert "author" in exc.value.detail.lower() or "creator" in exc.value.detail.lower()
