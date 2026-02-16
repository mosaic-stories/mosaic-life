"""API tests for story version endpoints."""

import pytest
import pytest_asyncio

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.models.legacy import Legacy
from app.models.associations import StoryLegacy
from tests.conftest import create_auth_headers_for_user


@pytest_asyncio.fixture
async def versioned_story(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a story with v1 and v2 for API testing."""
    story = Story(
        author_id=test_user.id,
        title="API Test Story",
        content="V2 content.",
        visibility="private",
    )
    db_session.add(story)
    await db_session.flush()

    sl = StoryLegacy(
        story_id=story.id, legacy_id=test_legacy.id, role="primary", position=0
    )
    db_session.add(sl)

    v1 = StoryVersion(
        story_id=story.id,
        version_number=1,
        title="Original",
        content="V1 content.",
        status="inactive",
        source="manual_edit",
        change_summary="Initial version",
        created_by=test_user.id,
    )
    v2 = StoryVersion(
        story_id=story.id,
        version_number=2,
        title="API Test Story",
        content="V2 content.",
        status="active",
        source="manual_edit",
        change_summary="Updated content",
        created_by=test_user.id,
    )
    db_session.add_all([v1, v2])
    await db_session.flush()

    story.active_version_id = v2.id
    await db_session.commit()
    await db_session.refresh(story)
    return story


class TestListVersions:
    @pytest.mark.asyncio
    async def test_list_versions(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.get(
            f"/api/stories/{versioned_story.id}/versions",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert data["versions"][0]["version_number"] == 2
        assert "content" not in data["versions"][0]

    @pytest.mark.asyncio
    async def test_list_versions_requires_auth(
        self, client: AsyncClient, versioned_story: Story
    ) -> None:
        resp = await client.get(f"/api/stories/{versioned_story.id}/versions")
        assert resp.status_code == 401 or resp.status_code == 403

    @pytest.mark.asyncio
    async def test_list_versions_author_only(
        self,
        client: AsyncClient,
        versioned_story: Story,
        test_user_2: User,
    ) -> None:
        headers = create_auth_headers_for_user(test_user_2)
        resp = await client.get(
            f"/api/stories/{versioned_story.id}/versions",
            headers=headers,
        )
        assert resp.status_code == 403


class TestGetVersion:
    @pytest.mark.asyncio
    async def test_get_version_detail(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.get(
            f"/api/stories/{versioned_story.id}/versions/1",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Original"
        assert data["content"] == "V1 content."

    @pytest.mark.asyncio
    async def test_get_version_not_found(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.get(
            f"/api/stories/{versioned_story.id}/versions/99",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestDeleteVersion:
    @pytest.mark.asyncio
    async def test_delete_inactive_version(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.delete(
            f"/api/stories/{versioned_story.id}/versions/1",
            headers=auth_headers,
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_active_version_blocked(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.delete(
            f"/api/stories/{versioned_story.id}/versions/2",
            headers=auth_headers,
        )
        assert resp.status_code == 409


class TestBulkDelete:
    @pytest.mark.asyncio
    async def test_bulk_delete(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.request(
            "DELETE",
            f"/api/stories/{versioned_story.id}/versions",
            headers=auth_headers,
            json={"version_numbers": [1]},
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_bulk_delete_rejects_active(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.request(
            "DELETE",
            f"/api/stories/{versioned_story.id}/versions",
            headers=auth_headers,
            json={"version_numbers": [1, 2]},
        )
        assert resp.status_code == 409


class TestRestoreVersion:
    @pytest.mark.asyncio
    async def test_restore_version(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.post(
            f"/api/stories/{versioned_story.id}/versions/1/activate",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["version_number"] == 3
        assert data["source"] == "restoration"
        assert data["source_version"] == 1


class TestApproveDraft:
    @pytest.mark.asyncio
    async def test_approve_draft(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        versioned_story: Story,
        db_session: AsyncSession,
        test_user: User,
    ) -> None:
        # Create a draft first
        draft = StoryVersion(
            story_id=versioned_story.id,
            version_number=3,
            title="Draft Title",
            content="Draft content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.commit()

        resp = await client.post(
            f"/api/stories/{versioned_story.id}/versions/draft/approve",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "active"

    @pytest.mark.asyncio
    async def test_approve_no_draft_404(
        self, client: AsyncClient, auth_headers: dict[str, str], versioned_story: Story
    ) -> None:
        resp = await client.post(
            f"/api/stories/{versioned_story.id}/versions/draft/approve",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestDiscardDraft:
    @pytest.mark.asyncio
    async def test_discard_draft(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        versioned_story: Story,
        db_session: AsyncSession,
        test_user: User,
    ) -> None:
        draft = StoryVersion(
            story_id=versioned_story.id,
            version_number=3,
            title="Discard me",
            content="Discard content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.commit()

        resp = await client.delete(
            f"/api/stories/{versioned_story.id}/versions/draft",
            headers=auth_headers,
        )
        assert resp.status_code == 204
