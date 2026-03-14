# Context Panel Design — Evolve Workspace

**Date:** 2026-03-01
**Status:** Approved
**Feature:** Living context panel for the Evolve workspace that surfaces extracted facts and a narrative summary from both the story text and AI conversation

## Problem

The Context panel in the Evolve workspace is currently a static display of graph-extracted entities and related stories. It doesn't capture what the AI persona learns during conversation, doesn't persist knowledge across sessions, and doesn't feed curated context into story rewrites. Users have no way to see or control what the AI "knows" about their story.

## Approach

**Summary + Facts Hybrid** — Two-section panel with a narrative summary at top and categorized fact cards below. Facts are extracted server-side via LLM from both the story text (seed) and ongoing conversation (incremental). Users curate facts by pinning (include in rewrites), dismissing (hide), or leaving active (visible but not pinned). Extraction runs asynchronously to avoid conversation latency.

### Layered Vision

1. **Layer 1 (this build):** Conversation memory — users see what the AI has learned
2. **Layer 2 (future):** Rewrite fuel — pinned facts shape AI rewrites (wired in this build)
3. **Layer 3 (future):** Story research hub — manual editing, RAG integration, cross-story knowledge

## UI Layout

```
┌─────────────────────────────┐
│  Context          [Refresh] │
├─────────────────────────────┤
│  Summary (collapsible)      │
│  ┌─────────────────────────┐│
│  │ AI-generated narrative  ││
│  │ brief of the story...   ││
│  └─────────────────────────┘│
├─────────────────────────────┤
│  Details          [All ▾]   │
│                             │
│  👤 People                  │
│  [FactCard] [FactCard]      │
│                             │
│  📍 Places                  │
│  [FactCard] [FactCard]      │
│                             │
│  📅 Dates & Periods         │
│  [FactCard]                 │
│                             │
│  💭 Emotions                │
│  [FactCard] [FactCard]      │
│                             │
│  🔗 Relationships           │
│  [FactCard]                 │
│                             │
│  📦 Objects                 │
│  [FactCard]                 │
│                             │
│  ─ New from conversation ─  │
│  [FactCard] [FactCard]      │
└─────────────────────────────┘
```

### FactCard Interactions

- **Checkbox (pin):** Checked = pinned, included in rewrite context
- **Dismiss (X on hover):** Hides the fact, sets status to `dismissed`
- **Category icon + content + optional detail text**
- **Source indicator:** Subtle badge for "from story" vs "from chat"

### Component Structure

```
ContextTool (refactored)
├── ContextSummary         — Collapsible summary section
├── ContextFilter          — Category dropdown ("All", "People", etc.)
├── FactGroup              — One group per category
│   └── FactCard[]         — Individual fact with pin/dismiss
├── NewFactsBanner         — "New from conversation" separator + facts
└── ExtractingIndicator    — Shown during background extraction
```

## Data Model

### `story_context` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `story_id` | UUID | FK to stories |
| `user_id` | UUID | FK to users |
| `summary` | TEXT | AI-generated narrative summary |
| `summary_updated_at` | TIMESTAMP | Last summary update |
| `created_at` | TIMESTAMP | Session start |
| `updated_at` | TIMESTAMP | Last modification |

### `context_facts` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `story_context_id` | UUID | FK to story_context |
| `category` | ENUM | `person`, `place`, `date`, `event`, `emotion`, `relationship`, `object` |
| `content` | VARCHAR(500) | The fact text (e.g., "Rose", "Portland, OR") |
| `detail` | VARCHAR(1000) | Optional elaboration (e.g., "John's grandmother") |
| `source` | ENUM | `story`, `conversation` |
| `source_message_id` | UUID | Nullable FK to message that produced this fact |
| `status` | ENUM | `active`, `pinned`, `dismissed` |
| `created_at` | TIMESTAMP | When extracted |

### Key Constraints

- One `story_context` per (story_id, user_id) pair
- Facts deduplicated by category + content similarity
- `source_message_id` enables "trace back to conversation" (future)

## Extraction Pipeline

### Trigger 1: Story Seed Extraction

On workspace open:

1. Frontend calls `POST /api/stories/{storyId}/context/extract`
2. Backend checks for existing `story_context`:
   - Exists and story unchanged → return cached (no re-extraction)
   - New or story updated → run extraction
3. Extraction runs as async background task:
   - Sends story content to LLM with structured extraction prompt
   - LLM returns JSON: `{ summary, facts: [{category, content, detail}] }`
   - Persists to `story_context` + `context_facts` with `source: 'story'`
4. Returns `202 Accepted` immediately
5. Frontend shows "Analyzing story..." skeleton, refetches when ready

### Trigger 2: Conversation Extraction

After each assistant message:

1. Backend saves the assistant message (existing flow, no changes)
2. Fires async background task (no conversation latency impact):
   - Sends latest exchange + existing facts to LLM
   - Prompt: "Extract NEW facts not already known. Return updated summary."
   - Deduplicates against existing facts
   - Persists new facts with `source: 'conversation'` and `source_message_id`
   - Updates summary
3. Frontend picks up changes on next Context tab visit (staleTime-based refetch)

