# Story Evolution: Design Document

**Date:** 2026-02-17
**Status:** Approved
**Feature Spec:** [2026-02-16-ai-storywriter-idea.md](2026-02-16-ai-storywriter-idea.md)

---

## Overview

Story Evolution enables users to deepen and expand existing stories through guided conversation with AI personas, followed by AI-assisted draft generation. A user initiates the flow from an existing story, engages in a Socratic elicitation conversation with a persona, and a specialized writing agent produces a new version incorporating the details surfaced during the conversation.

This design document captures the decisions made during brainstorming and defines the v1 implementation scope.

---

## Scope

### v1 (This Design)

- Dedicated evolution workspace page (`/stories/:storyId/evolve`)
- `StoryEvolutionSession` model to orchestrate workflow state
- Elicitation mode augmentation for existing personas (Biographer, Friend)
- Structured summary checkpoint with user verification
- Writing style selection (5 styles: Vivid, Emotional, Conversational, Concise, Documentary)
- Length preference selection (similar, shorter, longer)
- Standalone `StoryWriterAgent` with streaming draft generation
- Incremental revision with previous draft as input
- Draft persistence via existing `StoryVersion` draft system
- Full session resumability across browser sessions
- Hybrid phase transitions (persona-suggested + user-initiated UI controls)

### v2 (Deferred)

- RAG insights sidebar (live-updated related stories/facts)
- Outstanding questions panel
- Timeline/places widgets
- Side-by-side diff between original and draft
- Annotation/commenting on draft sections
- Natural writing style with style fingerprinting
- Workspace extensibility (pluggable analysis tools)

---

## Data Model

### New Table: `story_evolution_sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID, PK | Session identifier |
| `story_id` | FK → stories | The story being evolved |
| `base_version_number` | integer | Active version number when session started (staleness detection) |
| `conversation_id` | FK → ai_conversations | Linked elicitation conversation |
| `draft_version_id` | FK → story_versions, nullable | Points to the draft once generated |
| `phase` | enum | Current workflow phase (see below) |
| `summary_text` | text, nullable | Structured summary confirmed by user |
| `writing_style` | string, nullable | Selected style: vivid, emotional, conversational, concise, documentary |
| `length_preference` | string, nullable | Selected preference: similar, shorter, longer |
| `revision_count` | integer, default 0 | Number of writing agent passes |
| `created_by` | FK → users | Session creator |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Phase enum values:** `elicitation`, `summary`, `style_selection`, `drafting`, `review`, `completed`, `discarded`

**Constraints:**
- Unique partial index: one non-terminal session per story (where phase not in `completed`, `discarded`). Prevents multiple simultaneous evolution sessions on the same story.

### Changes to Existing Models

- **`StoryVersion.source`** — new value: `'story_evolution'`
- **`StoryVersion.source_conversation_id`** — nullable FK to `ai_conversations`. Optional provenance link from a version to the conversation that produced it. Nullable because conversations can be independently deleted.
- **`AIConversation`** — no changes. The `StoryEvolutionSession` holds the relationship.

---

## API Design

### New Route Group: `/api/stories/{story_id}/evolution`

All endpoints require authentication. The user must be the story's author.

#### `POST /api/stories/{story_id}/evolution`

Start a new evolution session.

- Creates a `StoryEvolutionSession` in `elicitation` phase
- Creates a linked `AIConversation` with the selected persona, tagged for elicitation mode
- Returns: session ID, conversation ID, phase
- **409 Conflict** if a non-terminal session already exists for this story

**Request body:**
```json
{
  "persona_id": "biographer"
}
```

#### `GET /api/stories/{story_id}/evolution/active`

Get the active session for this story (for resumability).

- Returns full session state: phase, summary, style, length preference, draft version ID, conversation ID
- **404** if no active session exists

#### `PATCH /api/stories/{story_id}/evolution/{session_id}/phase`

Advance the workflow phase.

- Validates legal transitions (see Phase Transition Rules below)
- Body includes target phase and phase-specific data

**Request body examples:**
```json
// Elicitation → Summary
{
  "phase": "summary",
  "summary_text": "## New Details\n- Uncle Ray was present\n..."
}

// Summary → Style Selection (confirm summary)
{
  "phase": "style_selection",
  "writing_style": "vivid",
  "length_preference": "similar"
}

// Summary → Elicitation (go back for more)
{
  "phase": "elicitation"
}
```

