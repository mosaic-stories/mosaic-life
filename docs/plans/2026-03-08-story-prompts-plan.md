# Story Prompts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Story Prompts feature to the dashboard that surfaces conversation-starting prompts bound to a user's recently-interacted legacy, with "Write a Story" (Evolve workspace) and "Discuss" (Legacy AI Chat tab) actions.

**Architecture:** YAML config holds categorized prompt templates (following personas.yaml pattern). Backend service selects a template, renders it with the legacy name, persists to a `story_prompts` table, and exposes 3 endpoints. Frontend fetches the current prompt and renders a themed card on the dashboard. "Write a Story" reuses the existing evolve_conversation flow. "Discuss" seeds a conversation on the Legacy AI Chat tab.

**Tech Stack:** Python/FastAPI, SQLAlchemy 2.x, Alembic, YAML config, React/TypeScript, TanStack Query, React Router

**Design Doc:** `docs/plans/2026-03-08-story-prompts-design.md`

**Status: COMPLETE** (implemented 2026-03-08)

| Task | Status | Commit |
|------|--------|--------|
| Task 1: Prompt Templates YAML Config + Loader | Done | 321abf0 |
| Task 2: StoryPrompt Database Model + Migration | Done | 321abf0 |
| Task 3: Pydantic Schemas for Story Prompts | Done | 321abf0 |
| Task 4: Story Prompts Service Layer | Done | 46a5b96 |
| Task 5: Story Prompts API Routes | Done | 46a5b96 |
| Task 6: Frontend API Client + Hook | Done | 659a279 |
| Task 7: StoryPromptCard Component | Done | 659a279 |
| Task 8: Dashboard Integration | Done | 659a279 |
| Task 9: Legacy Profile Tab Navigation | Done | 6a6f76a |
| Task 10: Seed Conversation After Navigation | Done | 6a6f76a |
| Task 11: Backend Validation + Final Cleanup | Done | (all clean) |
| Task 12: Integration Test — Full Flow | Done | 4305ea7 |

**Validation:** 964 backend tests pass, 6 integration tests pass, TypeScript compiles clean, ruff + mypy clean.

---

## Task 1: Prompt Templates YAML Config + Loader

**Files:**
- Create: `services/core-api/app/config/prompt_templates.yaml`
- Create: `services/core-api/app/config/prompt_templates.py`
- Test: `services/core-api/tests/unit/config/test_prompt_templates.py`

**Step 1: Write the failing test**

```python
# services/core-api/tests/unit/config/test_prompt_templates.py
"""Tests for prompt template configuration loader."""

import pytest
from app.config.prompt_templates import load_prompt_templates, get_all_templates, get_templates_by_category


def test_load_prompt_templates_returns_categories():
    """Templates load from YAML and contain expected categories."""
    categories = load_prompt_templates()
    assert len(categories) > 0
    assert "meals_traditions" in categories
    assert "life_lessons" in categories


def test_each_template_has_required_fields():
    """Every template has id and text fields."""
    categories = load_prompt_templates()
    for cat_id, cat in categories.items():
        assert "label" in cat, f"Category {cat_id} missing label"
        assert "templates" in cat, f"Category {cat_id} missing templates"
        for tmpl in cat["templates"]:
            assert "id" in tmpl, f"Template in {cat_id} missing id"
            assert "text" in tmpl, f"Template in {cat_id} missing text"
            assert "{name}" in tmpl["text"], f"Template {tmpl['id']} missing {{name}} placeholder"


def test_template_ids_are_unique():
    """All template IDs across all categories are unique."""
    categories = load_prompt_templates()
    ids = []
    for cat in categories.values():
        for tmpl in cat["templates"]:
            ids.append(tmpl["id"])
    assert len(ids) == len(set(ids)), f"Duplicate template IDs: {[x for x in ids if ids.count(x) > 1]}"


def test_get_all_templates_returns_flat_list():
    """get_all_templates returns list of (category, template) tuples."""
    templates = get_all_templates()
    assert len(templates) > 0
    cat_id, tmpl = templates[0]
    assert isinstance(cat_id, str)
    assert "id" in tmpl
    assert "text" in tmpl


def test_get_templates_by_category_filters():
    """get_templates_by_category returns only templates in that category."""
    templates = get_templates_by_category("meals_traditions")
    assert len(templates) > 0
    for tmpl in templates:
        assert tmpl["id"].startswith("meals_")


def test_get_templates_by_category_unknown():
    """Unknown category returns empty list."""
    templates = get_templates_by_category("nonexistent")
    assert templates == []
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/config/test_prompt_templates.py -v`
Expected: FAIL — module not found

**Step 3: Create the YAML config**

