# Relationship AI Context Integration — Design

**Date:** 2026-03-10
**Status:** Approved
**Related:** `docs/plans/2025-02-13-member-relationship-profiles-design.md`

## Problem

Member relationship profiles capture rich personal context (nicknames, relationship type, character traits, free-text descriptions) but none of this data reaches the AI. Every conversation starts generic — the AI doesn't know that "Mom" means Jane Smith, or that the user was "her youngest child". Users must re-explain their relationship each time.

## Solution

Inject the member's relationship profile into the AI system prompt as a dedicated context section. A pure formatter function produces the text block; existing call sites fetch the profile and pass the formatted string through to `build_system_prompt()`.

## Approach: Profile-Aware Context Builder

Three components:

1. **Formatter function** — pure, testable, produces the prompt text
2. **New parameter on `build_system_prompt()`** — `relationship_context: str`
3. **Profile fetch at existing entry points** — best-effort, non-blocking

### Formatter Function

New file: `services/core-api/app/services/relationship_context.py`

```python
def format_relationship_context(
    profile: MemberProfileResponse | None,
    legacy_name: str,
) -> str:
```

Returns empty string if profile is `None` or all fields are empty. Otherwise produces:

```
## Your Relationship with Jane Smith

The user refers to Jane Smith as "Mom". When the user says "Mom" or "your Mom",
they are referring to Jane Smith. You should adapt — when the user uses this
nickname, you may use "your Mom" to refer to Jane Smith, but default to
"Jane Smith" otherwise.

Relationship: parent

In the user's own words, Jane Smith is to them: "The strongest woman I ever knew.
She raised three kids on her own and never complained."

In the user's own words, they are to Jane Smith: "Her youngest child, the one
who inherited her stubbornness."

The user describes Jane Smith as: warm, stubborn, resilient, funny
```

Formatting rules:
- Each field only appears if populated
- Nicknames use possessive framing: "your Mom", never just "Mom"
- Multiple nicknames are all listed for recognition
- Character traits are comma-separated, presented as informational context
- Persona instructions determine whether traits are embodied (e.g., a future "legacy voice" persona) or just referenced conversationally (current personas)

### System Prompt Placement

Relationship context is inserted **after persona instructions, before story context**:

```
base rules → persona prompt → RELATIONSHIP CONTEXT → story context → known facts → elicitation mode
```

This gives the AI relationship framing early, before any story-specific content.

Change to `build_system_prompt()` in `services/core-api/app/config/personas.py`:

```python
def build_system_prompt(
    persona_id: str,
    legacy_name: str,
    story_context: str = "",
    facts: list[Any] | None = None,
    relationship_context: str = "",      # new parameter
    elicitation_mode: bool = False,
    original_story_text: str | None = None,
    include_graph_suggestions: bool = False,
) -> str | None:
```

### Fetch Points

Profile is fetched and formatted at each place `build_system_prompt` is called:

| Location | Context | Notes |
|----------|---------|-------|
| `storytelling.py` `prepare_turn()` | Every chat message | Has `db`, `user_id`, `legacy_id` |
| `ai.py` seed endpoint (~line 407) | Opening message generation | Has `db`, `user_id`, `legacy` |
| `story_evolution.py` `generate_opening_message()` | Evolution session opening | Has session with `user_id` and legacy |
| `story_evolution.py` `build_generation_context()` | Story writer draft generation | Add `user_id` parameter; populates existing `relationship_context` dict key |
| `rewrite.py` rewrite endpoint (~line 135) | Quick rewrite | Currently passes `""`, replace with real data |

All fetches are **best-effort** — wrapped in try/except. If the profile fetch fails, proceed with empty context.

### Nickname Behavior

- **Recognition:** AI is told all nicknames map to the legacy's real name
- **Possessive framing:** Always "your Mom", never "Mom" — the AI is a separate persona
- **Adaptation:** AI mirrors the user's language. Uses nickname when user does, defaults to real name otherwise
- **Multiple nicknames:** All listed so the AI recognizes any of them

### Character Traits Behavior

- **Informational by default:** Presented as facts the AI can reference naturally
- **Persona-dependent embodiment:** Current personas use traits conversationally. Future "legacy voice" personas can be configured to embody them via their persona config — no formatter changes needed

### No Frontend Changes

All integration is backend-only. The relationship profile data is already captured via the existing UI. The AI simply starts using it.

## Testing

### Unit Tests — `test_relationship_context.py`

- Returns empty string when profile is `None`
- Returns empty string when all fields are empty
- Formats correctly with only nicknames populated
- Formats correctly with only relationship_type populated
- Formats correctly with all fields populated
- Multiple nicknames listed correctly
- Possessive framing in nickname instructions
- Character traits comma-separated

### Extend Existing Tests

- `test_personas.py` — `build_system_prompt` with `relationship_context` parameter: appears in correct position, empty string adds nothing
- `test_story_writer.py` — existing test already passes relationship context; verify still works
- `prepare_turn` tests — when member has profile, system prompt includes relationship section; when no profile, unchanged

### Not Tested

- No E2E/Playwright — backend prompt changes only
- No new API endpoints
- No frontend changes

## Files Summary

### New
- `services/core-api/app/services/relationship_context.py` — Formatter function
- `services/core-api/tests/services/test_relationship_context.py` — Formatter tests

### Modified
- `services/core-api/app/config/personas.py` — Add `relationship_context` parameter to `build_system_prompt()`
- `services/core-api/app/adapters/storytelling.py` — Fetch profile in `prepare_turn()`
- `services/core-api/app/routes/ai.py` — Fetch profile in seed endpoint
- `services/core-api/app/services/story_evolution.py` — Fetch profile in `generate_opening_message()` and `build_generation_context()`
- `services/core-api/app/routes/rewrite.py` — Fetch profile in rewrite endpoint
- Existing test files extended for new parameter
