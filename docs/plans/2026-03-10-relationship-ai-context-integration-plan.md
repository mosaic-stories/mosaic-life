# Relationship AI Context Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Inject member relationship profiles (nicknames, relationship type, character traits, free-text descriptions) into AI system prompts so conversations are personalized from the start.

**Architecture:** A pure formatter function produces a prompt text block from `MemberProfileResponse`. The text is passed to `build_system_prompt()` via a new `relationship_context` parameter. Each call site that builds system prompts fetches the profile best-effort and passes the formatted string.

**Tech Stack:** Python, FastAPI, Pydantic, pytest

---

### Task 1: Create the Formatter Function (TDD)

**Files:**
- Create: `services/core-api/app/services/relationship_context.py`
- Test: `services/core-api/tests/services/test_relationship_context.py`

**Step 1: Write the failing tests**

Create `services/core-api/tests/services/test_relationship_context.py`:

```python
"""Tests for relationship context formatter."""

from app.schemas.member_profile import MemberProfileResponse
from app.services.relationship_context import format_relationship_context


class TestFormatRelationshipContext:
    def test_returns_empty_string_when_profile_is_none(self) -> None:
        result = format_relationship_context(None, "Jane Smith")
        assert result == ""

    def test_returns_empty_string_when_all_fields_empty(self) -> None:
        profile = MemberProfileResponse()
        result = format_relationship_context(profile, "Jane Smith")
        assert result == ""

    def test_formats_nicknames_with_possessive_framing(self) -> None:
        profile = MemberProfileResponse(nicknames=["Mom"])
        result = format_relationship_context(profile, "Jane Smith")
        assert "your Mom" in result
        assert '"Mom"' in result
        assert "Jane Smith" in result

    def test_formats_multiple_nicknames(self) -> None:
        profile = MemberProfileResponse(nicknames=["Mom", "Mama", "Ma"])
        result = format_relationship_context(profile, "Jane Smith")
        assert '"Mom"' in result
        assert '"Mama"' in result
        assert '"Ma"' in result

    def test_formats_relationship_type(self) -> None:
        profile = MemberProfileResponse(relationship_type="parent")
        result = format_relationship_context(profile, "Jane Smith")
        assert "Relationship: parent" in result

    def test_formats_legacy_to_viewer(self) -> None:
        profile = MemberProfileResponse(
            legacy_to_viewer="The strongest woman I ever knew."
        )
        result = format_relationship_context(profile, "Jane Smith")
        assert "The strongest woman I ever knew." in result
        assert "Jane Smith is to them" in result

    def test_formats_viewer_to_legacy(self) -> None:
        profile = MemberProfileResponse(
            viewer_to_legacy="Her youngest child."
        )
        result = format_relationship_context(profile, "Jane Smith")
        assert "Her youngest child." in result
        assert "they are to Jane Smith" in result

    def test_formats_character_traits(self) -> None:
        profile = MemberProfileResponse(
            character_traits=["warm", "stubborn", "resilient"]
        )
        result = format_relationship_context(profile, "Jane Smith")
        assert "warm, stubborn, resilient" in result

    def test_formats_all_fields(self) -> None:
        profile = MemberProfileResponse(
            relationship_type="parent",
            nicknames=["Mom"],
            legacy_to_viewer="The strongest woman I ever knew.",
            viewer_to_legacy="Her youngest child.",
            character_traits=["warm", "stubborn"],
        )
        result = format_relationship_context(profile, "Jane Smith")
        assert "## Your Relationship with Jane Smith" in result
        assert "Relationship: parent" in result
        assert '"Mom"' in result
        assert "your Mom" in result
        assert "The strongest woman I ever knew." in result
        assert "Her youngest child." in result
        assert "warm, stubborn" in result

    def test_omits_empty_nicknames_list(self) -> None:
        profile = MemberProfileResponse(nicknames=[], relationship_type="friend")
        result = format_relationship_context(profile, "Jane Smith")
        assert "nickname" not in result.lower()
        assert "Relationship: friend" in result

    def test_omits_empty_character_traits_list(self) -> None:
        profile = MemberProfileResponse(character_traits=[], relationship_type="friend")
        result = format_relationship_context(profile, "Jane Smith")
        assert "describes" not in result.lower()
        assert "Relationship: friend" in result

    def test_header_always_present_when_content_exists(self) -> None:
        profile = MemberProfileResponse(relationship_type="sibling")
        result = format_relationship_context(profile, "Bob")
        assert "## Your Relationship with Bob" in result
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/services/test_relationship_context.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.relationship_context'`

