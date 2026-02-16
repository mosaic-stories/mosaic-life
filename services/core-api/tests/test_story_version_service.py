"""Tests for story version service."""

import pytest
import pytest_asyncio
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.models.legacy import Legacy, LegacyMember
from app.models.associations import StoryLegacy
from app.services.story_version import (
    get_next_version_number,
    get_active_version,
    get_draft_version,
)
from tests.conftest import create_auth_headers_for_user


@pytest_asyncio.fixture
async def story_with_version(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> Story:
    """Create a story with a v1 active version (mimics post-migration state)."""
    story = Story(
        author_id=test_user.id,
        title="Versioned Story",
        content="Original content.",
        visibility="private",
    )
    db_session.add(story)
    await db_session.flush()

    # Create legacy association
    story_legacy = StoryLegacy(
        story_id=story.id,
        legacy_id=test_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(story_legacy)

    # Create v1
    version = StoryVersion(
        story_id=story.id,
        version_number=1,
        title="Versioned Story",
        content="Original content.",
        status="active",
        source="manual_edit",
        change_summary="Initial version",
        created_by=test_user.id,
    )
    db_session.add(version)
    await db_session.flush()

    story.active_version_id = version.id
    await db_session.commit()
    await db_session.refresh(story)
    return story


class TestGetNextVersionNumber:
    @pytest.mark.asyncio
    async def test_first_version_returns_1(self, db_session, test_user, test_legacy):
        """A story with no versions should get version_number=1."""
        story = Story(
            author_id=test_user.id,
            title="New Story",
            content="Content.",
            visibility="private",
        )
        db_session.add(story)
        await db_session.flush()

        result = await get_next_version_number(db_session, story.id)
        assert result == 1

    @pytest.mark.asyncio
    async def test_increments_from_existing(self, db_session, story_with_version):
        """Should return max(version_number) + 1."""
        result = await get_next_version_number(db_session, story_with_version.id)
        assert result == 2

    @pytest.mark.asyncio
    async def test_never_reuses_deleted_numbers(self, db_session, story_with_version, test_user):
        """After creating v2 and deleting it, next should be v2 (MAX+1)."""
        # Create v2
        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="V2 content.",
            status="inactive",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()

        # Delete v2
        await db_session.delete(v2)
        await db_session.flush()

        result = await get_next_version_number(db_session, story_with_version.id)
        assert result == 2


class TestGetActiveVersion:
    @pytest.mark.asyncio
    async def test_returns_active_version(self, db_session, story_with_version):
        result = await get_active_version(db_session, story_with_version.id)
        assert result is not None
        assert result.status == "active"
        assert result.version_number == 1

    @pytest.mark.asyncio
    async def test_returns_none_when_no_active(self, db_session, test_user, test_legacy):
        story = Story(
            author_id=test_user.id,
            title="No Active",
            content="Content.",
            visibility="private",
        )
        db_session.add(story)
        await db_session.flush()

        result = await get_active_version(db_session, story.id)
        assert result is None


class TestGetDraftVersion:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_draft(self, db_session, story_with_version):
        result = await get_draft_version(db_session, story_with_version.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_draft_when_exists(self, db_session, story_with_version, test_user):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Draft title",
            content="Draft content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        result = await get_draft_version(db_session, story_with_version.id)
        assert result is not None
        assert result.status == "draft"
        assert result.version_number == 2
