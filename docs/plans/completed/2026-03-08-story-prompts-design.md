# Story Prompts Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

Story Prompts surfaces conversation-starting prompts on the dashboard to encourage users to capture stories about their legacies. A single prompt is displayed for a recently-interacted legacy, with options to "Write a Story" (entering the Evolve workspace) or "Discuss" (opening the Legacy AI Chat tab).

## Approach

**Hybrid: Templates in YAML Config, Selection on Backend**

Prompt templates live in a YAML config file (following the `personas.yaml` pattern), loaded at startup. The backend selection endpoint picks from these templates using DB state (recent legacy activity, prompt history). A `story_prompts` table persists prompt lifecycle.

## Data Model

### Prompt Templates (YAML Config)

New file: `config/prompt_templates.yaml`

```yaml
categories:
  meals_traditions:
    label: "Meals & Traditions"
    templates:
      - id: "meals_001"
        text: "What's a favorite meal or tradition you shared with {name}?"
      - id: "meals_002"
        text: "Did {name} have a signature dish or recipe they were known for?"
  life_lessons:
    label: "Life Lessons"
    templates:
      - id: "lessons_001"
        text: "What's the best piece of advice {name} ever gave you?"
      - id: "lessons_002"
        text: "Was there a moment when {name} taught you something without saying a word?"
  funny_moments:
    label: "Funny Moments"
    templates:
      - id: "funny_001"
        text: "What's a story about {name} that always makes you laugh?"
  relationships:
    label: "Relationships"
    templates:
      - id: "rel_001"
        text: "How did you first meet {name}, and what was your earliest impression?"
  milestones:
    label: "Milestones"
    templates:
      - id: "mile_001"
        text: "What's a proud moment in {name}'s life that deserves to be remembered?"
```

Templates use `{name}` as a placeholder, substituted with the legacy's name at render time. The `id` field is stable and referenced in the database for dedup. More templates can be added to each category over time. Future AI-generated prompts will bypass templates entirely (nullable `template_id`).

### Database Table: `story_prompts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK -> users) | Who this prompt is for |
| `legacy_id` | UUID (FK -> legacies) | Which legacy it's bound to |
| `template_id` | VARCHAR (nullable) | References YAML template id (nullable for future AI-generated) |
| `prompt_text` | TEXT | Rendered text with legacy name substituted |
| `category` | VARCHAR | Template category key |
| `status` | ENUM | `active`, `used_story`, `used_discuss`, `rotated` |
| `created_at` | TIMESTAMP | When the prompt was generated |
| `acted_on_at` | TIMESTAMP (nullable) | When the user clicked Write/Discuss |
| `story_id` | UUID (FK -> stories, nullable) | If "Write a Story" was used |
| `conversation_id` | UUID (FK -> ai_conversations, nullable) | If "Discuss" was used |

**Constraints:**
- At most one `active` prompt per user at a time (enforced in application logic)
- `template_id` is nullable to support future AI-generated prompts

## Backend API

### Endpoints

#### `GET /api/prompts/current`

Returns the user's current active prompt. If none exists, generates one.

Generation logic:
1. Find the user's most recently interacted-with legacy
2. Pick a template from a category not recently used for this legacy
3. Render the template with `{name}` substituted
4. Persist to `story_prompts` with status `active`
5. Return the prompt object

If the active prompt is older than 24 hours, auto-rotate (mark as `rotated`, generate new).

Returns `204 No Content` if the user has no legacies.

**Response:**
```json
{
  "id": "uuid",
  "legacy_id": "uuid",
  "legacy_name": "Karen Marie Hewitt",
  "prompt_text": "What's a favorite meal or tradition you shared with Karen?",
  "category": "meals_traditions",
  "created_at": "2026-03-08T12:00:00Z"
}
```

#### `POST /api/prompts/{id}/shuffle`

Marks the current prompt as `rotated`, generates a new one avoiding the just-rotated template and recently used ones. Returns the new prompt.

#### `POST /api/prompts/{id}/act`

Called when the user clicks "Write a Story" or "Discuss".

**Request:**
```json
{ "action": "write_story" | "discuss" }
```

**`write_story` behavior:**
- Reuses the existing evolve flow: creates a draft story linked to the legacy, starts an evolution session with the prompt seeded as initial context
- Updates prompt status to `used_story` with the `story_id`
- Returns `{ story_id, legacy_id }`

