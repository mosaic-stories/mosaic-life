"""Integration tests for story API endpoints."""

import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestCreateStory:
    """Tests for POST /api/stories."""

    @pytest.mark.asyncio
    async def test_create_story_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test successful story creation."""
        data = {
            "title": "My First Memory",
            "content": "# Childhood\n\nI remember when...",
            "visibility": "private",
            "legacies": [
                {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
            ],
        }

        response = await client.post(
            "/api/stories/",
            json=data,
            headers=auth_headers,
        )

        assert response.status_code == 201
        result = response.json()
        assert result["title"] == "My First Memory"
        assert result["visibility"] == "private"
        assert len(result["legacies"]) >= 1
        assert result["legacies"][0]["legacy_id"] == str(test_legacy.id)

    @pytest.mark.asyncio
    async def test_create_story_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
    ):
        """Test that creating story requires authentication."""
        data = {
            "title": "Test",
            "content": "Content",
            "legacies": [
                {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
            ],
        }

        response = await client.post("/api/stories/", json=data)

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_story_requires_membership(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_user_2: User,
    ):
        """Test that creating story requires legacy membership."""
        # Create auth headers for user_2 (not a member)
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            provider=test_user_2.provider,
            provider_id=test_user_2.provider_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        data = {
            "title": "Unauthorized Story",
            "content": "Content",
            "legacies": [
                {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
            ],
        }

        response = await client.post(
            "/api/stories/",
            json=data,
            headers=headers,
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_create_story_validation_error(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test validation error on invalid data (no legacies)."""
        data = {
            "title": "A Story",
            "content": "Content",
            "legacies": [],
        }

        response = await client.post(
            "/api/stories/",
            json=data,
            headers=auth_headers,
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_story_blank_title_derives_from_content(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """An empty title is accepted and a working title is derived from content."""
        data = {
            "title": "",
            "content": "A memory worth writing down.",
            "status": "draft",
            "legacies": [
                {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
            ],
        }

        response = await client.post(
            "/api/stories/",
            json=data,
            headers=auth_headers,
        )

        assert response.status_code == 201
        result = response.json()
        assert result["title"] == "A memory worth writing down."


class TestListStories:
    """Tests for GET /api/stories."""

    @pytest.mark.asyncio
    async def test_list_stories_as_member(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story_public: Story,
        test_story_private: Story,
        test_story_personal: Story,
    ):
        """Test listing stories as member sees all visible stories."""
        response = await client.get(
            "/api/stories/",
            params={"legacy_id": str(test_legacy.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert len(result) == 3  # public + private + personal (own)

    @pytest.mark.asyncio
    async def test_list_stories_as_non_member(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_story_public: Story,
        test_story_private: Story,
        test_story_personal: Story,
        test_user_2: User,
    ):
        """Test listing stories as non-member sees only public."""
        # Create auth headers for user_2
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            provider=test_user_2.provider,
            provider_id=test_user_2.provider_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        response = await client.get(
            "/api/stories/",
            params={"legacy_id": str(test_legacy.id)},
            headers=headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert len(result) == 1  # Only public
        assert result[0]["visibility"] == "public"

    @pytest.mark.asyncio
    async def test_list_stories_without_filter(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that listing stories works without legacy_id filter (shows all user stories)."""
        response = await client.get(
            "/api/stories/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        # Should return a list (may be empty)
        result = response.json()
        assert isinstance(result, list)


class TestGetStory:
    """Tests for GET /api/stories/{story_id}."""

    @pytest.mark.asyncio
    async def test_get_public_story(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story_public: Story,
    ):
        """Test getting public story."""
        response = await client.get(
            f"/api/stories/{test_story_public.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert result["id"] == str(test_story_public.id)
        assert result["title"] == test_story_public.title
        assert "content" in result

    @pytest.mark.asyncio
    async def test_get_private_story_as_member(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story_private: Story,
    ):
        """Test getting private story as member."""
        response = await client.get(
            f"/api/stories/{test_story_private.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert result["visibility"] == "private"

    @pytest.mark.asyncio
    async def test_get_private_story_as_non_member_denied(
        self,
        client: AsyncClient,
        test_story_private: Story,
        test_user_2: User,
    ):
        """Test getting private story as non-member is denied."""
        # Create auth headers for user_2
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            provider=test_user_2.provider,
            provider_id=test_user_2.provider_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        response = await client.get(
            f"/api/stories/{test_story_private.id}",
            headers=headers,
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_get_personal_story_as_author(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story_personal: Story,
    ):
        """Test author can view their personal story."""
        response = await client.get(
            f"/api/stories/{test_story_personal.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert result["visibility"] == "personal"


class TestUpdateStory:
    """Tests for PUT /api/stories/{story_id}."""

    @pytest.mark.asyncio
    async def test_update_story_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story_public: Story,
    ):
        """Test updating story as author."""
        data = {
            "title": "Updated Title",
            "content": "Updated content",
            "visibility": "private",
        }

        response = await client.put(
            f"/api/stories/{test_story_public.id}",
            json=data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert result["title"] == "Updated Title"
        assert result["visibility"] == "private"

    @pytest.mark.asyncio
    async def test_update_story_only_author(
        self,
        client: AsyncClient,
        test_story_public: Story,
        test_user_2: User,
    ):
        """Test that only author can update story."""
        # Create auth headers for user_2
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            provider=test_user_2.provider,
            provider_id=test_user_2.provider_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        data = {"title": "Unauthorized Update"}

        response = await client.put(
            f"/api/stories/{test_story_public.id}",
            json=data,
            headers=headers,
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_story_admin_member_non_author_denied(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_story_public: Story,
        test_user_2: User,
    ):
        """Test admin member cannot update story when not the author."""
        assoc_result = await db_session.execute(
            select(StoryLegacy.legacy_id).where(
                StoryLegacy.story_id == test_story_public.id
            )
        )
        legacy_id = assoc_result.scalar_one()
        db_session.add(
            LegacyMember(
                legacy_id=legacy_id,
                user_id=test_user_2.id,
                role="admin",
            )
        )
        await db_session.commit()

        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            provider=test_user_2.provider,
            provider_id=test_user_2.provider_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        response = await client.put(
            f"/api/stories/{test_story_public.id}",
            json={"title": "Admin Update"},
            headers=headers,
        )

        assert response.status_code == 403


class TestCloseEditSession:
    """Tests for POST /api/stories/{story_id}/edit-session/close."""

    @pytest.mark.asyncio
    async def test_close_mints_version_when_session_open(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_story_public: Story,
    ):
        """An open editing session is captured as a version on close."""
        test_story_public.pending_edit_since = datetime.now(timezone.utc)
        await db_session.commit()

        response = await client.post(
            f"/api/stories/{test_story_public.id}/edit-session/close",
            headers=auth_headers,
        )

        assert response.status_code == 204

        versions_result = await db_session.execute(
            select(StoryVersion).where(StoryVersion.story_id == test_story_public.id)
        )
        assert len(versions_result.scalars().all()) == 2

        story_result = await db_session.execute(
            select(Story).where(Story.id == test_story_public.id)
        )
        assert story_result.scalar_one().pending_edit_since is None

    @pytest.mark.asyncio
    async def test_close_is_noop_when_no_session_open(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_story_public: Story,
    ):
        """No open session -- still 204, and no version is created."""
        assert test_story_public.pending_edit_since is None

        response = await client.post(
            f"/api/stories/{test_story_public.id}/edit-session/close",
            headers=auth_headers,
        )

        assert response.status_code == 204

        versions_result = await db_session.execute(
            select(StoryVersion).where(StoryVersion.story_id == test_story_public.id)
        )
        assert len(versions_result.scalars().all()) == 1  # Still only v1

    @pytest.mark.asyncio
    async def test_close_twice_is_idempotent(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_story_public: Story,
    ):
        """Calling close twice in a row mints at most one version."""
        test_story_public.pending_edit_since = datetime.now(timezone.utc)
        await db_session.commit()

        first = await client.post(
            f"/api/stories/{test_story_public.id}/edit-session/close",
            headers=auth_headers,
        )
        assert first.status_code == 204

        second = await client.post(
            f"/api/stories/{test_story_public.id}/edit-session/close",
            headers=auth_headers,
        )
        assert second.status_code == 204

        versions_result = await db_session.execute(
            select(StoryVersion).where(StoryVersion.story_id == test_story_public.id)
        )
        assert len(versions_result.scalars().all()) == 2  # Unchanged by 2nd call

    @pytest.mark.asyncio
    async def test_close_nonexistent_story_404(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """A story that does not exist returns 404."""
        response = await client.post(
            f"/api/stories/{uuid4()}/edit-session/close",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_close_non_author_403(
        self,
        client: AsyncClient,
        test_story_public: Story,
        test_user_2: User,
    ):
        """A non-author cannot close another author's editing session."""
        headers = create_auth_headers_for_user(test_user_2)

        response = await client.post(
            f"/api/stories/{test_story_public.id}/edit-session/close",
            headers=headers,
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_close_requires_auth(
        self,
        client: AsyncClient,
        test_story_public: Story,
    ):
        """Unauthenticated requests are rejected."""
        response = await client.post(
            f"/api/stories/{test_story_public.id}/edit-session/close",
        )

        assert response.status_code == 401


class TestDeleteStory:
    """Tests for DELETE /api/stories/{story_id}."""

    @pytest.mark.asyncio
    async def test_delete_story_by_author(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story_public: Story,
    ):
        """Test author can delete their story."""
        response = await client.delete(
            f"/api/stories/{test_story_public.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_story_by_non_author_denied(
        self,
        client: AsyncClient,
        test_story_public: Story,
        test_user_2: User,
    ):
        """Test non-author cannot delete story."""
        # Create auth headers for user_2
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            provider=test_user_2.provider,
            provider_id=test_user_2.provider_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        response = await client.delete(
            f"/api/stories/{test_story_public.id}",
            headers=headers,
        )

        assert response.status_code == 403


class TestStoryWorkflow:
    """Integration tests for complete story workflow."""

    @pytest.mark.asyncio
    async def test_complete_story_workflow(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test complete flow: create → list → get → update → delete."""
        # 1. Create story
        create_data = {
            "title": "Integration Test Story",
            "content": "# My Story\n\nThis is the content.",
            "visibility": "private",
            "legacies": [
                {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
            ],
        }

        create_response = await client.post(
            "/api/stories/",
            json=create_data,
            headers=auth_headers,
        )
        assert create_response.status_code == 201
        story_id = create_response.json()["id"]

        # 2. List stories (should include new story)
        list_response = await client.get(
            "/api/stories/",
            params={"legacy_id": str(test_legacy.id)},
            headers=auth_headers,
        )
        assert list_response.status_code == 200
        stories = list_response.json()
        assert any(s["id"] == story_id for s in stories)

        # 3. Get story detail
        get_response = await client.get(
            f"/api/stories/{story_id}",
            headers=auth_headers,
        )
        assert get_response.status_code == 200
        story_detail = get_response.json()
        assert story_detail["title"] == "Integration Test Story"
        assert "content" in story_detail

        # 4. Update story
        update_data = {
            "title": "Updated Integration Story",
            "visibility": "public",
        }

        update_response = await client.put(
            f"/api/stories/{story_id}",
            json=update_data,
            headers=auth_headers,
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["title"] == "Updated Integration Story"
        assert updated["visibility"] == "public"

        # 5. Delete story
        delete_response = await client.delete(
            f"/api/stories/{story_id}",
            headers=auth_headers,
        )
        assert delete_response.status_code == 204

        # 6. Verify story deleted
        get_deleted = await client.get(
            f"/api/stories/{story_id}",
            headers=auth_headers,
        )
        assert get_deleted.status_code == 404

    @pytest.mark.asyncio
    async def test_visibility_filtering_workflow(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test visibility filtering throughout workflow."""
        # Create auth headers for both users
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)

        session_data_1 = SessionData(
            user_id=test_user.id,
            provider=test_user.provider,
            provider_id=test_user.provider_id,
            email=test_user.email,
            name=test_user.name,
            avatar_url=test_user.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data_1)
        headers_1 = {"Cookie": f"{cookie_name}={cookie_value}"}

        session_data_2 = SessionData(
            user_id=test_user_2.id,
            provider=test_user_2.provider,
            provider_id=test_user_2.provider_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data_2)
        headers_2 = {"Cookie": f"{cookie_name}={cookie_value}"}

        # User 1 (member) creates three stories with different visibility
        public_data = {
            "title": "Public Story",
            "content": "Public content",
            "visibility": "public",
            "legacies": [
                {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
            ],
        }
        public_resp = await client.post(
            "/api/stories/", json=public_data, headers=headers_1
        )
        assert public_resp.status_code == 201

        private_data = {
            "title": "Private Story",
            "content": "Private content",
            "visibility": "private",
            "legacies": [
                {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
            ],
        }
        private_resp = await client.post(
            "/api/stories/", json=private_data, headers=headers_1
        )
        assert private_resp.status_code == 201

        personal_data = {
            "title": "Personal Story",
            "content": "Personal content",
            "visibility": "personal",
            "legacies": [
                {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
            ],
        }
        personal_resp = await client.post(
            "/api/stories/", json=personal_data, headers=headers_1
        )
        assert personal_resp.status_code == 201

        # User 1 (member) should see all 3
        list_member = await client.get(
            "/api/stories/",
            params={"legacy_id": str(test_legacy.id)},
            headers=headers_1,
        )
        assert list_member.status_code == 200
        member_stories = list_member.json()
        assert len(member_stories) == 3

        # User 2 (non-member) should see only public
        list_non_member = await client.get(
            "/api/stories/",
            params={"legacy_id": str(test_legacy.id)},
            headers=headers_2,
        )
        assert list_non_member.status_code == 200
        non_member_stories = list_non_member.json()
        assert len(non_member_stories) == 1
        assert non_member_stories[0]["visibility"] == "public"
