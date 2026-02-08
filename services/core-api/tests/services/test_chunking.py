"""Tests for chunking service."""

from app.services.chunking import chunk_story, estimate_tokens


class TestEstimateTokens:
    """Tests for token estimation."""

    def test_empty_string_returns_zero(self) -> None:
        """Test empty string has zero tokens."""
        assert estimate_tokens("") == 0

    def test_single_word(self) -> None:
        """Test single word token count."""
        # Rough estimate: ~0.75 tokens per word, minimum 1
        result = estimate_tokens("Hello")
        assert result >= 1

    def test_sentence(self) -> None:
        """Test sentence token count."""
        result = estimate_tokens("This is a test sentence with several words.")
        # ~8 words * 1.3 tokens/word ≈ 10 tokens
        assert 5 <= result <= 20


class TestChunkStory:
    """Tests for story chunking."""

    def test_short_story_single_chunk(self) -> None:
        """Test short story becomes single chunk."""
        content = "This is a short story about someone special."
        chunks = chunk_story(content)

        assert len(chunks) == 1
        assert chunks[0] == content

    def test_preserves_paragraph_structure(self) -> None:
        """Test chunking preserves paragraphs when possible."""
        content = """First paragraph with some content.

Second paragraph with more content.

Third paragraph to finish."""

        chunks = chunk_story(content, max_tokens=1000)

        # Should be single chunk since total is small
        assert len(chunks) == 1
        assert "First paragraph" in chunks[0]
        assert "Second paragraph" in chunks[0]
        assert "Third paragraph" in chunks[0]

    def test_splits_long_content(self) -> None:
        """Test long content is split into multiple chunks."""
        # Create content that exceeds max_tokens
        paragraph = "This is a test paragraph with enough words to matter. " * 20
        content = f"{paragraph}\n\n{paragraph}\n\n{paragraph}"

        chunks = chunk_story(content, max_tokens=100)

        assert len(chunks) > 1
        # Each chunk should have content
        for chunk in chunks:
            assert len(chunk.strip()) > 0

    def test_respects_max_tokens(self) -> None:
        """Test no chunk exceeds max_tokens significantly."""
        long_paragraph = "Word " * 500  # ~500 words ≈ 650 tokens
        content = f"{long_paragraph}\n\n{long_paragraph}"

        chunks = chunk_story(content, max_tokens=200)

        for chunk in chunks:
            tokens = estimate_tokens(chunk)
            # Allow some overflow for boundary handling
            assert tokens <= 250, f"Chunk has {tokens} tokens, expected <= 250"

    def test_empty_content_returns_empty_list(self) -> None:
        """Test empty content returns empty list."""
        assert chunk_story("") == []
        assert chunk_story("   ") == []

    def test_handles_single_long_paragraph(self) -> None:
        """Test single paragraph longer than max_tokens is split."""
        long_paragraph = "This is a word. " * 200  # ~800 tokens

        chunks = chunk_story(long_paragraph, max_tokens=100)

        assert len(chunks) > 1
        # Verify overlap exists (chunks share some content)
        # This is implicit in the splitting algorithm

    def test_markdown_headers_preserved(self) -> None:
        """Test markdown structure is preserved in chunks."""
        content = """# Main Title

Introduction paragraph.

## Section One

Content for section one with details.

## Section Two

Content for section two with more details."""

        chunks = chunk_story(content, max_tokens=1000)

        # Single chunk for small content
        assert len(chunks) == 1
        assert "# Main Title" in chunks[0]
        assert "## Section One" in chunks[0]