**Step 3: Write the implementation**

Create `services/core-api/app/services/relationship_context.py`:

```python
"""Formatter for member relationship context in AI system prompts."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas.member_profile import MemberProfileResponse


def format_relationship_context(
    profile: MemberProfileResponse | None,
    legacy_name: str,
) -> str:
    """Format a member's relationship profile into a system prompt section.

    Returns an empty string if profile is None or has no populated fields.
    """
    if profile is None:
        return ""

    sections: list[str] = []

    # Nicknames — possessive framing
    if profile.nicknames:
        quoted = ", ".join(f'"{n}"' for n in profile.nicknames)
        possessive = ", ".join(f'"your {n}"' for n in profile.nicknames)
        sections.append(
            f"The user refers to {legacy_name} as {quoted}. "
            f"When the user says {quoted} or {possessive}, "
            f"they are referring to {legacy_name}. You should adapt — when the user "
            f"uses these nicknames, you may use the possessive form (e.g. "
            f'"your {profile.nicknames[0]}") to refer to {legacy_name}, '
            f"but default to \"{legacy_name}\" otherwise."
        )

    # Relationship type
    if profile.relationship_type:
        sections.append(f"Relationship: {profile.relationship_type}")

    # Legacy to viewer
    if profile.legacy_to_viewer:
        sections.append(
            f"In the user's own words, {legacy_name} is to them: "
            f'"{profile.legacy_to_viewer}"'
        )

    # Viewer to legacy
    if profile.viewer_to_legacy:
        sections.append(
            f"In the user's own words, they are to {legacy_name}: "
            f'"{profile.viewer_to_legacy}"'
        )

    # Character traits
    if profile.character_traits:
        traits = ", ".join(profile.character_traits)
        sections.append(f"The user describes {legacy_name} as: {traits}")

    if not sections:
        return ""

    header = f"## Your Relationship with {legacy_name}"
    return header + "\n\n" + "\n\n".join(sections)
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/services/test_relationship_context.py -v`
Expected: All PASS

**Step 5: Run validation**

Run: `just validate-backend`
Expected: PASS (ruff + mypy clean)

**Step 6: Commit**

```bash
git add services/core-api/app/services/relationship_context.py services/core-api/tests/services/test_relationship_context.py
git commit -m "feat: add relationship context formatter for AI prompts"
```

---

### Task 2: Add `relationship_context` Parameter to `build_system_prompt` (TDD)

**Files:**
- Modify: `services/core-api/app/config/personas.py:170-224`
- Test: `services/core-api/tests/config/test_personas.py`

**Step 1: Write the failing tests**

Add to `services/core-api/tests/config/test_personas.py`:

