"""Tests for story version schemas."""

import pytest
from datetime import datetime, timezone
from uuid import uuid4

from app.schemas.story_version import (
    StoryVersionSummary,
    StoryVersionDetail,
    StoryVersionListResponse,
    BulkDeleteRequest,
)


class TestStoryVersionSummary:
    def test_valid_summary(self):
        summary = StoryVersionSummary(
            version_number=1,
            status="active",
            source="manual_edit",
            source_version=None,
            change_summary="Initial version",
            stale=False,
            created_by=uuid4(),
            created_at=datetime.now(timezone.utc),
        )
        assert summary.version_number == 1
        assert summary.status == "active"

    def test_summary_excludes_content(self):
        """Version list should not include full content."""
        data = {
            "version_number": 1,
            "status": "active",
            "source": "manual_edit",
            "source_version": None,
            "change_summary": "Initial version",
            "stale": False,
            "created_by": uuid4(),
            "created_at": datetime.now(timezone.utc),
        }
        summary = StoryVersionSummary(**data)
        assert not hasattr(summary, "content")
        assert not hasattr(summary, "title")


class TestStoryVersionDetail:
    def test_valid_detail_includes_content(self):
        detail = StoryVersionDetail(
            version_number=1,
            title="My Story",
            content="Full story content here.",
            status="active",
            source="manual_edit",
            source_version=None,
            change_summary="Initial version",
            stale=False,
            created_by=uuid4(),
            created_at=datetime.now(timezone.utc),
        )
        assert detail.title == "My Story"
        assert detail.content == "Full story content here."


class TestBulkDeleteRequest:
    def test_valid_bulk_delete(self):
        req = BulkDeleteRequest(version_numbers=[1, 2, 3])
        assert req.version_numbers == [1, 2, 3]

    def test_empty_list_rejected(self):
        with pytest.raises(Exception):
            BulkDeleteRequest(version_numbers=[])


class TestStoryVersionListResponse:
    def test_includes_warning_field(self):
        resp = StoryVersionListResponse(
            versions=[],
            total=0,
            page=1,
            page_size=20,
            warning="This story has 55 versions. Consider removing old versions you no longer need.",
        )
        assert resp.warning is not None

    def test_warning_is_optional(self):
        resp = StoryVersionListResponse(
            versions=[],
            total=0,
            page=1,
            page_size=20,
        )
        assert resp.warning is None
