"""Tests for story prompt schemas."""

import pytest
from pydantic import ValidationError
from app.schemas.story_prompt import StoryPromptResponse, ActOnPromptRequest


def test_story_prompt_response_valid():
    """StoryPromptResponse accepts valid data."""
    resp = StoryPromptResponse(
        id="00000000-0000-0000-0000-000000000001",
        legacy_id="00000000-0000-0000-0000-000000000002",
        legacy_name="Karen Marie Hewitt",
        prompt_text="What's a favorite meal you shared with Karen?",
        category="meals_traditions",
        created_at="2026-03-08T12:00:00Z",
    )
    assert resp.legacy_name == "Karen Marie Hewitt"


def test_act_on_prompt_request_valid_actions():
    """ActOnPromptRequest accepts write_story and discuss."""
    req1 = ActOnPromptRequest(action="write_story")
    assert req1.action == "write_story"
    req2 = ActOnPromptRequest(action="discuss")
    assert req2.action == "discuss"


def test_act_on_prompt_request_invalid_action():
    """ActOnPromptRequest rejects invalid actions."""
    with pytest.raises(ValidationError):
        ActOnPromptRequest(action="invalid")
