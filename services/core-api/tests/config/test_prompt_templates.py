"""Tests for prompt template configuration loader."""

import pytest
from app.config.prompt_templates import (
    load_prompt_templates,
    get_all_templates,
    get_templates_by_category,
)


@pytest.fixture(autouse=True)
def _reset_cache() -> None:  # type: ignore[misc]
    """Reset module-level cache between tests."""
    import app.config.prompt_templates as mod

    mod._categories = None
    yield  # type: ignore[misc]
    mod._categories = None


def test_load_prompt_templates_returns_categories() -> None:
    """Templates load from YAML and contain expected categories."""
    categories = load_prompt_templates()
    assert len(categories) > 0
    assert "meals_traditions" in categories
    assert "life_lessons" in categories


def test_each_template_has_required_fields() -> None:
    """Every template has id and text fields."""
    categories = load_prompt_templates()
    for cat_id, cat in categories.items():
        assert "label" in cat, f"Category {cat_id} missing label"
        assert "templates" in cat, f"Category {cat_id} missing templates"
        for tmpl in cat["templates"]:
            assert "id" in tmpl, f"Template in {cat_id} missing id"
            assert "text" in tmpl, f"Template in {cat_id} missing text"
            assert "{name}" in tmpl["text"], (
                f"Template {tmpl['id']} missing {{name}} placeholder"
            )


def test_template_ids_are_unique() -> None:
    """All template IDs across all categories are unique."""
    categories = load_prompt_templates()
    ids = []
    for cat in categories.values():
        for tmpl in cat["templates"]:
            ids.append(tmpl["id"])
    assert len(ids) == len(set(ids)), (
        f"Duplicate template IDs: {[x for x in ids if ids.count(x) > 1]}"
    )


def test_get_all_templates_returns_flat_list() -> None:
    """get_all_templates returns list of (category, template) tuples."""
    templates = get_all_templates()
    assert len(templates) > 0
    cat_id, tmpl = templates[0]
    assert isinstance(cat_id, str)
    assert "id" in tmpl
    assert "text" in tmpl


def test_get_templates_by_category_filters() -> None:
    """get_templates_by_category returns only templates in that category."""
    templates = get_templates_by_category("meals_traditions")
    assert len(templates) > 0
    for tmpl in templates:
        assert tmpl["id"].startswith("meals_")


def test_get_templates_by_category_unknown() -> None:
    """Unknown category returns empty list."""
    templates = get_templates_by_category("nonexistent")
    assert templates == []