**`discuss` behavior:**
- Creates (or retrieves) a conversation for the legacy with the default persona
- Seeds the conversation with the prompt text as the opening message via existing seed mechanism
- Updates prompt status to `used_discuss` with the `conversation_id`
- Returns `{ conversation_id, legacy_id }`

### Service Layer

New `services/story_prompts.py`:
- `get_or_create_active_prompt(user_id)` — core selection logic with 24h rotation
- `shuffle_prompt(prompt_id, user_id)` — rotate and generate next
- `act_on_prompt(prompt_id, action, user_id)` — delegates to existing evolve/conversation services
- `select_legacy(user_id)` — picks most recently interacted legacy
- `select_template(legacy_id, user_id)` — picks unused template, avoids repeats

### Config Loader

New `config/prompt_templates.py` (mirroring `config/personas.py`) that loads and validates the YAML at startup.

## Frontend

### New Feature Module

```
features/story-prompts/
├── api/
│   └── storyPrompts.ts      # API client (getCurrentPrompt, shufflePrompt, actOnPrompt)
├── hooks/
│   └── useStoryPrompt.ts    # TanStack Query hook wrapping the API
└── components/
    └── StoryPromptCard.tsx   # The dashboard card component
```

### StoryPromptCard Component

Matches the existing design system theme:
- "STORY PROMPT" label with "for {legacy name}'s legacy" subtitle
- Prompt text displayed in italic/serif styling
- **"Discuss"** button (secondary) — calls `actOnPrompt(id, 'discuss')`, navigates to `/legacy/{legacyId}?tab=ai-chat&conversation={conversationId}`
- **"Write a Story"** button (primary CTA) — calls `actOnPrompt(id, 'write_story')`, navigates to `/legacy/{legacyId}/story/{storyId}/evolve`
- **Shuffle icon button** (subtle) — calls `shufflePrompt(id)`, invalidates the query to refresh

### Dashboard Integration

Added to `DashboardPage.tsx` near the "My Legacies" section. Conditionally rendered — only shows when the hook returns a prompt. Hides gracefully when user has no legacies or all templates exhausted.

### Navigation Flows

**"Write a Story":**
1. `POST /api/prompts/{id}/act` with `action: "write_story"`
2. Backend creates draft story + evolution session (reusing existing evolve flow)
3. Response: `{ story_id, legacy_id }`
4. Navigate to `/legacy/{legacyId}/story/{storyId}/evolve`
5. Evolve workspace opens in elicitation phase, chat seeded with prompt

**"Discuss":**
1. `POST /api/prompts/{id}/act` with `action: "discuss"`
2. Backend creates/retrieves conversation, seeds with prompt
3. Response: `{ conversation_id, legacy_id }`
4. Navigate to `/legacy/{legacyId}?tab=ai-chat&conversation={conversationId}`
5. AI Chat tab opens, persona elaborates on the prompt

## Prompt Selection Logic

### Legacy Selection

`select_legacy(user_id)` picks based on recent activity:
1. Query user's legacies ordered by most recent interaction (story updated_at, conversation updated_at)
2. Falls back to user's first-created legacy if no activity

### Template Selection

`select_template(legacy_id, user_id)` avoids repeats:
1. Load all templates from YAML config
2. Query `story_prompts` for this user+legacy to get used `template_id` values
3. Filter out already-used templates
4. Pick randomly from remaining, preferring categories not recently used
5. If all templates exhausted, reset pool (allow re-use) or try different legacy

### Implicit Rotation

- Active prompts older than 24 hours are auto-rotated on `GET /api/prompts/current`
- Lazy check on API call, no background process needed

### Edge Cases

- **No legacies:** Return 204, frontend hides card
- **All templates used:** Reset usage for least-recently-prompted legacy
- **Legacy deleted:** Prompt marked `rotated` on next fetch, new one generated

## Reused Existing Pieces

- **Evolve flow:** Draft story creation, evolution session, elicitation phase
- **Conversation seeding:** `POST /api/ai/conversations/{id}/seed`
- **AI Chat tab:** Existing Legacy detail page tab with conversation display
- **Config loading pattern:** Same as `personas.yaml` / `personas.py`

## Future Evolution

- **AI-generated prompts:** Replace template selection with an LLM call that examines existing stories and conversations for the legacy, generating questions about topics not yet covered. `template_id` becomes null, `prompt_text` is AI-generated.
- **Periodic staging:** A background job (or login hook) pre-generates several prompts per legacy, stored as `pending` in the DB, promoted to `active` as needed.
- **Multiple prompts:** Show 2-3 prompts (one per legacy) on the dashboard instead of a single card.
