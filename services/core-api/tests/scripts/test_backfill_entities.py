from __future__ import annotations

from types import SimpleNamespace

from scripts.backfill_entities import _should_skip_story


class TestShouldSkipStory:
    def test_skips_story_with_blank_content(self) -> None:
        story = SimpleNamespace(status="published", content="   ")

        assert _should_skip_story(story) == "blank_content"

    def test_skips_draft_story(self) -> None:
        story = SimpleNamespace(status="draft", content="Real content")

        assert _should_skip_story(story) == "draft"

    def test_processes_published_story_with_content(self) -> None:
        story = SimpleNamespace(status="published", content="Real content")

        assert _should_skip_story(story) is None