#### `POST /api/stories/{story_id}/evolution/{session_id}/generate`

Trigger draft generation.

- Packages context and calls the writing agent
- Streams the result via SSE
- Creates or updates the `StoryVersion` draft record
- Sets `draft_version_id` on the session
- Advances phase: `style_selection` → `drafting` → `review`
- Valid from `style_selection` phase

**SSE stream format:**
```
event: chunk
data: {"text": "token text here"}

event: done
data: {"version_id": "uuid", "version_number": 5}
```

#### `POST /api/stories/{story_id}/evolution/{session_id}/revise`

Submit revision feedback and regenerate.

- Repackages context with previous draft + revision instructions
- Calls writing agent, streams updated draft via SSE
- Updates the existing draft `StoryVersion` record
- Increments `revision_count`
- Valid from `review` phase

**Request body:**
```json
{
  "instructions": "Make paragraph two longer and mention that it was raining"
}
```

#### `POST /api/stories/{story_id}/evolution/{session_id}/accept`

Accept the draft.

- Promotes draft version to active using existing `create_version()` flow
- Sets `source_conversation_id` on the new version
- Triggers embedding re-indexing
- Sets session phase to `completed`
- Valid from `review` phase

#### `POST /api/stories/{story_id}/evolution/{session_id}/discard`

Discard the session.

- Deletes the draft `StoryVersion` if one exists
- Sets session phase to `discarded`
- Story remains unchanged
- Valid from any non-terminal phase

### Phase Transition Rules

```
elicitation → summary        (persona generates summary)
elicitation → discarded      (user abandons)
summary     → style_selection (user confirms summary)
summary     → elicitation    (user wants more conversation)
summary     → discarded      (user abandons)
style_selection → drafting   (triggered by generate endpoint)
drafting    → review         (draft generation complete)
review      → completed     (user accepts)
review      → discarded     (user discards)
review      → review        (revision cycle via revise endpoint)
```

### Existing Endpoints Used (No Changes)

- `POST /api/ai/conversations/{id}/messages` — Elicitation conversation messages. The backend detects the conversation is linked to an evolution session and augments the persona's system prompt with the elicitation directive.

---

## Writing Agent Architecture

### `StoryWriterAgent`

**Location:** `services/core-api/app/services/story_writer.py`

A standalone generation service, separate from the conversational `StorytellingAgent`. It takes structured input and produces a complete story draft. It is not a persona — it has no conversation memory, no RAG retrieval during generation, and no multi-turn state.

### Input Context Package

| Field | Source | Required |
|-------|--------|----------|
| Original story text | Active `StoryVersion` content | Yes |
| Structured summary | `StoryEvolutionSession.summary_text` | Yes |
| Relationship metadata | `LegacyMember` + `Legacy` fields | Yes |
| Style directive | Loaded from style template file | Yes |
| Length preference | `StoryEvolutionSession.length_preference` | Yes |
| Legacy metadata | Name, birth/death dates, biography | Yes |
| Previous draft | Existing draft `StoryVersion` content (revision mode only) | Revision only |
| Revision instructions | User's feedback text (revision mode only) | Revision only |

### System Prompt Structure

The system prompt is assembled from constant core instructions plus a swappable style directive:

**Core instructions (all styles):**
- You are a ghostwriter. The output should read as if the user wrote it.
- Only include details from the original story or the provided summary. Never invent names, dates, locations, or events.
- Use the names and terms from the relationship metadata (e.g., if the user calls the Legacy "Papa," use "Papa").
- Respect the length preference: "similar" means stay within ~20% of original word count, "shorter" means reduce, "longer" means allow expansion.
- Produce the complete story text, not a diff or partial update.

**Revision mode (appended when revising):**
- Revise the following draft based on the user's feedback.
- Preserve everything the user didn't ask to change.
- Apply the revision instructions precisely.

### Style Directives

Stored as prompt template files under `services/core-api/app/config/writing_styles/`:

| File | Style | Focus |
|------|-------|-------|
| `vivid.txt` | Vivid | Sensory details, setting, atmosphere, descriptive language, specific imagery |
| `emotional.txt` | Emotional | Emotional arc, feelings, relationships, internal experience, significance |
| `conversational.txt` | Conversational | Informal tone, personal, direct, matching the chat persona's voice |
| `concise.txt` | Concise | Distilled, tight, impact per word, suitable for reading aloud |
| `documentary.txt` | Documentary | Factual, chronological, third-person, biographical, secondhand accounts |

