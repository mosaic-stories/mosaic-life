"""Prompt template configuration loader."""

import logging
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent / "prompt_templates.yaml"

_categories: dict[str, Any] | None = None


def load_prompt_templates() -> dict[str, Any]:
    """Load prompt template categories from YAML config.

    Returns cached result after first load.
    """
    global _categories  # noqa: PLW0603

    if _categories is not None:
        return _categories

    with open(CONFIG_PATH) as f:
        config: dict[str, Any] = yaml.safe_load(f)

    _categories = config.get("categories", {})
    logger.info(
        "prompt_templates.loaded",
        extra={"category_count": len(_categories)},
    )
    return _categories


def get_all_templates() -> list[tuple[str, dict[str, str]]]:
    """Return flat list of (category_id, template_dict) tuples."""
    categories = load_prompt_templates()
    result: list[tuple[str, dict[str, str]]] = []
    for cat_id, cat in categories.items():
        for tmpl in cat.get("templates", []):
            result.append((cat_id, tmpl))
    return result


def get_templates_by_category(category_id: str) -> list[dict[str, str]]:
    """Return templates for a specific category, or empty list if not found."""
    categories = load_prompt_templates()
    cat = categories.get(category_id)
    if not cat:
        return []
    return list(cat.get("templates", []))