```yaml
# services/core-api/app/config/prompt_templates.yaml
categories:
  meals_traditions:
    label: "Meals & Traditions"
    templates:
      - id: "meals_001"
        text: "What's a favorite meal or tradition you shared with {name}?"
      - id: "meals_002"
        text: "Did {name} have a signature dish or recipe they were known for?"
      - id: "meals_003"
        text: "Was there a holiday tradition that {name} always looked forward to?"
  life_lessons:
    label: "Life Lessons"
    templates:
      - id: "lessons_001"
        text: "What's the best piece of advice {name} ever gave you?"
      - id: "lessons_002"
        text: "Was there a moment when {name} taught you something without saying a word?"
      - id: "lessons_003"
        text: "What value or principle did {name} live by that you most admire?"
  funny_moments:
    label: "Funny Moments"
    templates:
      - id: "funny_001"
        text: "What's a story about {name} that always makes you laugh?"
      - id: "funny_002"
        text: "Did {name} have a favorite joke or saying that everyone remembers?"
  relationships:
    label: "Relationships"
    templates:
      - id: "rel_001"
        text: "How did you first meet {name}, and what was your earliest impression?"
      - id: "rel_002"
        text: "Who was {name}'s closest friend, and what made that bond special?"
  milestones:
    label: "Milestones"
    templates:
      - id: "mile_001"
        text: "What's a proud moment in {name}'s life that deserves to be remembered?"
      - id: "mile_002"
        text: "Was there a turning point in {name}'s life that shaped who they became?"
  passions:
    label: "Passions & Hobbies"
    templates:
      - id: "passions_001"
        text: "What was {name} most passionate about, and how did they share that passion?"
      - id: "passions_002"
        text: "Did {name} have a hobby or interest that surprised people?"
```

**Step 4: Write the config loader**

```python
# services/core-api/app/config/prompt_templates.py
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
    global _categories

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
```

**Step 5: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/config/test_prompt_templates.py -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add services/core-api/app/config/prompt_templates.yaml services/core-api/app/config/prompt_templates.py services/core-api/tests/unit/config/test_prompt_templates.py
git commit -m "feat: add prompt template YAML config and loader"
```

---

## Task 2: StoryPrompt Database Model + Migration

**Files:**
- Create: `services/core-api/app/models/story_prompt.py`
- Modify: `services/core-api/app/models/__init__.py` — add StoryPrompt import
- Modify: `services/core-api/alembic/env.py` — add StoryPrompt import
- Create: Alembic migration via autogenerate
- Test: `services/core-api/tests/unit/models/test_story_prompt.py`

**Step 1: Write the failing test**

```python
# services/core-api/tests/unit/models/test_story_prompt.py
"""Tests for StoryPrompt model."""

from app.models.story_prompt import StoryPrompt


def test_story_prompt_model_exists():
    """StoryPrompt model can be imported and has expected table name."""
    assert StoryPrompt.__tablename__ == "story_prompts"


