"""Tests for story prompts service — template selection logic."""

import pytest

from app.services.story_prompts import (
    ROTATION_HOURS,
    render_prompt_text,
    select_template,
)


def test_render_prompt_text_substitutes_name() -> None:
    """render_prompt_text replaces {name} with legacy name."""
    result = render_prompt_text(
        "What's a favorite meal you shared with {name}?", "Karen"
    )
    assert result == "What's a favorite meal you shared with Karen?"


def test_render_prompt_text_handles_multiple_placeholders() -> None:
    """render_prompt_text replaces all occurrences of {name}."""
    result = render_prompt_text(
        "{name} loved to cook. Did {name} have a signature dish?", "Karen"
    )
    assert result == "Karen loved to cook. Did Karen have a signature dish?"


def test_rotation_hours_is_24() -> None:
    """Default rotation period is 24 hours."""
    assert ROTATION_HOURS == 24


@pytest.mark.asyncio
async def test_select_template_avoids_used() -> None:
    """select_template excludes previously used template_ids."""
    used_ids = {"meals_001", "meals_002", "meals_003", "lessons_001"}
    result = select_template(used_ids)
    assert result is not None
    category, template = result
    assert template["id"] not in used_ids


@pytest.mark.asyncio
async def test_select_template_returns_none_when_all_exhausted() -> None:
    """select_template returns None when every template has been used."""
    from app.config.prompt_templates import get_all_templates

    all_ids = {tmpl["id"] for _, tmpl in get_all_templates()}
    result = select_template(all_ids)
    assert result is None
