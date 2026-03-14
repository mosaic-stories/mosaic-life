# Evolve Conversation to Story — Design

**Date:** 2026-03-08
**Status:** Approved
**GitHub Issue:** TBD

## Problem

Users chatting with AI personas in the Legacy AI Chat panel may stumble upon narrative-rich memories worth preserving as stories. Today there's no way to promote a free-form legacy conversation into a new story — the Evolve Workspace only works with existing stories.

## Solution

Allow users to "evolve" a legacy conversation into a new draft story, transporting the conversation context into the Evolve Workspace where the AI summarizes what it heard and guides the user toward creating a story.

## Design Decisions

- **Backend-orchestrated**: A single atomic endpoint handles story creation, conversation cloning, and breadcrumb insertion — no partial failure states.
- **Clone, don't reassign**: The original conversation is preserved intact. A cloned conversation seeds the Evolve Workspace. A system notification in the original links to the new story.
- **AI summary on arrival**: When the cloned conversation lands in the workspace, the AI summarizes narrative threads and asks the user how they want to proceed, hinting at the Writer tool.
- **Two trigger mechanisms**: A persistent toolbar button for intentional use, plus an AI-initiated inline suggestion card for discoverability.
- **No new workflow phases**: Uses the standard Evolve Workspace experience — no special evolution session or phased workflow.

## Data Model Changes

### `AIConversation` — new fields

| Field | Type | Description |
|-------|------|-------------|
| `source_conversation_id` | `UUID \| None` | FK to original conversation this was cloned from |
| `story_id` | `UUID \| None` | FK to Story, direct conversation-story association |

### `AIMessage` — new fields

| Field | Type | Description |
|-------|------|-------------|
| `message_type` | `str` | `"chat"` (default), `"system_notification"`, `"evolve_suggestion"` |
| `metadata` | `JSON \| None` | Structured data (e.g., `{"story_id": "...", "story_title": "..."}`) |

### `Story` — new field

| Field | Type | Description |
|-------|------|-------------|
| `source_conversation_id` | `UUID \| None` | Conversation that spawned this story (provenance) |

No new tables required.

## Backend API

### `POST /api/ai/conversations/{conversation_id}/evolve`

**Request:**
```json
{
  "title": "optional story title"
}
```

**Behavior (atomic):**
1. Validate user owns conversation and it has a legacy association
2. Create `Story` (status=draft, visibility=personal) linked to the conversation's legacy
3. Clone `AIConversation` with `source_conversation_id` → original, `story_id` → new story, same persona/legacy associations
4. Copy all `AIMessage` records into cloned conversation (preserving order, roles, content)
5. Insert `system_notification` message in original conversation with story link metadata
6. Return new story ID, conversation ID, story title

**Response:**
```json
{
  "story_id": "...",
  "conversation_id": "...",
  "story_title": "..."
}
```

### `POST /api/ai/conversations/{conversation_id}/seed` — enhanced

New parameter: `seed_mode`
- `"default"` — current behavior (persona opening message)
- `"evolve_summary"` — AI summarizes narrative threads from prior messages, asks how user wants to proceed, hints at Writer tool in toolbar

## AI Evolve Suggestion Mechanism

### Prompt Engineering

Added to persona base rules in `personas.yaml`:

> When you notice the user sharing a rich, narrative-worthy memory — something with emotional depth, vivid details, or a meaningful arc — you may suggest evolving the conversation into a story. To do so, include the marker `<<EVOLVE_SUGGEST: your brief reason here>>` in your response. Use this sparingly — at most once per conversation, and only when the content genuinely warrants it.

### SSE Event

During streaming, the backend scans for the `<<EVOLVE_SUGGEST: ...>>` marker:
- Strips it from the visible response text
- Emits a separate SSE event:

```
event: evolve_suggestion
data: {"reason": "This memory about your grandfather's workshop sounds like a wonderful story worth preserving."}
```

### Frontend Rendering

The `EvolveSuggestionCard` component renders inline below the message:
- Visually distinct (subtle background, branch/sparkle icon)
- Displays the AI's reason text
- "Evolve into Story" button triggers the evolve endpoint
- Stored in chat store for persistence

## Frontend Components

### Legacy AI Chat Panel

1. **Evolve Toolbar Button** — Icon button in chat header, visible when conversation has a legacy and messages. Triggers evolve endpoint + navigation.

2. **EvolveSuggestionCard** — Inline actionable card rendered from `evolve_suggestion` SSE events.

3. **SystemNotificationMessage** — Renders `system_notification` messages with muted style, info icon, and clickable story link.

### Evolve Workspace

4. **Conversation Seeding** — When workspace loads a story with `source_conversation_id`, the AI chat tool opens pre-loaded with cloned conversation. Seed endpoint fires with `seed_mode: "evolve_summary"`.

5. **Writer Tool Pulse Animation** — After the AI summary seed completes, the Writer tool icon pulses/glows (CSS animation, 2-3 cycles). Dismisses on click or timeout. Triggered by a state flag in the workspace store.

## Navigation Flow

```
Legacy Chat → click "Evolve" button or suggestion card
  → POST /api/ai/conversations/{id}/evolve
  → API creates story + clones conversation + drops breadcrumb
  → Navigate to /legacies/{id}/stories/{newStoryId}
  → Evolve Workspace loads with cloned conversation
  → AI seeds summary via evolve_summary mode
  → Writer tool icon pulses to draw attention
  → User clicks Writer tool → standard rewrite flow
```

## Out of Scope

- Agentic AI that can trigger writes autonomously
- Changes to existing evolution phases/workflow
- Conversation indexing or cross-platform conversation search
- Multi-conversation-to-story merging
- Decommissioning old evolution session code (tracked in #63)
