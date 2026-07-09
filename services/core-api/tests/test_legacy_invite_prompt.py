"""Tests for the invite-moment prompt data: published/member counts and dismissal."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestLegacyCountFields:
    """Tests for member_count / published_story_count on legacy responses."""

    @pytest.mark.asyncio
    async def test_new_legacy_has_one_member_and_zero_published_stories(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """A freshly created legacy starts with 1 member and 0 published stories."""
        response = await client.post(
            "/api/legacies/",
            json={"name": "Fresh Legacy"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        result = response.json()
        assert result["member_count"] == 1
        assert result["published_story_count"] == 0
        assert result["invite_prompt_dismissed_at"] is None

    @pytest.mark.asyncio
    async def test_get_legacy_reports_published_story_count(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story,
    ):
        """A legacy with one published story reports published_story_count=1."""
        response = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        result = response.json()
        assert result["member_count"] == 1
        assert result["published_story_count"] == 1

    @pytest.mark.asyncio
    async def test_draft_stories_excluded_from_published_story_count(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """A draft story does not count toward published_story_count."""
        story = Story(
            author_id=test_user.id,
            title="Draft Story",
            content="Not published yet.",
            visibility="private",
            status="draft",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(
            StoryLegacy(story_id=story.id, legacy_id=test_legacy.id, role="primary")
        )
        await db_session.commit()

        response = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        result = response.json()
        assert result["published_story_count"] == 0

    @pytest.mark.asyncio
    async def test_member_count_excludes_pending_members(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy_with_pending: Legacy,
    ):
        """Pending members do not count toward member_count."""
        response = await client.get(
            f"/api/legacies/{test_legacy_with_pending.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        result = response.json()
        assert result["member_count"] == 1

    @pytest.mark.asyncio
    async def test_member_count_reflects_second_non_pending_member(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_legacy: Legacy,
        test_user_2: User,
    ):
        """A second accepted member brings member_count to 2."""
        db_session.add(
            LegacyMember(
                legacy_id=test_legacy.id,
                user_id=test_user_2.id,
                role="advocate",
            )
        )
        await db_session.commit()

        response = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        result = response.json()
        assert result["member_count"] == 2


class TestDismissInvitePrompt:
    """Tests for PATCH /api/legacies/{legacy_id}/invite-prompt-dismissal."""

    @pytest.mark.asyncio
    async def test_dismiss_sets_timestamp(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Dismissing sets invite_prompt_dismissed_at, visible on subsequent GET."""
        dismiss_response = await client.patch(
            f"/api/legacies/{test_legacy.id}/invite-prompt-dismissal",
            headers=auth_headers,
        )
        assert dismiss_response.status_code == 204

        get_response = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )
        assert get_response.status_code == 200
        assert get_response.json()["invite_prompt_dismissed_at"] is not None

    @pytest.mark.asyncio
    async def test_dismiss_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
    ):
        """Dismissing without a session is rejected."""
        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/invite-prompt-dismissal",
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_dismiss_requires_membership(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_user_2: User,
    ):
        """A non-member cannot dismiss the prompt."""
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/invite-prompt-dismissal",
            headers=headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_dismiss_is_idempotent(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Dismissing an already-dismissed prompt is a no-op, not an error."""
        first = await client.patch(
            f"/api/legacies/{test_legacy.id}/invite-prompt-dismissal",
            headers=auth_headers,
        )
        assert first.status_code == 204

        first_get = await client.get(
            f"/api/legacies/{test_legacy.id}", headers=auth_headers
        )
        first_dismissed_at = first_get.json()["invite_prompt_dismissed_at"]

        second = await client.patch(
            f"/api/legacies/{test_legacy.id}/invite-prompt-dismissal",
            headers=auth_headers,
        )
        assert second.status_code == 204

        second_get = await client.get(
            f"/api/legacies/{test_legacy.id}", headers=auth_headers
        )
        assert second_get.json()["invite_prompt_dismissed_at"] == first_dismissed_at

    @pytest.mark.asyncio
    async def test_dismissal_is_legacy_scoped_not_user_scoped(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_legacy: Legacy,
        test_user_2: User,
    ):
        """Once one member dismisses, the dismissal is visible to other members too."""
        # Add test_user_2 as a non-pending member of the legacy.
        db_session.add(
            LegacyMember(
                legacy_id=test_legacy.id,
                user_id=test_user_2.id,
                role="advocate",
            )
        )
        await db_session.commit()

        # The creator (test_user) dismisses the prompt.
        dismiss_response = await client.patch(
            f"/api/legacies/{test_legacy.id}/invite-prompt-dismissal",
            headers=auth_headers,
        )
        assert dismiss_response.status_code == 204

        # The other member (test_user_2) should also see it dismissed.
        other_headers = create_auth_headers_for_user(test_user_2)
        other_get = await client.get(
            f"/api/legacies/{test_legacy.id}", headers=other_headers
        )
        assert other_get.status_code == 200
        assert other_get.json()["invite_prompt_dismissed_at"] is not None
