"""Unit tests for derive_title_from_content (pure function, no DB)."""

from app.services.story import derive_title_from_content


class TestDeriveTitleFromContent:
    """Tests for derive_title_from_content."""

    def test_plain_first_line(self):
        assert derive_title_from_content("Hello world.\n\nMore text.") == "Hello world."

    def test_skips_leading_blank_lines(self):
        content = "\n\n   \nThe real first line.\n\nSecond paragraph."
        assert derive_title_from_content(content) == "The real first line."

    def test_strips_heading_markdown(self):
        assert derive_title_from_content("## A Heading\n\nBody.") == "A Heading"

    def test_strips_bold_and_italic(self):
        assert (
            derive_title_from_content("This is **bold** and _italic_ text.")
            == "This is bold and italic text."
        )

    def test_strips_links_keeping_text(self):
        assert (
            derive_title_from_content("Check [this link](https://example.com) out.")
            == "Check this link out."
        )

    def test_strips_images(self):
        assert derive_title_from_content("![alt text](https://example.com/x.png)") == ""

    def test_strips_inline_code(self):
        assert (
            derive_title_from_content("Run `npm install` first.")
            == "Run npm install first."
        )

    def test_strips_blockquote_marker(self):
        assert (
            derive_title_from_content("> A quoted opening line.")
            == "A quoted opening line."
        )

    def test_strips_horizontal_rule_line(self):
        assert (
            derive_title_from_content("---\n\nActual first line.")
            == "Actual first line."
        )

    def test_truncates_on_word_boundary(self):
        content = "I remember the lunch we had at the lake that summer with everyone."
        title = derive_title_from_content(content)
        assert len(title) <= 60
        assert title == "I remember the lunch we had at the lake that summer with"

    def test_truncates_long_word_without_boundary(self):
        content = "a" * 100
        title = derive_title_from_content(content)
        assert title == "a" * 60

    def test_empty_content_returns_empty_string(self):
        assert derive_title_from_content("") == ""

    def test_whitespace_only_content_returns_empty_string(self):
        assert derive_title_from_content("   \n\n   \n") == ""

    def test_no_trailing_ellipsis(self):
        content = (
            "This sentence is intentionally long enough to require truncation for sure."
        )
        title = derive_title_from_content(content)
        assert not title.endswith("...")