def test_story_prompt_has_required_columns():
    """StoryPrompt model has all expected columns."""
    columns = {c.name for c in StoryPrompt.__table__.columns}
    expected = {
        "id", "user_id", "legacy_id", "template_id", "prompt_text",
        "category", "status", "created_at", "acted_on_at",
        "story_id", "conversation_id",
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
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/models/test_story_prompt.py -v`
Expected: FAIL — cannot import StoryPrompt

**Step 3: Write the model**

Reference pattern: `services/core-api/app/models/story.py`, `services/core-api/app/models/ai.py`

```python
# services/core-api/app/models/story_prompt.py
"""StoryPrompt model for tracking story prompts shown to users."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class StoryPrompt(Base):
    """A story prompt surfaced to a user for a specific legacy."""

    __tablename__ = "story_prompts"

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    legacy_id: Mapped[UUID] = mapped_column(
        ForeignKey("legacies.id", ondelete="CASCADE"),
        index=True,
    )
    template_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    prompt_text: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
    )
    acted_on_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
    )
    story_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"),
        nullable=True,
    )
    conversation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="SET NULL"),
        nullable=True,
    )
```

**Step 4: Register the model**

Add to `services/core-api/app/models/__init__.py`:
- Import: `from .story_prompt import StoryPrompt`
- Add `"StoryPrompt"` to `__all__`

Add to `services/core-api/alembic/env.py`:
- Add `StoryPrompt` to the import list

**Step 5: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/models/test_story_prompt.py -v`
Expected: All PASS

**Step 6: Generate and apply migration**

```bash
cd /apps/mosaic-life/services/core-api
uv run alembic revision --autogenerate -m "add story_prompts table"
```

Review the generated migration, then apply:

```bash
docker compose -f /apps/mosaic-life/infra/compose/docker-compose.yml exec core-api uv run alembic upgrade head
```

**Step 7: Commit**

```bash
git add services/core-api/app/models/story_prompt.py services/core-api/app/models/__init__.py services/core-api/alembic/env.py services/core-api/alembic/versions/
git commit -m "feat: add story_prompts database model and migration"
```

---

## Task 3: Pydantic Schemas for Story Prompts

**Files:**
- Create: `services/core-api/app/schemas/story_prompt.py`
- Test: `services/core-api/tests/unit/schemas/test_story_prompt.py`

**Step 1: Write the failing test**

```python
# services/core-api/tests/unit/schemas/test_story_prompt.py
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
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/schemas/test_story_prompt.py -v`
Expected: FAIL — cannot import schemas

**Step 3: Write the schemas**

Reference pattern: `services/core-api/app/schemas/ai.py`

```python
# services/core-api/app/schemas/story_prompt.py
"""Pydantic schemas for story prompts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class StoryPromptResponse(BaseModel):
    """Response schema for a story prompt."""

    id: str
    legacy_id: str
    legacy_name: str
    prompt_text: str
    category: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ActOnPromptRequest(BaseModel):
    """Request to act on a prompt."""

    action: Literal["write_story", "discuss"]


class ActOnPromptResponse(BaseModel):
    """Response after acting on a prompt."""

    action: str
    legacy_id: str
    story_id: str | None = None
    conversation_id: str | None = None
```

**Step 4: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/schemas/test_story_prompt.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/schemas/story_prompt.py services/core-api/tests/unit/schemas/test_story_prompt.py
git commit -m "feat: add Pydantic schemas for story prompts"
```

---

## Task 4: Story Prompts Service Layer

**Files:**
- Create: `services/core-api/app/services/story_prompts.py`
- Test: `services/core-api/tests/unit/services/test_story_prompts.py`

**Step 1: Write the failing tests**

```python
# services/core-api/tests/unit/services/test_story_prompts.py
"""Tests for story prompts service — template selection logic."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.story_prompts import (
    select_template,
    render_prompt_text,
    ROTATION_HOURS,
)


def test_render_prompt_text_substitutes_name():
    """render_prompt_text replaces {name} with legacy name."""
    result = render_prompt_text("What's a favorite meal you shared with {name}?", "Karen")
    assert result == "What's a favorite meal you shared with Karen?"


def test_render_prompt_text_handles_multiple_placeholders():
    """render_prompt_text replaces all occurrences of {name}."""
    result = render_prompt_text("{name} loved to cook. Did {name} have a signature dish?", "Karen")
    assert result == "Karen loved to cook. Did Karen have a signature dish?"


def test_rotation_hours_is_24():
    """Default rotation period is 24 hours."""
    assert ROTATION_HOURS == 24


@pytest.mark.asyncio
async def test_select_template_avoids_used():
    """select_template excludes previously used template_ids."""
    used_ids = {"meals_001", "meals_002", "meals_003", "lessons_001"}
    category, template = select_template(used_ids)
    assert template["id"] not in used_ids


@pytest.mark.asyncio
async def test_select_template_returns_none_when_all_exhausted():
    """select_template returns None when every template has been used."""
    from app.config.prompt_templates import get_all_templates
    all_ids = {tmpl["id"] for _, tmpl in get_all_templates()}
    result = select_template(all_ids)
    assert result is None
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/services/test_story_prompts.py -v`
Expected: FAIL — cannot import

**Step 3: Write the service**

Reference patterns: `services/core-api/app/services/ai.py` (evolve_conversation at line 712), `services/core-api/app/services/story_evolution.py` (start_session at line 80)

```python
# services/core-api/app/services/story_prompts.py
"""Story prompts service — selection, rotation, and action handling."""

import logging
import random
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.prompt_templates import get_all_templates
from ..models.ai import AIConversation
from ..models.legacy import Legacy, LegacyMember
from ..models.story import Story
from ..models.story_prompt import StoryPrompt
from ..services import ai as ai_service

logger = logging.getLogger(__name__)

ROTATION_HOURS = 24


def render_prompt_text(template_text: str, legacy_name: str) -> str:
    """Substitute {name} placeholder with the legacy's name."""
    return template_text.replace("{name}", legacy_name)


def select_template(
    used_template_ids: set[str],
) -> tuple[str, dict[str, str]] | None:
    """Pick a random unused template, preferring varied categories.

    Returns (category_id, template_dict) or None if all exhausted.
    """
    all_templates = get_all_templates()
    available = [(cat, tmpl) for cat, tmpl in all_templates if tmpl["id"] not in used_template_ids]

    if not available:
        return None

    # Group by category, pick a random category first for variety
    by_category: dict[str, list[tuple[str, dict[str, str]]]] = {}
    for cat, tmpl in available:
        by_category.setdefault(cat, []).append((cat, tmpl))

    chosen_category = random.choice(list(by_category.keys()))
    return random.choice(by_category[chosen_category])


async def select_legacy(db: AsyncSession, user_id: UUID) -> UUID | None:
    """Pick the user's most recently interacted-with legacy.

    Checks recent story updates and conversation activity.
    Falls back to the user's first-created legacy.
    """
    # Most recently updated story by this user
    story_subq = (
        select(Story.id.label("entity_id"), func.max(Story.updated_at).label("last_activity"))
        .join(
            # StoryLegacy to get legacy_id
            __import__("app.models.associations", fromlist=["StoryLegacy"]).StoryLegacy,
            __import__("app.models.associations", fromlist=["StoryLegacy"]).StoryLegacy.story_id == Story.id,
        )
        .where(Story.author_id == user_id)
    )
    # Simpler approach: just query legacy memberships and find most recent activity
    from ..models.associations import StoryLegacy, ConversationLegacy

    # Find legacy with most recent story activity
    story_legacy_q = (
        select(StoryLegacy.legacy_id, func.max(Story.updated_at).label("last_at"))
        .join(Story, Story.id == StoryLegacy.story_id)
        .where(Story.author_id == user_id)
        .group_by(StoryLegacy.legacy_id)
    )

    # Find legacy with most recent conversation activity
    conv_legacy_q = (
        select(ConversationLegacy.legacy_id, func.max(AIConversation.updated_at).label("last_at"))
        .join(AIConversation, AIConversation.id == ConversationLegacy.conversation_id)
        .where(AIConversation.user_id == user_id)
        .group_by(ConversationLegacy.legacy_id)
    )

    # Union and pick the max
    # Simpler: run both queries and merge
    story_result = await db.execute(story_legacy_q)
    conv_result = await db.execute(conv_legacy_q)

    activity: dict[UUID, datetime] = {}
    for row in story_result:
        legacy_id, last_at = row.legacy_id, row.last_at
        if legacy_id not in activity or last_at > activity[legacy_id]:
            activity[legacy_id] = last_at

    for row in conv_result:
        legacy_id, last_at = row.legacy_id, row.last_at
        if legacy_id not in activity or last_at > activity[legacy_id]:
            activity[legacy_id] = last_at

    if activity:
        # Return the legacy with the most recent activity
        return max(activity, key=lambda lid: activity[lid])

    # Fallback: user's first-created legacy
    q = (
        select(LegacyMember.legacy_id)
        .where(LegacyMember.user_id == user_id)
        .order_by(LegacyMember.created_at.asc())
        .limit(1)
    )
    result = await db.execute(q)
    row = result.scalar_one_or_none()
    return row


async def get_used_template_ids(db: AsyncSession, user_id: UUID, legacy_id: UUID) -> set[str]:
    """Get template IDs already used for this user+legacy combination."""
    q = (
        select(StoryPrompt.template_id)
        .where(
            StoryPrompt.user_id == user_id,
            StoryPrompt.legacy_id == legacy_id,
            StoryPrompt.template_id.isnot(None),
        )
    )
    result = await db.execute(q)
    return {row for row in result.scalars()}


async def get_or_create_active_prompt(
    db: AsyncSession, user_id: UUID
) -> StoryPrompt | None:
    """Get the user's current active prompt, or create one.

    Auto-rotates prompts older than ROTATION_HOURS.
    Returns None if user has no legacies.
    """
    # Check for existing active prompt
    q = select(StoryPrompt).where(
        StoryPrompt.user_id == user_id,
        StoryPrompt.status == "active",
    )
    result = await db.execute(q)
    active = result.scalar_one_or_none()

    if active:
        # Check if it needs rotation
        cutoff = datetime.now(timezone.utc) - timedelta(hours=ROTATION_HOURS)
        if active.created_at.replace(tzinfo=timezone.utc) < cutoff:
            active.status = "rotated"
            await db.flush()
        else:
            return active

    # Generate a new prompt
    return await _generate_prompt(db, user_id)


async def _generate_prompt(
    db: AsyncSession,
    user_id: UUID,
    exclude_template_id: str | None = None,
) -> StoryPrompt | None:
    """Generate a new active prompt for the user."""
    legacy_id = await select_legacy(db, user_id)
    if not legacy_id:
        return None

    legacy = await db.get(Legacy, legacy_id)
    if not legacy:
        return None

    used_ids = await get_used_template_ids(db, user_id, legacy_id)
    if exclude_template_id:
        used_ids.add(exclude_template_id)

    selection = select_template(used_ids)
    if not selection:
        # All templates exhausted for this legacy — reset by trying without exclusions
        selection = select_template(set() if not exclude_template_id else {exclude_template_id})
        if not selection:
            return None

    category, template = selection
    prompt_text = render_prompt_text(template["text"], legacy.name)

    prompt = StoryPrompt(
        user_id=user_id,
        legacy_id=legacy_id,
        template_id=template["id"],
        prompt_text=prompt_text,
        category=category,
        status="active",
    )
    db.add(prompt)
    await db.flush()

    logger.info(
        "story_prompt.created",
        extra={
            "user_id": str(user_id),
            "legacy_id": str(legacy_id),
            "template_id": template["id"],
        },
    )
    return prompt


async def shuffle_prompt(
    db: AsyncSession, prompt_id: UUID, user_id: UUID
) -> StoryPrompt | None:
    """Rotate the current prompt and generate a new one."""
    current = await db.get(StoryPrompt, prompt_id)
    if not current or current.user_id != user_id:
        raise HTTPException(status_code=404, detail="Prompt not found")

    old_template_id = current.template_id
    current.status = "rotated"
    await db.flush()

    return await _generate_prompt(db, user_id, exclude_template_id=old_template_id)


async def act_on_prompt(
    db: AsyncSession,
    prompt_id: UUID,
    action: str,
    user_id: UUID,
) -> dict:
    """Handle user action on a prompt — write_story or discuss.

    write_story: Reuses evolve_conversation flow to create draft + session.
    discuss: Creates/seeds a conversation on the legacy's AI Chat tab.
    """
    prompt = await db.get(StoryPrompt, prompt_id)
    if not prompt or prompt.user_id != user_id:
        raise HTTPException(status_code=404, detail="Prompt not found")
    if prompt.status != "active":
        raise HTTPException(status_code=400, detail="Prompt is no longer active")

    legacy = await db.get(Legacy, prompt.legacy_id)
    legacy_name = legacy.name if legacy else "Unknown"

    if action == "write_story":
        return await _act_write_story(db, prompt, user_id, legacy_name)
    elif action == "discuss":
        return await _act_discuss(db, prompt, user_id)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")


async def _act_write_story(
    db: AsyncSession,
    prompt: StoryPrompt,
    user_id: UUID,
    legacy_name: str,
) -> dict:
    """Create a draft story + evolution session from the prompt.

    Reuses the pattern from ai_service.evolve_conversation:
    1. Create a conversation seeded with the prompt
    2. Create a draft story linked to the legacy
    3. Create a StoryEvolutionSession in elicitation phase
    """
    from ..models.associations import StoryLegacy, ConversationLegacy
    from ..models.story_evolution import StoryEvolutionSession
    from ..models.ai import AIMessage

    # 1. Create conversation for this prompt
    conversation = AIConversation(
        user_id=user_id,
        persona_id="biographer",
    )
    db.add(conversation)
    await db.flush()

    # Link conversation to legacy
    db.add(ConversationLegacy(
        conversation_id=conversation.id,
        legacy_id=prompt.legacy_id,
        role="primary",
        position=0,
    ))

    # Seed the prompt as first user message
    db.add(AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=prompt.prompt_text,
    ))

    # 2. Create draft story
    story = Story(
        author_id=user_id,
        title=f"Story about {legacy_name}",
        content="",
        visibility="personal",
        status="draft",
        source_conversation_id=conversation.id,
    )
    db.add(story)
    await db.flush()

    # Link story to legacy
    db.add(StoryLegacy(
        story_id=story.id,
        legacy_id=prompt.legacy_id,
        role="primary",
        position=0,
    ))

    # 3. Create evolution session
    evo_session = StoryEvolutionSession(
        story_id=story.id,
        base_version_number=1,
        conversation_id=conversation.id,
        phase="elicitation",
        created_by=user_id,
    )
    db.add(evo_session)
    await db.flush()

    # Update prompt
    prompt.status = "used_story"
    prompt.acted_on_at = datetime.now(timezone.utc)
    prompt.story_id = story.id
    prompt.conversation_id = conversation.id

    logger.info(
        "story_prompt.write_story",
        extra={
            "user_id": str(user_id),
            "prompt_id": str(prompt.id),
            "story_id": str(story.id),
        },
    )

    return {
        "action": "write_story",
        "legacy_id": str(prompt.legacy_id),
        "story_id": str(story.id),
        "conversation_id": str(conversation.id),
    }


async def _act_discuss(
    db: AsyncSession,
    prompt: StoryPrompt,
    user_id: UUID,
) -> dict:
    """Create or get a conversation and seed it with the prompt.

    Uses the existing get_or_create_conversation + seed pattern.
    """
    from ..models.associations import ConversationLegacy
    from ..models.ai import AIMessage

    # Create a new conversation for this prompt discussion
    conversation = AIConversation(
        user_id=user_id,
        persona_id="biographer",
    )
    db.add(conversation)
    await db.flush()

    # Link to legacy
    db.add(ConversationLegacy(
        conversation_id=conversation.id,
        legacy_id=prompt.legacy_id,
        role="primary",
        position=0,
    ))

    # Seed with prompt as first user message
    db.add(AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=prompt.prompt_text,
    ))

    # Update prompt
    prompt.status = "used_discuss"
    prompt.acted_on_at = datetime.now(timezone.utc)
    prompt.conversation_id = conversation.id

    await db.flush()

    logger.info(
        "story_prompt.discuss",
        extra={
            "user_id": str(user_id),
            "prompt_id": str(prompt.id),
            "conversation_id": str(conversation.id),
        },
    )

    return {
        "action": "discuss",
        "legacy_id": str(prompt.legacy_id),
        "conversation_id": str(conversation.id),
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/services/test_story_prompts.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add services/core-api/app/services/story_prompts.py services/core-api/tests/unit/services/test_story_prompts.py
git commit -m "feat: add story prompts service with selection and action logic"
```

---

## Task 5: Story Prompts API Routes

**Files:**
- Create: `services/core-api/app/routes/prompts.py`
- Modify: `services/core-api/app/main.py` — register prompts router
- Test: `services/core-api/tests/unit/routes/test_prompts.py`

**Step 1: Write the failing test**

```python
# services/core-api/tests/unit/routes/test_prompts.py
"""Tests for story prompts API routes."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

# Route-level tests verify endpoint wiring; service logic tested in Task 4


def test_prompts_router_exists():
    """Prompts router can be imported."""
    from app.routes.prompts import router
    assert router.prefix == "/api/prompts"


def test_prompts_router_has_expected_routes():
    """Router has current, shuffle, and act endpoints."""
    from app.routes.prompts import router
    paths = [r.path for r in router.routes]
    assert "/current" in paths
    assert "/{prompt_id}/shuffle" in paths
    assert "/{prompt_id}/act" in paths
```

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/routes/test_prompts.py -v`
Expected: FAIL — cannot import

**Step 3: Write the routes**

Reference pattern: `services/core-api/app/routes/ai.py` (line 50 router setup), `services/core-api/app/routes/story_evolution.py` (line 35)

```python
# services/core-api/app/routes/prompts.py
"""Story prompts API routes."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_session
from ..auth.models import UserSession
from ..database import get_db
from ..models.legacy import Legacy
from ..schemas.story_prompt import (
    ActOnPromptRequest,
    ActOnPromptResponse,
    StoryPromptResponse,
)
from ..services import story_prompts as prompts_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.get("/current", response_model=StoryPromptResponse | None)
async def get_current_prompt(
    db: AsyncSession = Depends(get_db),
    session: UserSession = Depends(get_current_session),
) -> StoryPromptResponse | Response:
    """Get the user's current active story prompt.

    Returns 204 if user has no legacies or no prompt available.
    """
    prompt = await prompts_service.get_or_create_active_prompt(db, session.user_id)
    if not prompt:
        return Response(status_code=204)

    legacy = await db.get(Legacy, prompt.legacy_id)
    legacy_name = legacy.name if legacy else "Unknown"

    await db.commit()

    return StoryPromptResponse(
        id=str(prompt.id),
        legacy_id=str(prompt.legacy_id),
        legacy_name=legacy_name,
        prompt_text=prompt.prompt_text,
        category=prompt.category,
        created_at=prompt.created_at,
    )


@router.post("/{prompt_id}/shuffle", response_model=StoryPromptResponse | None)
async def shuffle_prompt(
    prompt_id: UUID,
    db: AsyncSession = Depends(get_db),
    session: UserSession = Depends(get_current_session),
) -> StoryPromptResponse | Response:
    """Rotate the current prompt and get a new one."""
    prompt = await prompts_service.shuffle_prompt(db, prompt_id, session.user_id)
    if not prompt:
        return Response(status_code=204)

    legacy = await db.get(Legacy, prompt.legacy_id)
    legacy_name = legacy.name if legacy else "Unknown"

    await db.commit()

    return StoryPromptResponse(
        id=str(prompt.id),
        legacy_id=str(prompt.legacy_id),
        legacy_name=legacy_name,
        prompt_text=prompt.prompt_text,
        category=prompt.category,
        created_at=prompt.created_at,
    )


@router.post("/{prompt_id}/act", response_model=ActOnPromptResponse)
async def act_on_prompt(
    prompt_id: UUID,
    body: ActOnPromptRequest,
    db: AsyncSession = Depends(get_db),
    session: UserSession = Depends(get_current_session),
) -> ActOnPromptResponse:
    """Act on a prompt — write a story or start a discussion."""
    result = await prompts_service.act_on_prompt(
        db, prompt_id, body.action, session.user_id
    )
    await db.commit()

    return ActOnPromptResponse(**result)
```

**Step 4: Register the router in main.py**

Add to `services/core-api/app/main.py`:
- Import: `from .routes.prompts import router as prompts_router` (after line 40)
- Register: `app.include_router(prompts_router)` (after line 138)

**Step 5: Run test to verify it passes**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/unit/routes/test_prompts.py -v`
Expected: All PASS

**Step 6: Run backend validation**

Run: `cd /apps/mosaic-life && just validate-backend`
Expected: PASS (ruff + mypy clean)

Fix any issues before proceeding.

**Step 7: Commit**

```bash
git add services/core-api/app/routes/prompts.py services/core-api/app/main.py services/core-api/tests/unit/routes/test_prompts.py
git commit -m "feat: add story prompts API endpoints"
```

---

## Task 6: Frontend API Client + Hook

**Files:**
- Create: `apps/web/src/features/story-prompts/api/storyPrompts.ts`
- Create: `apps/web/src/features/story-prompts/hooks/useStoryPrompt.ts`

**Step 1: Create the API client**

Reference pattern: `apps/web/src/features/ai-chat/api/ai.ts`, `apps/web/src/lib/api/client.ts`

```typescript
// apps/web/src/features/story-prompts/api/storyPrompts.ts
import { apiGet, apiPost } from '@/lib/api/client';

export interface StoryPrompt {
  id: string;
  legacy_id: string;
  legacy_name: string;
  prompt_text: string;
  category: string;
  created_at: string;
}

export interface ActOnPromptResponse {
  action: string;
  legacy_id: string;
  story_id?: string;
  conversation_id?: string;
}

export async function getCurrentPrompt(): Promise<StoryPrompt | null> {
  const response = await fetch('/api/prompts/current', {
    credentials: 'include',
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error('Failed to fetch prompt');
  return response.json();
}

export async function shufflePrompt(promptId: string): Promise<StoryPrompt | null> {
  const response = await fetch(`/api/prompts/${promptId}/shuffle`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error('Failed to shuffle prompt');
  return response.json();
}

export async function actOnPrompt(
  promptId: string,
  action: 'write_story' | 'discuss',
): Promise<ActOnPromptResponse> {
  return apiPost<ActOnPromptResponse>(`/api/prompts/${promptId}/act`, { action });
}
```

**Step 2: Create the TanStack Query hook**

Reference pattern: `apps/web/src/features/ai-chat/hooks/useAIChat.ts` (query keys at line 20)

```typescript
// apps/web/src/features/story-prompts/hooks/useStoryPrompt.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentPrompt, shufflePrompt, actOnPrompt } from '../api/storyPrompts';
import type { StoryPrompt } from '../api/storyPrompts';

const storyPromptKeys = {
  all: ['story-prompts'] as const,
  current: () => [...storyPromptKeys.all, 'current'] as const,
};

export function useCurrentPrompt() {
  return useQuery<StoryPrompt | null>({
    queryKey: storyPromptKeys.current(),
    queryFn: getCurrentPrompt,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useShufflePrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (promptId: string) => shufflePrompt(promptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyPromptKeys.current() });
    },
  });
}

export function useActOnPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ promptId, action }: { promptId: string; action: 'write_story' | 'discuss' }) =>
      actOnPrompt(promptId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyPromptKeys.current() });
    },
  });
}
```

**Step 3: Commit**

```bash
git add apps/web/src/features/story-prompts/
git commit -m "feat: add story prompts API client and TanStack Query hooks"
```

---

## Task 7: StoryPromptCard Component

**Files:**
- Create: `apps/web/src/features/story-prompts/components/StoryPromptCard.tsx`

**Step 1: Build the component**

Reference pattern: `apps/web/src/features/ai-chat/components/EvolveSuggestionCard.tsx` for card structure, existing design system for theming.

```typescript
// apps/web/src/features/story-prompts/components/StoryPromptCard.tsx
import { useNavigate } from 'react-router-dom';
import { MessageSquare, PenLine, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCurrentPrompt, useShufflePrompt, useActOnPrompt } from '../hooks/useStoryPrompt';

export default function StoryPromptCard() {
  const navigate = useNavigate();
  const { data: prompt, isLoading } = useCurrentPrompt();
  const shuffle = useShufflePrompt();
  const act = useActOnPrompt();

  if (isLoading || !prompt) return null;

  const handleWriteStory = async () => {
    const result = await act.mutateAsync({
      promptId: prompt.id,
      action: 'write_story',
    });
    if (result.story_id) {
      navigate(
        `/legacy/${result.legacy_id}/story/${result.story_id}/evolve?conversation_id=${result.conversation_id}`,
      );
    }
  };

  const handleDiscuss = async () => {
    const result = await act.mutateAsync({
      promptId: prompt.id,
      action: 'discuss',
    });
    if (result.conversation_id) {
      navigate(
        `/legacy/${result.legacy_id}?tab=ai&conversation=${result.conversation_id}`,
      );
    }
  };

  const handleShuffle = () => {
    shuffle.mutate(prompt.id);
  };

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Story Prompt
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={handleShuffle}
              disabled={shuffle.isPending}
              title="Get a different prompt"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${shuffle.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            for {prompt.legacy_name}&apos;s legacy
          </p>
          <p className="text-base italic leading-relaxed">
            &ldquo;{prompt.prompt_text}&rdquo;
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDiscuss} disabled={act.isPending}>
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Discuss
          </Button>
          <Button size="sm" onClick={handleWriteStory} disabled={act.isPending}>
            <PenLine className="h-4 w-4 mr-1.5" />
            Write a Story
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/story-prompts/components/StoryPromptCard.tsx
git commit -m "feat: add StoryPromptCard component"
```

---

## Task 8: Dashboard Integration

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx` — import and render StoryPromptCard

**Step 1: Add StoryPromptCard to the dashboard**

Add import at the top of `apps/web/src/pages/DashboardPage.tsx`:
```typescript
import StoryPromptCard from '@/features/story-prompts/components/StoryPromptCard';
```

Insert `<StoryPromptCard />` between the RecentlyViewedSection for legacies (around line 26) and the "My Legacies" section heading (around line 29). The exact placement:

```tsx
{/* After RecentlyViewedSection for legacies */}
<StoryPromptCard />
{/* Before "My Legacies" heading */}
```

**Step 2: Commit**

```bash
git add apps/web/src/pages/DashboardPage.tsx
git commit -m "feat: integrate StoryPromptCard into dashboard"
```

---

## Task 9: Legacy Profile Tab Navigation via URL Param

The "Discuss" action needs to navigate to `/legacy/{id}?tab=ai&conversation={convId}` and auto-select the AI Chat tab. Currently `LegacyProfile` uses local `useState` for tab selection.

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx` — read `tab` from URL search params
- Modify: `apps/web/src/features/legacy/components/AISection.tsx` — accept optional `conversationId` prop to auto-select conversation

**Step 1: Update LegacyProfile to read tab from URL**

In `apps/web/src/features/legacy/components/LegacyProfile.tsx`:

Replace the `useState` for `activeSection` (line 41):

```typescript
// Before:
const [activeSection, setActiveSection] = useState<SectionId>('stories');

// After:
import { useSearchParams } from 'react-router-dom';
// ... in component:
const [searchParams, setSearchParams] = useSearchParams();
const tabParam = searchParams.get('tab') as SectionId | null;
const [activeSection, setActiveSection] = useState<SectionId>(tabParam || 'stories');
```

Also read the conversation param for the AI section:

```typescript
const conversationParam = searchParams.get('conversation') || undefined;
```

Pass it to AISection:

```tsx
{activeSection === 'ai' && (
  <AISection legacyId={legacyId} initialConversationId={conversationParam} />
)}
```

**Step 2: Update AISection to accept initialConversationId**

In `apps/web/src/features/legacy/components/AISection.tsx`:

Add `initialConversationId?: string` to the component props. When provided, use it to set the active conversation on mount so the seeded prompt conversation is shown immediately.

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyProfile.tsx apps/web/src/features/legacy/components/AISection.tsx
git commit -m "feat: support tab and conversation URL params on legacy profile"
```

---

## Task 10: Seed the Conversation After Navigation

When the user clicks "Write a Story" or "Discuss", the backend creates a conversation with the prompt as the first user message. The AI persona needs to respond to that prompt (elaborate, ask follow-ups). This happens via the existing seed endpoint.

**Files:**
- Modify: `apps/web/src/features/story-prompts/components/StoryPromptCard.tsx` — trigger seed after navigation
- Or handled in `AISection.tsx` / `EvolveWorkspace.tsx` — if they already auto-seed new conversations

**Step 1: Verify existing seed behavior**

Check how the Evolve workspace and AI Chat tab handle new conversations. The Evolve workspace calls `POST /api/ai/conversations/{id}/seed?story_id=...` on mount (see `services/core-api/app/routes/ai.py` seed endpoint). The AI Chat tab may also auto-seed.

If the existing components already call the seed endpoint for conversations with one user message but no assistant response, no changes needed. If not, trigger `POST /api/ai/conversations/{id}/seed` after navigation in the StoryPromptCard handlers.

**Step 2: Test the full flow manually**

1. Log in, ensure you have at least one legacy with some activity
2. Visit the dashboard — verify the StoryPromptCard appears
3. Click "Discuss" — verify navigation to legacy AI Chat tab with the prompt seeded
4. Go back to dashboard, click shuffle, verify new prompt appears
5. Click "Write a Story" — verify navigation to Evolve workspace with chat seeded

**Step 3: Commit any seed-related changes**

```bash
git add -A
git commit -m "feat: ensure AI seed response after prompt navigation"
```

---

## Task 11: Backend Validation + Final Cleanup

**Step 1: Run full backend validation**

```bash
cd /apps/mosaic-life && just validate-backend
```

Fix any ruff lint or mypy type errors.

**Step 2: Run all backend tests**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest -v
```

**Step 3: Run frontend lint and build**

```bash
cd /apps/mosaic-life/apps/web && npm run lint && npm run build
```

**Step 4: Run frontend tests**

```bash
cd /apps/mosaic-life/apps/web && npm run test
```

**Step 5: Fix any issues and commit**

```bash
git add -A
git commit -m "chore: fix lint and type errors for story prompts feature"
```

---

## Task 12: Integration Test — Full Flow

**Files:**
- Create: `services/core-api/tests/integration/test_story_prompts_flow.py`

**Step 1: Write integration test**

```python
# services/core-api/tests/integration/test_story_prompts_flow.py
"""Integration tests for the story prompts full flow."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_current_prompt_no_auth(client: AsyncClient):
    """Unauthenticated request returns 401."""
    resp = await client.get("/api/prompts/current")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_full_prompt_lifecycle(authenticated_client: AsyncClient, test_legacy):
    """Full flow: get prompt → shuffle → act (discuss)."""
    # Get current prompt
    resp = await authenticated_client.get("/api/prompts/current")
    assert resp.status_code == 200
    prompt = resp.json()
    assert "id" in prompt
    assert prompt["legacy_id"] == str(test_legacy.id)

    # Shuffle
    resp = await authenticated_client.post(f"/api/prompts/{prompt['id']}/shuffle")
    assert resp.status_code == 200
    new_prompt = resp.json()
    assert new_prompt["id"] != prompt["id"]

    # Act — discuss
    resp = await authenticated_client.post(
        f"/api/prompts/{new_prompt['id']}/act",
        json={"action": "discuss"},
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result["action"] == "discuss"
    assert "conversation_id" in result
```

Adapt fixtures to match the project's existing test infrastructure (check `services/core-api/tests/conftest.py` for `authenticated_client` and `test_legacy` fixture patterns).

**Step 2: Run integration tests**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/integration/test_story_prompts_flow.py -v
```

**Step 3: Commit**

```bash
git add services/core-api/tests/integration/test_story_prompts_flow.py
git commit -m "test: add integration tests for story prompts flow"
```
