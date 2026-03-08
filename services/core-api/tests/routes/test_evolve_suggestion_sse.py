"""Tests for evolve suggestion SSE event parsing."""

from app.routes.ai import parse_evolve_suggestion, stream_visible_chunks


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

    def test_cleaned_text_has_no_trailing_whitespace(self):
        """Cleaned text should have no leftover whitespace from marker removal."""
        text = "Great story! <<EVOLVE_SUGGEST: Nice memory.>>  "
        cleaned, reason = parse_evolve_suggestion(text)
        assert cleaned == "Great story!"
        assert reason == "Nice memory."

    def test_marker_in_middle_of_text(self):
        """Should handle marker appearing mid-sentence."""
        text = "Part one. <<EVOLVE_SUGGEST: Reason here.>> Part two."
        cleaned, reason = parse_evolve_suggestion(text)
        assert "Part one." in cleaned
        assert "Part two." in cleaned
        assert "<<EVOLVE_SUGGEST" not in cleaned
        assert reason == "Reason here."


class TestVisibleStreamingChunks:
    """Test marker suppression during SSE streaming."""

    def test_hides_marker_split_across_chunks(self):
        """Chunked marker content should never be surfaced to the client."""
        chunks = [
            "Opening sentence. ",
            "<<EVOLVE_SUGGEST:",
            " This should become a story.>>",
            " Closing sentence.",
        ]

        visible_chunks = list(stream_visible_chunks(chunks))

        assert visible_chunks == ["Opening sentence. ", " Closing sentence."]

    def test_preserves_unmarked_chunks(self):
        """Normal responses should stream unchanged."""
        chunks = ["Part one. ", "Part two."]

        visible_chunks = list(stream_visible_chunks(chunks))

        assert visible_chunks == chunks