```python
class TestBuildSystemPromptWithRelationshipContext:
    """Tests for build_system_prompt with relationship_context parameter."""

    def test_includes_relationship_context_in_prompt(self) -> None:
        context = "## Your Relationship with Jane\n\nRelationship: parent"
        prompt = build_system_prompt(
            "biographer", "Jane", relationship_context=context
        )
        assert prompt is not None
        assert "Your Relationship with Jane" in prompt
        assert "Relationship: parent" in prompt

    def test_empty_relationship_context_adds_nothing(self) -> None:
        prompt_without = build_system_prompt("biographer", "Jane")
        prompt_empty = build_system_prompt(
            "biographer", "Jane", relationship_context=""
        )
        assert prompt_without == prompt_empty

    def test_relationship_context_appears_before_story_context(self) -> None:
        rel_context = "## Your Relationship with Jane\n\nRelationship: parent"
        story_context = "## Relevant stories\n\nGrandma loved gardening."
        prompt = build_system_prompt(
            "biographer",
            "Jane",
            story_context=story_context,
            relationship_context=rel_context,
        )
        assert prompt is not None
        assert prompt.index("Your Relationship") < prompt.index("Relevant stories")

    def test_relationship_context_appears_after_persona_prompt(self) -> None:
        rel_context = "## Your Relationship with Jane\n\nRelationship: parent"
        prompt = build_system_prompt(
            "biographer", "Jane", relationship_context=rel_context
        )
        assert prompt is not None
        persona = get_persona("biographer")
        assert persona is not None
        persona_text = persona.system_prompt.replace("{legacy_name}", "Jane")
        assert prompt.index(persona_text) < prompt.index("Your Relationship")
```

**Step 2: Run tests to verify they fail**

Run: `cd services/core-api && uv run pytest tests/config/test_personas.py::TestBuildSystemPromptWithRelationshipContext -v`
Expected: FAIL — `relationship_context` is not a parameter

**Step 3: Modify `build_system_prompt` in `personas.py`**

In `services/core-api/app/config/personas.py`, change the function signature at line 170 and add the insertion between persona prompt and story context:

```python
def build_system_prompt(
    persona_id: str,
    legacy_name: str,
    story_context: str = "",
    facts: list[Any] | None = None,
    relationship_context: str = "",
    elicitation_mode: bool = False,
    original_story_text: str | None = None,
    include_graph_suggestions: bool = False,
) -> str | None:
```

Update the docstring `Args:` block to include:
```
        relationship_context: Formatted relationship profile text to include.
```

Update the body — insert after `prompt = f"{base}\n\n{persona_prompt}"` (line 202):

```python
    prompt = f"{base}\n\n{persona_prompt}"

    if relationship_context:
        prompt = f"{prompt}\n\n{relationship_context}"

    if story_context:
        prompt = f"{prompt}\n\n{story_context}"
```

**Step 4: Run tests to verify they pass**

Run: `cd services/core-api && uv run pytest tests/config/test_personas.py -v`
Expected: All PASS (existing + new)

**Step 5: Run validation**

Run: `just validate-backend`
Expected: PASS

**Step 6: Commit**

```bash
git add services/core-api/app/config/personas.py services/core-api/tests/config/test_personas.py
git commit -m "feat: add relationship_context parameter to build_system_prompt"
```

---

### Task 3: Inject Relationship Context in `prepare_turn`

**Files:**
- Modify: `services/core-api/app/adapters/storytelling.py:180-299`

**Step 1: Add the profile fetch and format call**

In `services/core-api/app/adapters/storytelling.py`, in `prepare_turn()`, after the facts retrieval block (after line 263) and before the evolution session check (line 268), add:

```python
            # Best-effort relationship context
            relationship_context = ""
            try:
                from ..services import member_profile as member_profile_service
                from ..services.relationship_context import format_relationship_context

                profile = await member_profile_service.get_profile(
                    db, legacy_id, user_id
                )
                relationship_context = format_relationship_context(profile, legacy_name)
            except Exception as exc:
                logger.warning(
                    "ai.chat.relationship_context_failed",
                    extra={
                        "conversation_id": str(conversation_id),
                        "error": str(exc),
                    },
                )
```

Then update the `build_system_prompt` call at line 291 to pass `relationship_context`:

```python
            system_prompt = build_system_prompt(
                persona_id,
                legacy_name,
                story_context,
                facts=facts,
                relationship_context=relationship_context,
                elicitation_mode=elicitation_mode,
                original_story_text=original_story_text,
                include_graph_suggestions=(elicitation_mode and bool(story_context)),
            )
```

