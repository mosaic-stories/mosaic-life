"""Tests for MemberProfileUpdate character_traits validation."""

import pytest
from pydantic import ValidationError

from app.schemas.member_profile import MemberProfileUpdate


def _make(**kwargs: object) -> MemberProfileUpdate:
    """Build a MemberProfileUpdate via model_validate to satisfy mypy."""
    return MemberProfileUpdate.model_validate(kwargs)


class TestCharacterTraitsValidation:
    """Tests for the character_traits field validator on MemberProfileUpdate."""

    def test_none_is_accepted(self) -> None:
        profile = _make(character_traits=None)
        assert profile.character_traits is None

    def test_omitted_defaults_to_none(self) -> None:
        profile = _make()
        assert profile.character_traits is None

    def test_valid_traits_accepted(self) -> None:
        traits = ["kind", "generous", "witty"]
        profile = _make(character_traits=traits)
        assert profile.character_traits == traits

    def test_empty_list_accepted(self) -> None:
        profile = _make(character_traits=[])
        assert profile.character_traits == []

    def test_exactly_20_traits_accepted(self) -> None:
        traits = [f"trait_{i}" for i in range(20)]
        profile = _make(character_traits=traits)
        assert profile.character_traits is not None
        assert len(profile.character_traits) == 20

    def test_more_than_20_traits_raises(self) -> None:
        traits = [f"trait_{i}" for i in range(21)]
        with pytest.raises(
            ValidationError, match="Maximum 20 character traits allowed"
        ):
            _make(character_traits=traits)

    def test_empty_string_trait_raises(self) -> None:
        with pytest.raises(ValidationError, match="Character traits must not be empty"):
            _make(character_traits=["kind", ""])

    def test_whitespace_only_trait_raises(self) -> None:
        with pytest.raises(ValidationError, match="Character traits must not be empty"):
            _make(character_traits=["   "])

    def test_trait_exactly_100_chars_accepted(self) -> None:
        trait = "a" * 100
        profile = _make(character_traits=[trait])
        assert profile.character_traits == [trait]

    def test_trait_over_100_chars_raises(self) -> None:
        trait = "a" * 101
        with pytest.raises(
            ValidationError, match="Each character trait must be 100 characters or less"
        ):
            _make(character_traits=[trait])
