"""Tests for elicitation mode augmentation in storytelling adapter."""

from app.config.personas import build_system_prompt


class TestElicitationModePrompt:
    def test_build_prompt_with_elicitation(self) -> None:
        prompt = build_system_prompt(
            persona_id="biographer",
            legacy_name="Papa",
            story_context="",
            facts=None,
            elicitation_mode=True,
            original_story_text="This is the original story about Papa.",
        )

        assert prompt is not None
        assert "ELICITATION MODE" in prompt
        assert "Papa" in prompt
        assert "This is the original story about Papa." in prompt

    def test_build_prompt_without_elicitation(self) -> None:
        prompt = build_system_prompt(
            persona_id="biographer",
            legacy_name="Papa",
            story_context="",
            facts=None,
            elicitation_mode=False,
        )

        assert prompt is not None
        assert "ELICITATION MODE" not in prompt

    def test_elicitation_default_is_false(self) -> None:
        prompt = build_system_prompt(
            persona_id="biographer",
            legacy_name="Papa",
        )

        assert prompt is not None
        assert "ELICITATION MODE" not in prompt