**Step 2: Run existing tests**

Run: `cd services/core-api && uv run pytest tests/adapters/test_storytelling_memory.py tests/adapters/test_storytelling_graph.py -v`
Expected: All existing tests still PASS

**Step 3: Run validation**

Run: `just validate-backend`
Expected: PASS

**Step 4: Commit**

```bash
git add services/core-api/app/adapters/storytelling.py
git commit -m "feat: inject relationship context into chat prepare_turn"
```

---

### Task 4: Inject Relationship Context in Seed Endpoint

**Files:**
- Modify: `services/core-api/app/routes/ai.py:404-414`

**Step 1: Add the profile fetch before the `build_system_prompt` call**

In `services/core-api/app/routes/ai.py`, before the `build_system_prompt` call at line 407, add:

```python
        # Best-effort relationship context
        relationship_context = ""
        try:
            from ..services import member_profile as member_profile_service
            from ..services.relationship_context import format_relationship_context

            profile = await member_profile_service.get_profile(
                db, primary_legacy_id, session.user_id
            )
            relationship_context = format_relationship_context(profile, legacy.name)
        except Exception:
            logger.warning(
                "ai.seed.relationship_context_failed",
                extra={"conversation_id": str(conversation_id)},
            )
```

Then update the `build_system_prompt` call to include `relationship_context`:

```python
        system_prompt = build_system_prompt(
            persona_id=conversation.persona_id,
            legacy_name=legacy.name,
            story_context=story_context,
            relationship_context=relationship_context,
            elicitation_mode=seed_mode != "story_prompt",
            original_story_text=story.content if story is not None else None,
            include_graph_suggestions=bool(story_context),
        )
```

**Step 2: Run validation**

Run: `just validate-backend`
Expected: PASS

**Step 3: Commit**

```bash
git add services/core-api/app/routes/ai.py
git commit -m "feat: inject relationship context into conversation seed endpoint"
```

---

### Task 5: Inject Relationship Context in Evolution Opening

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py:189-286`

**Step 1: Add the profile fetch before the `build_system_prompt` call**

In `services/core-api/app/services/story_evolution.py`, in `generate_opening_message()`, before the `build_system_prompt` call at line 279, add:

```python
        # Best-effort relationship context
        relationship_context = ""
        try:
            from app.services import member_profile as member_profile_service
            from app.services.relationship_context import format_relationship_context

            primary_legacy_id = primary.legacy_id if primary else None
            if primary_legacy_id:
                profile = await member_profile_service.get_profile(
                    db, primary_legacy_id, session.created_by
                )
                relationship_context = format_relationship_context(
                    profile, legacy_name
                )
        except Exception:
            logger.warning(
                "evolution.opening.relationship_context_failed",
                extra={"session_id": str(session.id)},
            )
```

Then update the `build_system_prompt` call to include `relationship_context`:

```python
        system_prompt = build_system_prompt(
            persona_id=persona_id,
            legacy_name=legacy_name,
            story_context=story_context,
            relationship_context=relationship_context,
            elicitation_mode=True,
            original_story_text=story.content,
            include_graph_suggestions=bool(story_context),
        )