Each file is a 100-200 word instruction block that gets injected into the system prompt.

### Output

An async generator yielding text chunks, using the existing `LLMProvider.stream_generate()` interface. The calling endpoint collects chunks for persistence and simultaneously streams them to the client via SSE.

---

## Elicitation Mode

### Approach: System Prompt Augmentation

Elicitation mode is not a new persona. When the backend detects that a conversation's linked `StoryEvolutionSession` is in the `elicitation` phase, it appends an elicitation directive to the existing persona's system prompt. This means any persona (Biographer, Friend, etc.) can be used for story evolution, each bringing their natural elicitation style.

### Elicitation Directive

**Location:** `services/core-api/app/config/elicitation_mode.txt`

The directive instructs the persona to:
- Shift into Socratic questioning mode — ask probing, open-ended questions
- Focus areas: sensory details, emotions, timeline/sequence, other people present, what the moment meant, cause and effect
- Cross-reference other stories and known facts via RAG when relevant
- Never fabricate or suggest details — only elicit from the user
- Track new information surfaced during the conversation
- When the user signals readiness (or when enough depth is reached), produce a structured summary

### Context Loading

- **Full active story text** is injected directly into the conversation context (not via RAG). This ensures the persona has the complete original story.
- **RAG remains active** for adjacent stories and legacy facts, providing cross-referencing material.
- **Relationship metadata** is included so the persona uses correct names and terms.

### Summary Format

When producing the summary (either persona-initiated or user-triggered), the persona formats it with these categories:
- **New Details** — Facts, events, descriptions surfaced in conversation
- **People Mentioned** — New people or expanded details about existing people
- **Timeline/Sequence** — Temporal ordering, dates, sequences clarified
- **Emotions/Significance** — What moments meant, how people felt
- **Corrections to Original** — Anything the user wants changed from the existing story

---

## Frontend: Evolution Workspace

### Route

`/stories/:storyId/evolve` — a dedicated page for the story evolution workflow.

### Feature Directory

`apps/web/src/features/story-evolution/`

### Layout by Phase

The workspace adapts its layout based on the current session phase:

**Elicitation Phase** — Two panels:
- **Left panel:** Original story text (read-only, scrollable). Displays title, content, and legacy info.
- **Right panel:** Conversation panel. Reuses chat components from `AIAgentChat` (message list, input box, persona indicator). Banner at top: "Evolving: [Story Title]". Workflow control strip at the bottom with a "Ready to summarize" button (appears after 3+ exchanges).

**Summary Phase** — Two panels:
- **Left panel:** Original story (unchanged).
- **Right panel:** Summary checkpoint view. Displays the structured summary in categorized sections. Three actions: "Looks good" (advance to style selection), "I want to add more" (return to elicitation), "Continue chatting" (return to elicitation).

**Style Selection Phase** — Overlay or inline panel:
- Card-based selection for writing style (5 options with short descriptions of each style).
- Radio options for length preference (keep similar, make shorter, allow longer).
- "Generate draft" button.

**Drafting Phase** — Two panels:
- **Left panel:** Original story.
- **Right panel:** Draft panel with streaming text appearing in real-time. Progress indicator during generation.

**Review Phase** — Two panels:
- **Left panel:** Original story.
- **Right panel:** Generated draft (scrollable). "What's New" summary displayed above the draft text. Action bar at the bottom: "Accept," "Discard," "Request changes" (opens conversation panel for revision feedback).

### Phase Transitions: Hybrid Model

The workflow supports both user-initiated and persona-suggested transitions:

- **User-initiated:** Explicit UI controls (buttons) are available for every transition. The "Ready to summarize" button appears in the conversation panel after a minimum number of exchanges.
- **Persona-suggested:** The persona can naturally suggest moving forward (e.g., "I think we've covered a lot of ground — shall I summarize what we've learned?"). The user confirms in the chat, and the frontend advances the phase.

This hybrid approach ensures no user is excluded based on their preferred interaction style.

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `StoryEvolutionWorkspace` | Top-level page, phase router, layout manager |
| `ElicitationPanel` | Conversation UI with elicitation controls |
| `SummaryCheckpoint` | Structured summary display with confirm/edit/continue actions |
| `StyleSelector` | Writing style cards + length preference selector |
| `DraftStreamPanel` | Streaming draft display with progress indicator |
| `DraftReviewPanel` | Final draft display + What's New summary + accept/discard/revise actions |
| `EvolutionBanner` | Top banner showing session status and linked story title |
| `PhaseIndicator` | Visual indicator of current workflow phase |

