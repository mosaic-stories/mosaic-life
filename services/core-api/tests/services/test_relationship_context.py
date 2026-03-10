"""Tests for relationship context formatter."""

from app.schemas.member_profile import MemberProfileResponse
from app.services.relationship_context import format_relationship_context


class TestFormatRelationshipContext:
    def test_returns_empty_string_when_profile_is_none(self) -> None:
        result = format_relationship_context(None, "Jane Smith")
        assert result == ""

    def test_returns_empty_string_when_all_fields_empty(self) -> None:
        profile = MemberProfileResponse()
        result = format_relationship_context(profile, "Jane Smith")
        assert result == ""

    def test_formats_nicknames_with_possessive_framing(self) -> None:
        profile = MemberProfileResponse(nicknames=["Mom"])
        result = format_relationship_context(profile, "Jane Smith")
        assert "your Mom" in result
        assert '"Mom"' in result
        assert "Jane Smith" in result

    def test_formats_multiple_nicknames(self) -> None:
        profile = MemberProfileResponse(nicknames=["Mom", "Mama", "Ma"])
        result = format_relationship_context(profile, "Jane Smith")
        assert '"Mom"' in result
        assert '"Mama"' in result
        assert '"Ma"' in result

    def test_formats_relationship_type(self) -> None:
        profile = MemberProfileResponse(relationship_type="parent")
        result = format_relationship_context(profile, "Jane Smith")
        assert "Relationship: parent" in result

    def test_formats_legacy_to_viewer(self) -> None:
        profile = MemberProfileResponse(
            legacy_to_viewer="The strongest woman I ever knew."
        )
        result = format_relationship_context(profile, "Jane Smith")
        assert "The strongest woman I ever knew." in result
        assert "Jane Smith is to them" in result

    def test_formats_viewer_to_legacy(self) -> None:
        profile = MemberProfileResponse(viewer_to_legacy="Her youngest child.")
        result = format_relationship_context(profile, "Jane Smith")
        assert "Her youngest child." in result
        assert "they are to Jane Smith" in result

    def test_formats_character_traits(self) -> None:
        profile = MemberProfileResponse(
            character_traits=["warm", "stubborn", "resilient"]
        )
        result = format_relationship_context(profile, "Jane Smith")
        assert "warm, stubborn, resilient" in result

    def test_formats_all_fields(self) -> None:
        profile = MemberProfileResponse(
            relationship_type="parent",
            nicknames=["Mom"],
            legacy_to_viewer="The strongest woman I ever knew.",
            viewer_to_legacy="Her youngest child.",
            character_traits=["warm", "stubborn"],
        )
        result = format_relationship_context(profile, "Jane Smith")
        assert "## Your Relationship with Jane Smith" in result
        assert "Relationship: parent" in result
        assert '"Mom"' in result
        assert "your Mom" in result
        assert "The strongest woman I ever knew." in result
        assert "Her youngest child." in result
        assert "warm, stubborn" in result

    def test_omits_empty_nicknames_list(self) -> None:
        profile = MemberProfileResponse(nicknames=[], relationship_type="friend")
        result = format_relationship_context(profile, "Jane Smith")
        assert "nickname" not in result.lower()
        assert "Relationship: friend" in result

    def test_omits_empty_character_traits_list(self) -> None:
        profile = MemberProfileResponse(character_traits=[], relationship_type="friend")
        result = format_relationship_context(profile, "Jane Smith")
        assert "describes" not in result.lower()
        assert "Relationship: friend" in result

    def test_header_always_present_when_content_exists(self) -> None:
        profile = MemberProfileResponse(relationship_type="sibling")
        result = format_relationship_context(profile, "Bob")
        assert "## Your Relationship with Bob" in result
