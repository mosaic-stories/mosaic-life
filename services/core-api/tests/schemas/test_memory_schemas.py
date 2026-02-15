"""Tests for memory schemas."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.memory import (
    FactResponse,
    FactVisibilityUpdate,
)


class TestFactResponse:
    """Tests for FactResponse schema."""

    def test_valid_fact_response(self):
        """Test creating a valid fact response."""
        fact = FactResponse(
            id=uuid4(),
            legacy_id=uuid4(),
            user_id=uuid4(),
            category="hobby",
            content="Loved fishing",
            visibility="private",
            source_conversation_id=None,
            extracted_at="2026-02-14T00:00:00Z",
            updated_at="2026-02-14T00:00:00Z",
        )
        assert fact.category == "hobby"
        assert fact.visibility == "private"

    def test_fact_response_with_shared_visibility(self):
        """Test shared visibility is accepted."""
        fact = FactResponse(
            id=uuid4(),
            legacy_id=uuid4(),
            user_id=uuid4(),
            category="personality",
            content="Very generous",
            visibility="shared",
            source_conversation_id=uuid4(),
            extracted_at="2026-02-14T00:00:00Z",
            updated_at="2026-02-14T00:00:00Z",
        )
        assert fact.visibility == "shared"


class TestFactVisibilityUpdate:
    """Tests for FactVisibilityUpdate schema."""

    def test_valid_private(self):
        """Test setting visibility to private."""
        update = FactVisibilityUpdate(visibility="private")
        assert update.visibility == "private"

    def test_valid_shared(self):
        """Test setting visibility to shared."""
        update = FactVisibilityUpdate(visibility="shared")
        assert update.visibility == "shared"

    def test_rejects_invalid_visibility(self):
        """Test that invalid visibility values are rejected."""
        with pytest.raises(ValidationError):
            FactVisibilityUpdate(visibility="public")
