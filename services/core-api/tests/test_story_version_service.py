"""Tests for story version service."""

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.models.legacy import Legacy
from app.models.associations import StoryLegacy
from app.services.story_version import (
    bulk_delete_versions,
    delete_version,
    get_next_version_number,
    get_active_version,
    get_draft_version,
    get_version_detail,
    list_versions,
)


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
    async def test_never_reuses_deleted_numbers(
        self, db_session, story_with_version, test_user
    ):
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
    async def test_returns_none_when_no_active(
        self, db_session, test_user, test_legacy
    ):
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
    async def test_returns_draft_when_exists(
        self, db_session, story_with_version, test_user
    ):
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


class TestListVersions:
    @pytest.mark.asyncio
    async def test_returns_versions_newest_first(
        self, db_session, story_with_version, test_user
    ):
        # Create v2
        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Updated",
            content="Updated content.",
            status="inactive",
            source="manual_edit",
            change_summary="Updated the story",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()

        result = await list_versions(
            db_session, story_with_version.id, page=1, page_size=20
        )
        assert result.total == 2
        assert result.versions[0].version_number == 2
        assert result.versions[1].version_number == 1

    @pytest.mark.asyncio
    async def test_pagination(self, db_session, story_with_version, test_user):
        # Create v2 and v3
        for i in [2, 3]:
            v = StoryVersion(
                story_id=story_with_version.id,
                version_number=i,
                title=f"V{i}",
                content=f"Content v{i}.",
                status="inactive",
                source="manual_edit",
                created_by=test_user.id,
            )
            db_session.add(v)
        await db_session.flush()

        # Page 1, size 2
        result = await list_versions(
            db_session, story_with_version.id, page=1, page_size=2
        )
        assert result.total == 3
        assert len(result.versions) == 2
        assert result.versions[0].version_number == 3

        # Page 2, size 2
        result = await list_versions(
            db_session, story_with_version.id, page=2, page_size=2
        )
        assert len(result.versions) == 1
        assert result.versions[0].version_number == 1

    @pytest.mark.asyncio
    async def test_soft_cap_warning(self, db_session, story_with_version, test_user):
        """When version count exceeds soft cap, include warning."""
        # Create v2 and v3
        for i in [2, 3]:
            v = StoryVersion(
                story_id=story_with_version.id,
                version_number=i,
                title=f"V{i}",
                content=f"Content v{i}.",
                status="inactive",
                source="manual_edit",
                created_by=test_user.id,
            )
            db_session.add(v)
        await db_session.flush()

        # 3 versions with soft_cap=2 should trigger warning
        result = await list_versions(
            db_session, story_with_version.id, page=1, page_size=20, soft_cap=2
        )
        assert result.warning is not None
        assert "3 versions" in result.warning

    @pytest.mark.asyncio
    async def test_no_warning_under_cap(self, db_session, story_with_version):
        result = await list_versions(
            db_session, story_with_version.id, page=1, page_size=20, soft_cap=50
        )
        assert result.warning is None

    @pytest.mark.asyncio
    async def test_excludes_content_from_summaries(
        self, db_session, story_with_version
    ):
        result = await list_versions(
            db_session, story_with_version.id, page=1, page_size=20
        )
        summary = result.versions[0]
        assert "content" not in summary.model_fields


class TestGetVersionDetail:
    @pytest.mark.asyncio
    async def test_returns_full_detail(self, db_session, story_with_version):
        result = await get_version_detail(
            db_session, story_with_version.id, version_number=1
        )
        assert result.title == "Versioned Story"
        assert result.content == "Original content."
        assert result.version_number == 1

    @pytest.mark.asyncio
    async def test_not_found_raises_404(self, db_session, story_with_version):
        with pytest.raises(HTTPException) as exc_info:
            await get_version_detail(
                db_session, story_with_version.id, version_number=99
            )
        assert exc_info.value.status_code == 404


class TestDeleteVersion:
    @pytest.mark.asyncio
    async def test_delete_inactive_version(
        self, db_session, story_with_version, test_user
    ):
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

        await delete_version(db_session, story_with_version.id, version_number=2)

        check = await db_session.execute(
            select(StoryVersion).where(
                StoryVersion.story_id == story_with_version.id,
                StoryVersion.version_number == 2,
            )
        )
        assert check.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_delete_active_version_blocked(
        self, db_session, story_with_version
    ):
        """Deleting the active version should return 409."""
        with pytest.raises(HTTPException) as exc_info:
            await delete_version(
                db_session, story_with_version.id, version_number=1
            )
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_delete_draft_version(
        self, db_session, story_with_version, test_user
    ):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Draft",
            content="Draft content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await delete_version(db_session, story_with_version.id, version_number=2)

    @pytest.mark.asyncio
    async def test_delete_nonexistent_raises_404(
        self, db_session, story_with_version
    ):
        with pytest.raises(HTTPException) as exc_info:
            await delete_version(
                db_session, story_with_version.id, version_number=99
            )
        assert exc_info.value.status_code == 404


class TestBulkDeleteVersions:
    @pytest.mark.asyncio
    async def test_bulk_delete_inactive_versions(
        self, db_session, story_with_version, test_user
    ):
        for i in [2, 3]:
            v = StoryVersion(
                story_id=story_with_version.id,
                version_number=i,
                title=f"V{i}",
                content=f"Content v{i}.",
                status="inactive",
                source="manual_edit",
                created_by=test_user.id,
            )
            db_session.add(v)
        await db_session.flush()

        deleted = await bulk_delete_versions(
            db_session, story_with_version.id, version_numbers=[2, 3]
        )
        assert deleted == 2

    @pytest.mark.asyncio
    async def test_bulk_delete_rejects_if_any_active(
        self, db_session, story_with_version, test_user
    ):
        """If any version in the list is active, entire request is rejected."""
        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="Content v2.",
            status="inactive",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()

        with pytest.raises(HTTPException) as exc_info:
            await bulk_delete_versions(
                db_session, story_with_version.id, version_numbers=[1, 2]
            )
        assert exc_info.value.status_code == 409
