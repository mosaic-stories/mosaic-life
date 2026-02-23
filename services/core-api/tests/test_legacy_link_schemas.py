"""Tests for Legacy Link Pydantic schemas."""

import pytest
from datetime import datetime
from uuid import uuid4

from app.schemas.legacy_link import (
    LegacyLinkCreate,
    LegacyLinkRespond,
    LegacyLinkShareCreate,
    LegacyLinkShareModeUpdate,
    LegacyLinkShareResponse,
    LegacyLinkResponse,
)


class TestLegacyLinkCreate:
    def test_valid_create(self):
        data = LegacyLinkCreate(
            target_legacy_id=uuid4(),
            person_id=uuid4(),
        )
        assert data.target_legacy_id is not None
        assert data.person_id is not None

    def test_missing_target_legacy_id(self):
        with pytest.raises(Exception):
            LegacyLinkCreate(person_id=uuid4())  # type: ignore[call-arg]

    def test_missing_person_id(self):
        with pytest.raises(Exception):
            LegacyLinkCreate(target_legacy_id=uuid4())  # type: ignore[call-arg]


class TestLegacyLinkRespond:
    def test_accept(self):
        data = LegacyLinkRespond(action="accept")
        assert data.action == "accept"

    def test_reject(self):
        data = LegacyLinkRespond(action="reject")
        assert data.action == "reject"

    def test_invalid_action(self):
        with pytest.raises(Exception):
            LegacyLinkRespond(action="invalid")  # type: ignore[arg-type]


class TestLegacyLinkShareCreate:
    def test_valid_story_share(self):
        data = LegacyLinkShareCreate(
            resource_type="story",
            resource_id=uuid4(),
        )
        assert data.resource_type == "story"

    def test_valid_media_share(self):
        data = LegacyLinkShareCreate(
            resource_type="media",
            resource_id=uuid4(),
        )
        assert data.resource_type == "media"

    def test_invalid_resource_type(self):
        with pytest.raises(Exception):
            LegacyLinkShareCreate(
                resource_type="invalid",  # type: ignore[arg-type]
                resource_id=uuid4(),
            )


class TestLegacyLinkShareModeUpdate:
    def test_selective(self):
        data = LegacyLinkShareModeUpdate(mode="selective")
        assert data.mode == "selective"

    def test_all(self):
        data = LegacyLinkShareModeUpdate(mode="all")
        assert data.mode == "all"

    def test_invalid_mode(self):
        with pytest.raises(Exception):
            LegacyLinkShareModeUpdate(mode="invalid")  # type: ignore[arg-type]


class TestLegacyLinkResponse:
    def test_from_dict(self):
        now = datetime.now()
        uid = uuid4()
        data = LegacyLinkResponse(
            id=uuid4(),
            person_id=uuid4(),
            requester_legacy_id=uuid4(),
            target_legacy_id=uuid4(),
            status="pending",
            requester_share_mode="selective",
            target_share_mode="selective",
            requested_by=uid,
            responded_by=None,
            requested_at=now,
            responded_at=None,
            revoked_at=None,
        )
        assert data.status == "pending"
        assert data.requester_legacy_name is None
        assert data.person_name is None


class TestLegacyLinkShareResponse:
    def test_from_dict(self):
        now = datetime.now()
        data = LegacyLinkShareResponse(
            id=uuid4(),
            resource_type="story",
            resource_id=uuid4(),
            source_legacy_id=uuid4(),
            shared_at=now,
            shared_by=uuid4(),
        )
        assert data.resource_type == "story"