---

## Session Resumability

### Persistence

All session state is persisted in the database:
- **Workflow state** — `StoryEvolutionSession` record holds phase, summary, style, length preference
- **Conversation history** — `AIConversation` + `AIMessage` records (already persisted by existing chat system)
- **Draft** — `StoryVersion` with `status='draft'` (already persisted by existing version system)

### Resume Flow

When the user navigates to a story with an active evolution session:

1. **On the story page** (`StoryCreation.tsx`): A banner appears — "You have a story evolution in progress. Continue?" with a link to the workspace.
2. **Navigating directly to `/stories/:storyId/evolve`:** The workspace calls `GET /api/stories/{story_id}/evolution/active`, loads the session state, and renders at the correct phase. Conversation history loads from the existing messages endpoint. Draft content loads from the version endpoint if one exists.

### Staleness Detection

The `base_version_number` field on the session tracks which version was active when the session started. If the story's active version changes during a session (e.g., the user edited the story separately):
- The workspace shows a warning: "The story has been updated since you started this session."
- The user can choose to continue with the original base or discard and restart.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Writing agent fails mid-stream | Partial draft discarded, phase reverts to `style_selection`, error message with retry option |
| Session stale (base version changed) | Warning banner, option to continue or restart |
| Concurrent session attempt | API returns 409 Conflict pointing to existing session |
| User deletes conversation independently | Session orphaned. On next load, detect missing conversation, offer restart or discard |
| Network disconnection during streaming | Client reconnects, checks session state, resumes from last persisted state |

---

## Integration Points with Existing Systems

| System | Integration |
|--------|-------------|
| Story versioning | Draft creation via `StoryVersion(status='draft', source='story_evolution')`. Approval via existing `create_version()`. Discard via existing draft deletion. |
| AI conversation | New `AIConversation` created per session. Messages flow through existing `/api/ai/conversations/{id}/messages` endpoint. |
| RAG retrieval | Existing `retrieve_context()` provides adjacent story chunks and legacy facts during elicitation. |
| Embedding pipeline | Existing `index_story_chunks()` triggered on draft acceptance for re-indexing. |
| Change summary | Existing LLM-based `change_summary` service auto-generates summary on version creation. |
| Personas | Existing persona configs in `personas.yaml` used as-is. Elicitation mode is an additive augmentation. |
| LLM provider | Writing agent uses same `LLMProvider.stream_generate()` interface via provider registry. |

---

## Implementation Notes

### New Files (Backend)

- `app/models/story_evolution.py` — `StoryEvolutionSession` SQLAlchemy model
- `app/routes/story_evolution.py` — API endpoints
- `app/services/story_writer.py` — `StoryWriterAgent` implementation
- `app/schemas/story_evolution.py` — Pydantic request/response schemas
- `app/config/elicitation_mode.txt` — Elicitation directive prompt
- `app/config/writing_styles/vivid.txt` — Style directive
- `app/config/writing_styles/emotional.txt` — Style directive
- `app/config/writing_styles/conversational.txt` — Style directive
- `app/config/writing_styles/concise.txt` — Style directive
- `app/config/writing_styles/documentary.txt` — Style directive
- `alembic/versions/xxx_add_story_evolution_sessions.py` — Migration

### New Files (Frontend)

- `src/features/story-evolution/StoryEvolutionWorkspace.tsx` — Main page
- `src/features/story-evolution/ElicitationPanel.tsx`
- `src/features/story-evolution/SummaryCheckpoint.tsx`
- `src/features/story-evolution/StyleSelector.tsx`
- `src/features/story-evolution/DraftStreamPanel.tsx`
- `src/features/story-evolution/DraftReviewPanel.tsx`
- `src/features/story-evolution/EvolutionBanner.tsx`
- `src/features/story-evolution/PhaseIndicator.tsx`
- `src/lib/api/evolution.ts` — API client functions
- `src/lib/hooks/useEvolution.ts` — TanStack Query hooks

### Modified Files

- `app/adapters/storytelling.py` — Detect evolution session, append elicitation directive in `prepare_turn()`
- `app/models/__init__.py` — Register new model
- `apps/web/src/components/StoryCreation.tsx` — Add "Evolve this story" button + resume banner
- `apps/web/src/app/` — Add route for `/stories/:storyId/evolve`
