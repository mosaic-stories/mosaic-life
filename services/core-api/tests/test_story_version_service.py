"""Tests for story version service."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.models.legacy import Legacy
from app.models.associations import StoryLegacy
from app.services.story_version import (
    approve_draft,
    bulk_delete_versions,
    create_version,
    delete_version,
    discard_draft,
    get_next_version_number,
    get_active_version,
    get_draft_version,
    get_version_detail,
    list_versions,
    mint_version_at_boundary,
    restore_version,
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
    async def test_delete_active_version_blocked(self, db_session, story_with_version):
        """Deleting the active version should return 409."""
        with pytest.raises(HTTPException) as exc_info:
            await delete_version(db_session, story_with_version.id, version_number=1)
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
    async def test_delete_nonexistent_raises_404(self, db_session, story_with_version):
        with pytest.raises(HTTPException) as exc_info:
            await delete_version(db_session, story_with_version.id, version_number=99)
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


class TestRestoreVersion:
    @pytest.mark.asyncio
    async def test_restore_creates_new_active_version(
        self, db_session, story_with_version, test_user
    ):
        """Restoring v1 should create v2 with v1's content as the new active."""
        v1 = await get_active_version(db_session, story_with_version.id)
        v1.status = "inactive"

        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Edited",
            content="Edited content.",
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()
        story_with_version.active_version_id = v2.id
        story_with_version.title = "Edited"
        story_with_version.content = "Edited content."
        await db_session.flush()

        new_version = await restore_version(
            db_session, story_with_version.id, version_number=1, user_id=test_user.id
        )

        assert new_version.version_number == 3
        assert new_version.status == "active"
        assert new_version.source == "restoration"
        assert new_version.source_version == 1
        assert new_version.title == "Versioned Story"
        assert new_version.content == "Original content."

    @pytest.mark.asyncio
    async def test_restore_deactivates_current(
        self, db_session, story_with_version, test_user
    ):
        """The previously active version should become inactive."""
        v1 = await get_active_version(db_session, story_with_version.id)
        v1.status = "inactive"

        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="V2 content.",
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()
        story_with_version.active_version_id = v2.id
        await db_session.flush()

        await restore_version(
            db_session, story_with_version.id, version_number=1, user_id=test_user.id
        )

        await db_session.refresh(v2)
        assert v2.status == "inactive"

    @pytest.mark.asyncio
    async def test_restore_updates_story_content(
        self, db_session, story_with_version, test_user
    ):
        """stories.title and stories.content should reflect the restored content."""
        v1 = await get_active_version(db_session, story_with_version.id)
        v1.status = "inactive"

        v2 = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="V2",
            content="V2 content.",
            status="active",
            source="manual_edit",
            created_by=test_user.id,
        )
        db_session.add(v2)
        await db_session.flush()
        story_with_version.active_version_id = v2.id
        story_with_version.title = "V2"
        story_with_version.content = "V2 content."
        await db_session.flush()

        await restore_version(
            db_session, story_with_version.id, version_number=1, user_id=test_user.id
        )

        await db_session.refresh(story_with_version)
        assert story_with_version.title == "Versioned Story"
        assert story_with_version.content == "Original content."

    @pytest.mark.asyncio
    async def test_restore_nonexistent_raises_404(
        self, db_session, story_with_version, test_user
    ):
        with pytest.raises(HTTPException) as exc_info:
            await restore_version(
                db_session,
                story_with_version.id,
                version_number=99,
                user_id=test_user.id,
            )
        assert exc_info.value.status_code == 404


class TestApproveDraft:
    @pytest.mark.asyncio
    async def test_approve_promotes_draft_to_active(
        self, db_session, story_with_version, test_user
    ):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="AI Draft",
            content="AI-generated content.",
            status="draft",
            source="ai_enhancement",
            change_summary="Enhanced by AI",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        result = await approve_draft(db_session, story_with_version.id)

        assert result.status == "active"
        assert result.version_number == 2

    @pytest.mark.asyncio
    async def test_approve_deactivates_previous_active(
        self, db_session, story_with_version, test_user
    ):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="AI Draft",
            content="AI content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await approve_draft(db_session, story_with_version.id)

        v1 = await db_session.execute(
            select(StoryVersion).where(
                StoryVersion.story_id == story_with_version.id,
                StoryVersion.version_number == 1,
            )
        )
        v1_row = v1.scalar_one()
        assert v1_row.status == "inactive"

    @pytest.mark.asyncio
    async def test_approve_updates_story_content(
        self, db_session, story_with_version, test_user
    ):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="AI Title",
            content="AI content.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await approve_draft(db_session, story_with_version.id)

        await db_session.refresh(story_with_version)
        assert story_with_version.title == "AI Title"
        assert story_with_version.content == "AI content."

    @pytest.mark.asyncio
    async def test_approve_clears_stale_flag(
        self, db_session, story_with_version, test_user
    ):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="AI Draft",
            content="AI content.",
            status="draft",
            source="ai_enhancement",
            stale=True,
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        result = await approve_draft(db_session, story_with_version.id)
        assert result.stale is False

    @pytest.mark.asyncio
    async def test_approve_no_draft_raises_404(self, db_session, story_with_version):
        with pytest.raises(HTTPException) as exc_info:
            await approve_draft(db_session, story_with_version.id)
        assert exc_info.value.status_code == 404


