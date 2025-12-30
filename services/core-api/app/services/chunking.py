"""Service for chunking story content into embeddable segments."""

import logging
import re

logger = logging.getLogger(__name__)

# Default chunking parameters
DEFAULT_MAX_TOKENS = 500
DEFAULT_OVERLAP_TOKENS = 50
CHARS_PER_TOKEN = 4  # Rough estimate for English text


def estimate_tokens(text: str) -> int:
    """Estimate token count for text.

    Uses character-based estimation. For production accuracy,
    consider using tiktoken or the actual tokenizer.

    Args:
        text: Text to estimate tokens for.

    Returns:
        Estimated token count.
    """
    if not text:
        return 0
    # Rough estimate: ~4 characters per token for English
    return max(1, len(text) // CHARS_PER_TOKEN)


def chunk_story(
    content: str,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    overlap_tokens: int = DEFAULT_OVERLAP_TOKENS,
) -> list[str]:
    """Split story content into chunks for embedding.

    Strategy:
    1. Split by paragraphs (double newline)
    2. Merge small paragraphs until approaching max_tokens
    3. Split oversized paragraphs with overlap

    Args:
        content: Story content (markdown text).
        max_tokens: Maximum tokens per chunk.
        overlap_tokens: Token overlap when splitting large paragraphs.

    Returns:
        List of content chunks.
    """
    if not content or not content.strip():
        return []

    # Split by paragraphs (double newline, preserving markdown structure)
    paragraphs = re.split(r"\n\n+", content.strip())
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    if not paragraphs:
        return []

    chunks: list[str] = []
    current_chunk = ""

    for paragraph in paragraphs:
        paragraph_tokens = estimate_tokens(paragraph)

        # If single paragraph exceeds max, split it
        if paragraph_tokens > max_tokens:
            # First, save any accumulated content
            if current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = ""

            # Split the large paragraph
            split_chunks = _split_large_paragraph(paragraph, max_tokens, overlap_tokens)
            chunks.extend(split_chunks)
            continue

        # Check if adding this paragraph exceeds max
        combined = f"{current_chunk}\n\n{paragraph}" if current_chunk else paragraph
        combined_tokens = estimate_tokens(combined)

        if combined_tokens <= max_tokens:
            current_chunk = combined
        else:
            # Save current chunk and start new one
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = paragraph

    # Don't forget the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())

    logger.debug(
        "chunking.complete",
        extra={
            "input_length": len(content),
            "chunk_count": len(chunks),
            "max_tokens": max_tokens,
        },
    )

    return chunks


def _split_large_paragraph(
    paragraph: str,
    max_tokens: int,
    overlap_tokens: int,
) -> list[str]:
    """Split a large paragraph into smaller chunks with overlap.

    Args:
        paragraph: Paragraph text to split.
        max_tokens: Maximum tokens per chunk.
        overlap_tokens: Token overlap between chunks.

    Returns:
        List of paragraph segments.
    """
    # Split by sentences for cleaner breaks
    sentences = re.split(r"(?<=[.!?])\s+", paragraph)

    chunks: list[str] = []
    current_chunk = ""
    overlap_buffer = ""

    for sentence in sentences:
        combined = f"{current_chunk} {sentence}".strip() if current_chunk else sentence
        combined_tokens = estimate_tokens(combined)

        if combined_tokens <= max_tokens:
            current_chunk = combined
        else:
            if current_chunk:
                chunks.append(current_chunk)
                # Keep last part for overlap
                overlap_buffer = _get_overlap_text(current_chunk, overlap_tokens)

            # Start new chunk with overlap
            current_chunk = (
                f"{overlap_buffer} {sentence}".strip() if overlap_buffer else sentence
            )

            # If single sentence is too long, force split by characters
            if estimate_tokens(current_chunk) > max_tokens:
                forced_chunks = _force_split(current_chunk, max_tokens, overlap_tokens)
                chunks.extend(forced_chunks[:-1])
                current_chunk = forced_chunks[-1] if forced_chunks else ""

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def _get_overlap_text(text: str, overlap_tokens: int) -> str:
    """Get the last N tokens worth of text for overlap.

    Args:
        text: Source text.
        overlap_tokens: Number of tokens to extract.

    Returns:
        Overlap text from end of source.
    """
    overlap_chars = overlap_tokens * CHARS_PER_TOKEN
    if len(text) <= overlap_chars:
        return text
    return text[-overlap_chars:]


def _force_split(text: str, max_tokens: int, overlap_tokens: int) -> list[str]:
    """Force split text by character count when no natural breaks exist.

    Args:
        text: Text to split.
        max_tokens: Maximum tokens per chunk.
        overlap_tokens: Token overlap between chunks.

    Returns:
        List of text segments.
    """
    max_chars = max_tokens * CHARS_PER_TOKEN
    overlap_chars = overlap_tokens * CHARS_PER_TOKEN

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = min(start + max_chars, len(text))

        # Try to break at word boundary
        if end < len(text):
            space_idx = text.rfind(" ", start, end)
            if space_idx > start:
                end = space_idx

        chunks.append(text[start:end].strip())
        start = end - overlap_chars if end < len(text) else end

    return chunks
