"""Tests for username validation and generation."""

from app.services.username import generate_username, validate_username


class TestValidateUsername:
    def test_valid_username(self) -> None:
        assert validate_username("joe-smith") is None

    def test_too_short(self) -> None:
        assert validate_username("ab") is not None

    def test_too_long(self) -> None:
        assert validate_username("a" * 31) is not None

    def test_uppercase_rejected(self) -> None:
        assert validate_username("JoeSmith") is not None

    def test_leading_hyphen_rejected(self) -> None:
        assert validate_username("-joe") is not None

    def test_trailing_hyphen_rejected(self) -> None:
        assert validate_username("joe-") is not None

    def test_special_chars_rejected(self) -> None:
        assert validate_username("joe_smith") is not None

    def test_reserved_word_rejected(self) -> None:
        assert validate_username("admin") is not None
        assert validate_username("settings") is not None
        assert validate_username("api") is not None

    def test_spaces_rejected(self) -> None:
        assert validate_username("joe smith") is not None


class TestGenerateUsername:
    def test_generates_from_name(self) -> None:
        username = generate_username("Joe Smith")
        assert username.startswith("joe-smith-")
        assert len(username) <= 30
        assert validate_username(username) is None

    def test_strips_special_chars(self) -> None:
        username = generate_username("Jose O'Brien-Smith")
        assert validate_username(username) is None

    def test_handles_empty_name(self) -> None:
        username = generate_username("")
        assert validate_username(username) is None
        assert len(username) >= 3
