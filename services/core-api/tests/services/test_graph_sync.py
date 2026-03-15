"""Tests for graph sync utilities."""

import pytest

from app.services.graph_sync import (
    categorize_relationship,
    classify_story_person_edge,
    normalize_person_id,
)


class TestCategorizeRelationship:
    """Map relationship_type strings to graph edge labels."""

    @pytest.mark.parametrize(
        "relationship_type,expected",
        [
            ("parent", "FAMILY_OF"),
            ("child", "FAMILY_OF"),
            ("spouse", "FAMILY_OF"),
            ("sibling", "FAMILY_OF"),
            ("grandparent", "FAMILY_OF"),
            ("grandchild", "FAMILY_OF"),
            ("aunt", "FAMILY_OF"),
            ("uncle", "FAMILY_OF"),
            ("cousin", "FAMILY_OF"),
            ("niece", "FAMILY_OF"),
            ("nephew", "FAMILY_OF"),
            ("in_law", "FAMILY_OF"),
            ("colleague", "WORKED_WITH"),
            ("mentor", "WORKED_WITH"),
            ("mentee", "WORKED_WITH"),
            ("friend", "FRIENDS_WITH"),
            ("neighbor", "FRIENDS_WITH"),
            ("caregiver", "KNEW"),
            ("other", "KNEW"),
            ("unknown_value", "KNEW"),
        ],
    )
    def test_maps_correctly(self, relationship_type: str, expected: str) -> None:
        assert categorize_relationship(relationship_type) == expected

    def test_none_returns_knew(self) -> None:
        assert categorize_relationship(None) == "KNEW"


class TestNormalizePersonId:
    """Build deterministic person node IDs."""

    def test_from_name_and_legacy(self) -> None:
        result = normalize_person_id("Uncle Jim", "abc-123")
        assert result == "person-uncle-jim-abc-123"

    def test_strips_extra_whitespace(self) -> None:
        result = normalize_person_id("  John   Doe  ", "abc-123")
        assert result == "person-john-doe-abc-123"


class TestClassifyStoryPersonEdge:
    """Determine WRITTEN_ABOUT vs MENTIONS."""

    def test_name_in_title_returns_written_about(self) -> None:
        assert (
            classify_story_person_edge("Grandma Rose", "Remembering Grandma Rose", 0.8)
            == "WRITTEN_ABOUT"
        )

    def test_high_confidence_returns_written_about(self) -> None:
        assert (
            classify_story_person_edge("Jim", "A day at the park", 0.95)
            == "WRITTEN_ABOUT"
        )

    def test_low_confidence_returns_mentions(self) -> None:
        assert (
            classify_story_person_edge("Jim", "A day at the park", 0.75) == "MENTIONS"
        )

    def test_partial_name_match_in_title(self) -> None:
        assert (
            classify_story_person_edge("Rose", "Remembering Grandma Rose", 0.7)
            == "WRITTEN_ABOUT"
        )