class TestDiscardDraft:
    @pytest.mark.asyncio
    async def test_discard_deletes_draft(
        self, db_session, story_with_version, test_user
    ):
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Discard me",
            content="To be discarded.",
            status="draft",
            source="ai_enhancement",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await discard_draft(db_session, story_with_version.id)

        result = await get_draft_version(db_session, story_with_version.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_discard_no_draft_raises_404(self, db_session, story_with_version):
        with pytest.raises(HTTPException) as exc_info:
            await discard_draft(db_session, story_with_version.id)
        assert exc_info.value.status_code == 404


class TestCreateVersion:
    @pytest.mark.asyncio
    async def test_create_first_version(self, db_session, test_user, test_legacy):
        """Creating a version for a new story should be v1 active."""
        story = Story(
            author_id=test_user.id,
            title="Brand New",
            content="Brand new content.",
            visibility="private",
        )
        db_session.add(story)
        await db_session.flush()

        version = await create_version(
            db=db_session,
            story=story,
            title="Brand New",
            content="Brand new content.",
            source="manual_edit",
            user_id=test_user.id,
            change_summary="Initial version",
        )

        assert version.version_number == 1
        assert version.status == "active"
        assert story.active_version_id == version.id

    @pytest.mark.asyncio
    async def test_create_new_version_deactivates_previous(
        self, db_session, story_with_version, test_user
    ):
        """Creating a new version should deactivate the old active."""
        version = await create_version(
            db=db_session,
            story=story_with_version,
            title="Updated Title",
            content="Updated content.",
            source="manual_edit",
            user_id=test_user.id,
        )

        assert version.version_number == 2
        assert version.status == "active"

        v1_result = await db_session.execute(
            select(StoryVersion).where(
                StoryVersion.story_id == story_with_version.id,
                StoryVersion.version_number == 1,
            )
        )
        v1 = v1_result.scalar_one()
        assert v1.status == "inactive"

    @pytest.mark.asyncio
    async def test_create_version_marks_draft_stale(
        self, db_session, story_with_version, test_user
    ):
        """If a draft exists, creating a new active version should mark it stale."""
        draft = StoryVersion(
            story_id=story_with_version.id,
            version_number=2,
            title="Draft",
            content="Draft content.",
            status="draft",
            source="ai_enhancement",
            stale=False,
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        await create_version(
            db=db_session,
            story=story_with_version,
            title="New edit",
            content="New edit content.",
            source="manual_edit",
            user_id=test_user.id,
        )

        await db_session.refresh(draft)
        assert draft.stale is True

    @pytest.mark.asyncio
    async def test_create_version_updates_story_fields(
        self, db_session, story_with_version, test_user
    ):
        await create_version(
            db=db_session,
            story=story_with_version,
            title="New Title",
            content="New content.",
            source="manual_edit",
            user_id=test_user.id,
        )

        await db_session.refresh(story_with_version)
        assert story_with_version.title == "New Title"
        assert story_with_version.content == "New content."


class TestMintVersionAtBoundary:
    """Tests for `mint_version_at_boundary()` and its two post-commit
    background-task closures (design.md Decisions 3 and 4).

    Scope note: boundary reasons/mint mechanics for autosave (content-only
    save mints nothing, idle/max-interval minting, an open session
    continuing untouched) and change-summary fallback-on-timeout/
    concurrency-rejection are covered in test_story_service.py and
    test_change_summary.py respectively. These tests cover what's left:
    the synchronous fallback write, the background summary upgrade and its
    CAS guard, `pending_edit_since` clearing, the reason->source mapping,
    and background-closure safety after the originating session is gone.
    """

    @pytest.mark.asyncio
    async def test_fallback_summary_written_synchronously(
        self, db_session, story_with_version, test_user
    ):
        """A version must carry a non-empty change_summary the instant it
        is created -- before any background work runs (spec: 'Every
        version carries a change summary'). No background task is invoked
        in this test at all, so the assertion is purely about the
        synchronous mint path."""
        version = await mint_version_at_boundary(
            db_session,
            story_with_version,
            reason="session_idle",
            user_id=test_user.id,
            background_tasks=BackgroundTasks(),
        )

        assert version.change_summary
        assert version.change_summary == "Manual edit"

        # create_version() already flushed -- confirm it's visible via a
        # fresh read too, not just as an in-memory default on the object
        # `mint_version_at_boundary` happened to return.
        result = await db_session.execute(
            select(StoryVersion).where(StoryVersion.id == version.id)
        )
        assert result.scalar_one().change_summary == "Manual edit"

    @pytest.mark.asyncio
    async def test_pending_edit_since_cleared_by_mint(
        self, db_session, story_with_version, test_user
    ):
        """Minting a version closes the editing session by clearing
        `pending_edit_since` (design.md Decision 1)."""
        story_with_version.pending_edit_since = datetime.now(timezone.utc) - timedelta(
            minutes=20
        )
        await db_session.flush()

        await mint_version_at_boundary(
            db_session,
            story_with_version,
            reason="session_idle",
            user_id=test_user.id,
            background_tasks=BackgroundTasks(),
        )

        assert story_with_version.pending_edit_since is None

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("reason", "expected_source"),
        [
            ("session_idle", "manual_edit"),
            ("session_close", "manual_edit"),
            ("session_max_interval", "manual_edit"),
            ("publish", "manual_edit"),
            ("evolve_entry", "manual_edit"),
            ("ai_rewrite_applied", "ai_enhancement"),
        ],
    )
    async def test_reason_maps_to_persisted_source(
        self,
        db_session,
        story_with_version,
        test_user,
        reason,
        expected_source,
    ):
        """`reason` is mapped to `source` before persisting -- the raw
        reason string is never written to `story_versions.source`
        (design.md Decision 3)."""
        version = await mint_version_at_boundary(
            db_session,
            story_with_version,
            reason=reason,
            user_id=test_user.id,
            background_tasks=BackgroundTasks(),
        )

        assert version.source == expected_source

    @pytest.mark.asyncio
    async def test_restore_reason_maps_to_restoration_source(
        self, db_session, story_with_version, test_user
    ):
        """`reason="restore"` maps to `source="restoration"` and threads
        `source_version` through to both the persisted column and the
        fallback summary text."""
        version = await mint_version_at_boundary(
            db_session,
            story_with_version,
            reason="restore",
            user_id=test_user.id,
            background_tasks=BackgroundTasks(),
            source_version=1,
        )

        assert version.source == "restoration"
        assert version.source_version == 1
        assert version.change_summary == "Restored from version 1"

    @pytest.mark.asyncio
    async def test_unknown_reason_raises_and_persists_nothing(
        self, db_session, story_with_version, test_user
    ):
        """An unrecognized boundary reason raises ValueError rather than
        silently persisting a typo'd value to `story_versions.source`."""
        with pytest.raises(ValueError):
            await mint_version_at_boundary(
                db_session,
                story_with_version,
                reason="not_a_real_boundary_reason",
                user_id=test_user.id,
                background_tasks=BackgroundTasks(),
            )

        versions_result = await db_session.execute(
            select(StoryVersion).where(StoryVersion.story_id == story_with_version.id)
        )
        # Still only the fixture's v1 -- nothing was persisted for the
        # rejected reason.
        assert len(versions_result.scalars().all()) == 1

    @pytest.mark.asyncio
    async def test_background_upgrade_replaces_fallback_summary(
        self, db_session, story_with_version, test_user
    ):
        """When generation returns real text, the post-commit background
        task upgrades the row from the deterministic fallback to the
        generated summary (spec: 'Generation succeeds')."""
        bg = BackgroundTasks()
        version = await mint_version_at_boundary(
            db_session,
            story_with_version,
            reason="session_idle",
            user_id=test_user.id,
            background_tasks=bg,
        )
        await db_session.commit()
        assert version.change_summary == "Manual edit"  # fallback, pre-upgrade

        async def fake_get_db_for_background():
            yield db_session

        with (
            patch(
                "app.services.story_version.get_db_for_background",
                fake_get_db_for_background,
            ),
            patch(
                "app.services.story_version.generate_change_summary",
                AsyncMock(return_value="Rewrote the opening paragraph."),
            ),
        ):
            upgrade_task = next(
                t for t in bg.tasks if t.func.__name__ == "upgrade_change_summary"
            )
            await upgrade_task()

        await db_session.refresh(version)
        assert version.change_summary == "Rewrote the opening paragraph."

    @pytest.mark.asyncio
    async def test_background_upgrade_never_clobbers_changed_summary(
        self, db_session, story_with_version, test_user
    ):
        """The CAS guard: the background upgrade writes only when
        `change_summary` still equals the fallback text captured at mint
        time. Mint a restoration (whose fallback identifies the restored
        version), simulate that summary having since changed -- as a
        concurrent writer would leave it -- then run the upgrade task and
        assert the row is left alone rather than clobbered with generated
        text (spec: 'Restoration summary is preserved')."""
        bg = BackgroundTasks()
        version = await mint_version_at_boundary(
            db_session,
            story_with_version,
            reason="restore",
            user_id=test_user.id,
            background_tasks=bg,
            source_version=1,
        )
        await db_session.commit()
        assert version.change_summary == "Restored from version 1"

        # Simulate the summary having changed since mint time. The upgrade
        # closure's CAS guard closes over the *original* fallback string
        # ("Restored from version 1"), so this row no longer matches it.
        version.change_summary = "Restored from version 1 (edited by user)"
        await db_session.commit()

        async def fake_get_db_for_background():
            yield db_session

        with (
            patch(
                "app.services.story_version.get_db_for_background",
                fake_get_db_for_background,
            ),
            patch(
                "app.services.story_version.generate_change_summary",
                AsyncMock(return_value="A generated description that must not land."),
            ),
        ):
            upgrade_task = next(
                t for t in bg.tasks if t.func.__name__ == "upgrade_change_summary"
            )
            await upgrade_task()

        await db_session.refresh(version)
        assert version.change_summary == "Restored from version 1 (edited by user)"

    @pytest.mark.asyncio
    async def test_background_closures_survive_originating_session_closing(
        self,
        db_engine,
        db_session,
        story_with_version,
        test_user,
        test_legacy,
    ):
        """The two scheduled background closures must operate on plain
        values (UUIDs, strings) captured at schedule time, not on the
        `story`/`version` ORM instances -- by the time they run in
        production, the request's session is already gone (design.md
        Decision 3 implementation note). Proven by closing the originating
        session before running the scheduled callables against a fresh
        session bound to the same engine, and asserting neither closure
        raises DetachedInstanceError/MissingGreenlet. A test using mocked
        sessions throughout would not catch a regression here."""
        bg = BackgroundTasks()
        version = await mint_version_at_boundary(
            db_session,
            story_with_version,
            reason="session_idle",
            user_id=test_user.id,
            background_tasks=bg,
        )
        version_id = version.id
        story_id = story_with_version.id
        expected_legacy_id = test_legacy.id
        await db_session.commit()

        # Close the originating session -- `story`/`version` are now
        # detached/stale from the closures' point of view, exactly as they
        # would be once the request that scheduled them has responded.
        await db_session.close()

        second_session_maker = async_sessionmaker(
            bind=db_engine,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )

        async def fake_get_db_for_background():
            async with second_session_maker() as session:
                yield session

        with (
            patch(
                "app.services.story_version.get_db_for_background",
                fake_get_db_for_background,
            ),
            patch(
                "app.services.story_version.generate_change_summary",
                AsyncMock(return_value="Generated after the session closed."),
            ),
            patch(
                "app.services.story_version.index_story_chunks",
                AsyncMock(return_value=0),
            ) as mock_index,
        ):
            for task in bg.tasks:
                # Must complete without DetachedInstanceError/MissingGreenlet.
                await task()

        # The upgrade genuinely landed -- verified from a third,
        # independent session, not by reading the (closed) original
        # session's cached objects.
        async with second_session_maker() as verify_session:
            result = await verify_session.execute(
                select(StoryVersion).where(StoryVersion.id == version_id)
            )
            refreshed = result.scalar_one()
            assert refreshed.change_summary == "Generated after the session closed."

        # The reindex closure ran against plain values, not detached ORM
        # instances.
        mock_index.assert_awaited_once()
        _, kwargs = mock_index.call_args
        assert kwargs["story_id"] == story_id
        assert kwargs["legacy_id"] == expected_legacy_id
        assert isinstance(kwargs["content"], str)