### LLM Prompts

**Seed extraction:**
```
Given this story text, extract structured facts and a brief summary.

Return JSON:
{
  "summary": "2-3 sentence narrative brief",
  "facts": [
    { "category": "person|place|date|event|emotion|relationship|object",
      "content": "short label",
      "detail": "optional elaboration" }
  ]
}

Story text:
{content}
```

**Conversation extraction:**
```
Given this conversation exchange and known facts, extract NEW information only.

Known facts:
{existing_facts_json}

Latest exchange:
User: {user_message}
Assistant: {assistant_response}

Return JSON:
{
  "updated_summary": "revised 2-3 sentence brief incorporating new info",
  "new_facts": [
    { "category": "...", "content": "...", "detail": "..." }
  ]
}
```

## API Design

### New Endpoints

**`GET /api/stories/{storyId}/context`**

Returns current context (summary + facts).

```json
{
  "id": "uuid",
  "story_id": "uuid",
  "summary": "This story captures...",
  "summary_updated_at": "2026-03-01T...",
  "extracting": false,
  "facts": [
    {
      "id": "uuid",
      "category": "person",
      "content": "John",
      "detail": "The narrator, recalling childhood",
      "source": "story",
      "status": "pinned",
      "created_at": "..."
    }
  ]
}
```

**`POST /api/stories/{storyId}/context/extract`**

Triggers seed extraction. Returns `202 Accepted`.

```json
// Request (optional)
{ "force": false }

// Response
{ "status": "extracting" }
```

**`PATCH /api/stories/{storyId}/context/facts/{factId}`**

Updates fact status.

```json
// Request
{ "status": "pinned" | "active" | "dismissed" }

// Response: updated fact object
```

### Changes to Existing Endpoints

**`POST /api/stories/{storyId}/rewrite`** — extended request body:

```json
{
  "content": "...",
  "conversation_id": "...",
  "pinned_context_ids": ["story-1"],
  "context_summary": "...",
  "pinned_facts": [
    { "category": "person", "content": "Rose", "detail": "grandmother" }
  ],
  "writing_style": "vivid",
  "length_preference": "longer",
  "persona_id": "biographer"
}
```

## Frontend State & Data Flow

### TanStack Query

```typescript
// Query keys
['stories', storyId, 'context']  // GET context + facts

// Hooks
useStoryContext(storyId)      // Returns { summary, facts, extracting }
useExtractContext(storyId)    // Mutation: POST extract
useUpdateFactStatus(storyId)  // Mutation: PATCH fact status
```

### Zustand Store (minimal additions)

```typescript
// New fields in useEvolveWorkspaceStore
contextFilter: FactCategory | 'all'
setContextFilter: (filter) => void
```

Fact pinning is server-side (PATCH), not local Zustand state, because it must persist and be available to the rewrite backend.

### Data Flow

1. **Workspace opens** → `useStoryContext` fires → if no context, triggers extract → panel shows skeleton → facts appear when ready
2. **User chats** → message streams as usual → backend async-extracts facts → user switches to Context tab → refetch shows new facts in "New from conversation" section
3. **User pins/dismisses fact** → `useUpdateFactStatus` fires PATCH → optimistic cache update → pinned facts available for rewrite
4. **User triggers rewrite** → gathers pinned facts + summary from query cache → sends to rewrite endpoint as structured context

## Rewrite Integration

```typescript
// Enhanced rewrite trigger
const triggerRewrite = () => {
  const context = queryClient.getQueryData(['stories', storyId, 'context'])
  const pinnedFacts = context?.facts
    .filter(f => f.status === 'pinned')
    .map(({ category, content, detail }) => ({ category, content, detail }))

  streamRewrite(storyId, {
    content,
    conversation_id: conversationId,
    pinned_context_ids: pinnedContextIds,
    context_summary: context?.summary,
    pinned_facts: pinnedFacts,
    writing_style: writingStyle,
    length_preference: lengthPreference,
    persona_id: activePersonaId,
  })
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Seed extraction fails | Panel: "Couldn't analyze story. Try refreshing." + retry button |
| Conversation extraction fails | Silent — conversation continues, context doesn't update. Logged server-side |
| Fact PATCH fails | Optimistic update rolled back, toast: "Couldn't update. Try again." |
| Context GET fails | Panel shows error state with retry |
| No facts extracted | Panel: "No details found yet. Continue chatting to build context." |

## Edge Cases

- **Deduplication:** Backend merges facts with same category + similar content (e.g., "John" from story and "John" from conversation become one fact with enriched detail)
- **Long stories:** Extraction prompt includes token budget; focuses on key entities for very long content
- **Multiple personas:** Context is shared across personas for the same story. Facts from any persona conversation are visible regardless of active persona.
- **Story content changes:** If user edits the story content significantly and re-extracts, new facts are merged with existing ones (not replaced)

## Testing Strategy

- **Backend:** Unit tests for extraction service, integration tests for API endpoints, mock LLM responses
- **Frontend:** Component tests for ContextTool, FactCard interactions, loading/error states
- **E2E:** Workspace open → context loads → chat → new facts appear → pin fact → rewrite includes it
