"""Tests for StoryPrompt model."""

from app.models.story_prompt import StoryPrompt


def test_story_prompt_model_exists():
    """StoryPrompt model can be imported and has expected table name."""
    assert StoryPrompt.__tablename__ == "story_prompts"


def test_story_prompt_has_required_columns():
    """StoryPrompt model has all expected columns."""
    columns = {c.name for c in StoryPrompt.__table__.columns}
    expected = {
        "id",
        "user_id",
        "legacy_id",
        "template_id",
        "prompt_text",
        "category",
        "status",
        "created_at",
        "acted_on_at",
        "story_id",
        "conversation_id",
    }
    assert expected.issubset(columns), f"Missing columns: {expected - columns}"


def test_story_prompt_status_default():
    """StoryPrompt defaults to active status."""
    prompt = StoryPrompt(
        user_id="00000000-0000-0000-0000-000000000001",
        legacy_id="00000000-0000-0000-0000-000000000002",
        template_id="meals_001",
        prompt_text="Test prompt",
        category="meals_traditions",
    )
    assert prompt.status == "active"
