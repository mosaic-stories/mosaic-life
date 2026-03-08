"""Tests for evolve suggestion SSE event parsing."""

from app.routes.ai import parse_evolve_suggestion


class TestParseEvolveSuggestion:
    """Test parse_evolve_suggestion function."""

    def test_extracts_marker(self):
        """Should extract marker and return cleaned text + reason."""
        text = (
            "That's a beautiful memory. "
            "<<EVOLVE_SUGGEST: This memory about your grandfather's workshop "
            "sounds like a wonderful story.>> Tell me more."
        )
        cleaned, reason = parse_evolve_suggestion(text)
        assert "<<EVOLVE_SUGGEST" not in cleaned
        assert "grandfather's workshop" in reason
        assert "beautiful memory" in cleaned
        assert "Tell me more" in cleaned

    def test_no_marker(self):
        """Should return original text and None reason when no marker."""
        text = "That's a nice story about your grandmother."
        cleaned, reason = parse_evolve_suggestion(text)
        assert cleaned == text
        assert reason is None

    def test_handles_multiline(self):
        """Should handle marker at end of response."""
        text = (
            "What a touching memory.\n\n"
            "<<EVOLVE_SUGGEST: This deserves to be preserved as a story.>>"
        )
        cleaned, reason = parse_evolve_suggestion(text)
        assert reason == "This deserves to be preserved as a story."
        assert "<<EVOLVE_SUGGEST" not in cleaned
