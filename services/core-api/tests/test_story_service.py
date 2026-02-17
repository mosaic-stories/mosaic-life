"""Unit tests for story service layer."""

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.schemas.associations import LegacyAssociationCreate
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
            title="My First Story",
            content="# Heading\n\nThis is the story content.",
            visibility="private",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )

        story = await story_service.create_story(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )

        assert story.title == "My First Story"
        assert len(story.legacies) >= 1
        assert story.legacies[0].legacy_id == test_legacy.id
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
            title="Unauthorized Story",
            content="Content",
            visibility="private",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
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
            author_id=test_user_2.id,
            title="Public Story",
            content="Content",
            visibility="public",
        )
        db_session.add(public_story)
        await db_session.flush()

        # Create association with legacy
        story_legacy_public = StoryLegacy(
            story_id=public_story.id,
            legacy_id=test_legacy_with_pending.id,
            role="primary",
            position=0,
        )
        db_session.add(story_legacy_public)
        await db_session.commit()

        # Create a private story
        private_story = Story(
            author_id=test_user_2.id,
            title="Private Story",
            content="Content",
            visibility="private",
        )
        db_session.add(private_story)
        await db_session.flush()

        # Create association with legacy
        story_legacy_private = StoryLegacy(
            story_id=private_story.id,
            legacy_id=test_legacy_with_pending.id,
            role="primary",
            position=0,
        )
        db_session.add(story_legacy_private)
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
        assert (
            "content" in str(story.content).lower()
            or story.content == test_story_public.content
        )

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
    async def test_update_story_non_member_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story_public: Story,
    ):
        """Test that non-members cannot update story."""
        data = StoryUpdate(title="Unauthorized Update")

        with pytest.raises(HTTPException) as exc:
            await story_service.update_story(
                db=db_session,
                user_id=test_user_2.id,
                story_id=test_story_public.id,
                data=data,
            )
        assert exc.value.status_code == 403
        assert "only the story author" in exc.value.detail.lower()

    @pytest.mark.asyncio
    async def test_update_story_admin_non_author_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story_public: Story,
    ):
        """Test admin member cannot update a story they did not author."""
        db_session.add(
            LegacyMember(
                legacy_id=test_legacy.id,
                user_id=test_user_2.id,
                role="admin",
            )
        )
        await db_session.flush()

        data = StoryUpdate(title="Admin Updated")
        with pytest.raises(HTTPException) as exc:
            await story_service.update_story(
                db=db_session,
                user_id=test_user_2.id,
                story_id=test_story_public.id,
                data=data,
            )

        assert exc.value.status_code == 403
        assert "only the story author" in exc.value.detail.lower()

    @pytest.mark.asyncio
    async def test_update_story_advocate_non_author_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story_private: Story,
        test_story_public: Story,
    ):
        """Test advocate cannot update stories they did not author."""
        db_session.add(
            LegacyMember(
                legacy_id=test_legacy.id,
                user_id=test_user_2.id,
                role="advocate",
            )
        )
        await db_session.flush()

        with pytest.raises(HTTPException) as private_exc:
            await story_service.update_story(
                db=db_session,
                user_id=test_user_2.id,
                story_id=test_story_private.id,
                data=StoryUpdate(title="Advocate Private Edit"),
            )
        assert private_exc.value.status_code == 403

        with pytest.raises(HTTPException) as public_exc:
            await story_service.update_story(
                db=db_session,
                user_id=test_user_2.id,
                story_id=test_story_public.id,
                data=StoryUpdate(title="Advocate Public Edit"),
            )
        assert public_exc.value.status_code == 403

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
            author_id=user_2.id,
            title="User 2 Story",
            content="Content",
            visibility="public",
        )
        db_session.add(story)
        await db_session.flush()

        # Create association with legacy
        story_legacy = StoryLegacy(
            story_id=story.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(story_legacy)
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
        assert (
            "author" in exc.value.detail.lower()
            or "creator" in exc.value.detail.lower()
        )


class TestCreateStoryVersioning:
    """Tests for versioning integration in create_story."""

    @pytest.mark.asyncio
    async def test_create_story_creates_v1(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Creating a story should also create version 1."""
        data = StoryCreate(
            title="New Story",
            content="Story content.",
            visibility="private",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )

        result = await story_service.create_story(
            db=db_session, user_id=test_user.id, data=data
        )

        # Check that v1 was created
        versions = await db_session.execute(
            select(StoryVersion).where(StoryVersion.story_id == result.id)
        )
        version_list = versions.scalars().all()
        assert len(version_list) == 1
        assert version_list[0].version_number == 1
        assert version_list[0].status == "active"
        assert version_list[0].source == "manual_edit"
        assert version_list[0].change_summary == "Initial version"

    @pytest.mark.asyncio
    async def test_create_story_sets_active_version_id(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Creating a story should set active_version_id."""
        data = StoryCreate(
            title="New Story",
            content="Story content.",
            visibility="private",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )

        result = await story_service.create_story(
            db=db_session, user_id=test_user.id, data=data
        )

        story_result = await db_session.execute(
            select(Story).where(Story.id == result.id)
        )
        story = story_result.scalar_one()
        assert story.active_version_id is not None


class TestUpdateStoryVersioning:
    """Tests for versioning integration in update_story."""

    @pytest.mark.asyncio
    async def test_update_creates_new_version(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_public: Story,
    ):
        """Updating content should create a new version."""
        # Fixture already creates v1 with active_version_id set

        data = StoryUpdate(title="Updated Title", content="Updated content.")
        await story_service.update_story(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_public.id,
            data=data,
        )

        # Check that v2 was created
        versions_result = await db_session.execute(
            select(StoryVersion)
            .where(StoryVersion.story_id == test_story_public.id)
            .order_by(StoryVersion.version_number)
        )
        versions = versions_result.scalars().all()
        assert len(versions) == 2
        assert versions[0].status == "inactive"  # v1
        assert versions[1].status == "active"  # v2
        assert versions[1].title == "Updated Title"

    @pytest.mark.asyncio
    async def test_visibility_only_update_no_new_version(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_public: Story,
    ):
        """Updating only visibility should not create a new version."""
        # Fixture already creates v1 with active_version_id set

        data = StoryUpdate(visibility="private")
        await story_service.update_story(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_public.id,
            data=data,
        )

        versions_result = await db_session.execute(
            select(StoryVersion).where(StoryVersion.story_id == test_story_public.id)
        )
        versions = versions_result.scalars().all()
        assert len(versions) == 1  # Still only v1


class TestGetStoryDetailVersioning:
    """Tests for version info in get_story_detail."""

    @pytest.mark.asyncio
    async def test_detail_includes_version_count(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_public: Story,
    ):
        """GET story detail should include version_count for author."""
        # Fixture already creates v1 with active_version_id set

        result = await story_service.get_story_detail(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_public.id,
        )
        assert result.version_count == 1

    @pytest.mark.asyncio
    async def test_detail_includes_has_draft(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story_public: Story,
    ):
        """GET story detail should include has_draft for author."""
        # Fixture already creates v1 with active_version_id set

        result = await story_service.get_story_detail(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story_public.id,
        )
        assert result.has_draft is False