```

**Step 2: Run validation**

Run: `just validate-backend`
Expected: PASS

**Step 3: Commit**

```bash
git add services/core-api/app/services/story_evolution.py
git commit -m "feat: inject relationship context into evolution opening"
```

---

### Task 6: Inject Relationship Context in `build_generation_context`

**Files:**
- Modify: `services/core-api/app/services/story_evolution.py:901-968`

**Step 1: Add `user_id` parameter and profile fetch**

In `services/core-api/app/services/story_evolution.py`, update `build_generation_context` to accept `user_id`:

```python
async def build_generation_context(
    db: AsyncSession,
    session: StoryEvolutionSession,
    include_draft: bool = False,
    user_id: UUID | None = None,
) -> dict[str, Any]:
```

Note: import `UUID` from `uuid` at the top of the function if not already imported (it is — `uuid.UUID` is used throughout the file).

After the `legacy_name` lookup (around line 937), add:

```python
    # Best-effort relationship context
    relationship_context = ""
    effective_user_id = user_id or session.created_by
    try:
        from app.services import member_profile as member_profile_service
        from app.services.relationship_context import format_relationship_context

        if primary:
            profile = await member_profile_service.get_profile(
                db, primary.legacy_id, effective_user_id
            )
            relationship_context = format_relationship_context(profile, legacy_name)
    except Exception:
        logger.warning(
            "evolution.generation_context.relationship_context_failed",
            extra={"session_id": str(session.id)},
        )
```

Then add it to the context dict:

```python
    context: dict[str, Any] = {
        "original_story": original_story,
        "summary_text": session.summary_text or "",
        "writing_style": session.writing_style or "vivid",
        "length_preference": session.length_preference or "similar",
        "legacy_name": legacy_name,
        "story_title": story.title,
        "model_id": model_id,
        "relationship_context": relationship_context,
    }
```

**Step 2: Update callers to pass `user_id`**

The two callers in `services/core-api/app/routes/story_evolution.py` (lines 285 and 373) should pass `user_id`. Both routes have access to `session.user_id`. Update:

Line ~285:
```python
            context = await evolution_service.build_generation_context(
                db=db, session=evo_session, user_id=session.user_id
            )
```

Line ~373:
```python
            context = await evolution_service.build_generation_context(
                db=db, session=evo_session, include_draft=True, user_id=session.user_id
            )
```

**Step 3: Run validation**

Run: `just validate-backend`
Expected: PASS

**Step 4: Commit**

```bash
git add services/core-api/app/services/story_evolution.py services/core-api/app/routes/story_evolution.py
git commit -m "feat: inject relationship context into story generation context"
```

---

### Task 7: Inject Relationship Context in Rewrite Endpoint

**Files:**
- Modify: `services/core-api/app/routes/rewrite.py:131-137`

**Step 1: Add the profile fetch before the writer call**

In `services/core-api/app/routes/rewrite.py`, before the `writer.build_system_prompt` call at line 131, add:

```python
            # Best-effort relationship context
            relationship_context = ""
            try:
                from app.services import member_profile as member_profile_service
                from app.services.relationship_context import (
                    format_relationship_context,
                )

                if primary:
                    profile = await member_profile_service.get_profile(
                        db, primary.legacy_id, user_id
                    )
                    relationship_context = format_relationship_context(
                        profile, legacy_name
                    )
            except Exception as exc:
                logger.warning(
                    "rewrite.relationship_context_failed",
                    extra={"error": str(exc)},
                )
```

Then update the `build_system_prompt` call to replace the hardcoded empty string:

```python
            system_prompt = writer.build_system_prompt(
                writing_style=data.writing_style or "vivid",
                length_preference=data.length_preference or "similar",
                legacy_name=legacy_name,
                relationship_context=relationship_context,
                is_revision=False,
            )
```

**Step 2: Run validation**

Run: `just validate-backend`
Expected: PASS

**Step 3: Commit**

```bash
git add services/core-api/app/routes/rewrite.py
git commit -m "feat: inject relationship context into rewrite endpoint"
```

---

### Task 8: Final Validation

**Step 1: Run full test suite**

Run: `cd services/core-api && uv run pytest -v`
Expected: All tests PASS

**Step 2: Run full validation**

Run: `just validate-backend`
Expected: PASS (ruff + mypy)

**Step 3: Verify no regressions in existing tests**

Run: `cd services/core-api && uv run pytest tests/config/test_personas.py tests/services/test_story_writer.py tests/adapters/ -v`
Expected: All PASS

**Step 4: Final commit if any fixups needed, otherwise done**
