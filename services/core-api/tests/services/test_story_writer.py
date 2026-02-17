"""Tests for StoryWriterAgent."""

import pytest

from app.services.story_writer import StoryWriterAgent, load_style_directive


class TestLoadStyleDirective:
    def test_load_vivid(self) -> None:
        directive = load_style_directive("vivid")
        assert "sensory" in directive.lower() or "vivid" in directive.lower()
        assert len(directive) > 50

    def test_load_emotional(self) -> None:
        directive = load_style_directive("emotional")
        assert len(directive) > 50

    def test_load_all_styles(self) -> None:
        for style in ["vivid", "emotional", "conversational", "concise", "documentary"]:
            directive = load_style_directive(style)
            assert len(directive) > 50

    def test_invalid_style_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_style_directive("nonexistent")


class TestStoryWriterAgent:
    def test_build_system_prompt(self) -> None:
        agent = StoryWriterAgent()
        prompt = agent.build_system_prompt(
            writing_style="vivid",
            length_preference="similar",
            legacy_name="Papa",
            relationship_context="Papa is what the user calls their grandfather.",
            is_revision=False,
        )

        assert "ghostwriter" in prompt.lower()
        assert "Papa" in prompt
        assert "similar" in prompt.lower()
        assert "vivid" in prompt.lower() or "sensory" in prompt.lower()

    def test_build_system_prompt_revision_mode(self) -> None:
        agent = StoryWriterAgent()
        prompt = agent.build_system_prompt(
            writing_style="concise",
            length_preference="shorter",
            legacy_name="Grandma",
            relationship_context="",
            is_revision=True,
        )

        assert "revise" in prompt.lower() or "revision" in prompt.lower()

    def test_build_user_message(self) -> None:
        agent = StoryWriterAgent()
        message = agent.build_user_message(
            original_story="The original story content.",
            summary_text="## New Details\n- Uncle Ray was present",
            previous_draft=None,
            revision_instructions=None,
        )

        assert "original story" in message.lower() or "Original Story" in message
        assert "The original story content." in message
        assert "Uncle Ray" in message

    def test_build_user_message_revision(self) -> None:
        agent = StoryWriterAgent()
        message = agent.build_user_message(
            original_story="The original story content.",
            summary_text="## New Details\n- Detail",
            previous_draft="Previous draft text here.",
            revision_instructions="Make it longer",
        )

        assert "Previous draft text here." in message
        assert "Make it longer" in message
