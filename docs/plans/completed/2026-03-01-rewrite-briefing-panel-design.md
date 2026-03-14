# Rewrite Briefing Panel Design — Evolve Workspace

**Date:** 2026-03-01
**Status:** Approved
**Feature:** Replace the disconnected AI Rewrite button with a dedicated Rewrite tool panel that surfaces what feeds the rewrite and provides a deliberate "launch" experience

## Problem

The AI Rewrite button sits isolated in the bottom toolbar with no visual connection to the work the user has done across the Chat, Context, and Style panels. Users don't understand that their conversation turns, pinned facts, and style choices all shape the rewrite. The button feels like a standalone "let AI do whatever" action rather than the culmination of deliberate curation.

## Approach

**Rewrite Briefing Panel** — Promote the rewrite from a bottom-bar button to a full tool panel in the ToolStrip. The panel consolidates style controls (absorbed from the former Style panel) with a live briefing showing exactly what will feed the rewrite. The user reviews the assembled ingredients, then triggers the rewrite from within the panel. This creates a "review before launch" moment that makes the connection between curation and output explicit.

### Design Principles

- **Transparency over magic** — show what feeds the rewrite, don't hide it
- **Deliberate launch** — the user consciously assembles and triggers, not a fire-and-forget button
- **Teach the workflow** — empty states guide users to the right panels to set things up
- **No backend changes** — purely frontend reorganization; rewrite API stays identical

## ToolStrip Reorganization

The ToolStrip gains the Rewrite tool and loses the Style tool (absorbed into Rewrite), keeping the total at 5 icons.

```
ToolStrip (48px):
  ┌────┐
  │ 💬 │  AI Chat        ─┐
  │ 📋 │  Context         │ Assembly tools (feed the rewrite)
  │────│  ← divider      ─┘
  │ 📚 │  Versions       ─┐
  │ 🖼 │  Media           │ Reference tools
  │    │                  ─┘
  │    │  (spacer)
  │────│  ← divider
  │ ✨ │  Rewrite         ← action destination, pinned to bottom
  └────┘
```

**Grouping rationale:**
- **Chat + Context** are the "assembly" tools — they produce the ingredients for the rewrite
- **Versions + Media** are reference/utility tools
- **Rewrite** is the action destination, visually separated at the bottom of the strip

## Rewrite Panel Layout

Three zones: **Style controls** (compact), **Briefing** (live summary of inputs), **Action** (trigger button).

```
┌─────────────────────────────┐
│  Rewrite              [?]   │   ← panel header, help tooltip
├─────────────────────────────┤
│                             │
│  Style                      │
│  ┌─────┬─────┬─────┬─────┐ │
│  │Vivid│Emot.│Conv.│Conc.│ │   ← segmented toggle (single-select)
│  └─────┴─────┴─────┴─────┘ │
│  ┌───────┐                  │
│  │Docum. │                  │   ← 5th option wraps
│  └───────┘                  │
│                             │
│  Length                     │
│  ┌────────┬────────┬──────┐│
│  │Similar │Shorter │Longer││   ← segmented toggle
│  └────────┴────────┴──────┘│
│                             │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│                             │
│  Rewrite will use:          │
│                             │
│  📋 Context                 │
│  "A story about John and    │
│   Rose at Landmark Center"  │
│  3 pinned facts             │
│      📍 Landmark Center     │
│      👤 Rose — grandmother  │
│      💭 Nostalgia           │
│                             │
│  💬 Conversation            │
│  4 turns with               │
│  The Biographer             │
│                             │
├─────────────────────────────┤
│  ┌─────────────────────────┐│
│  │   ✨ Rewrite Story      ││   ← primary action, sticky bottom
│  └─────────────────────────┘│
└─────────────────────────────┘
```

### Style Controls

Compact segmented toggles replace the full-width button cards from the former StyleTool:

**Writing Style** — 5 options in a segmented control (wrapping to second row for the 5th):
- Vivid, Emotional, Conversational, Concise, Documentary
- Tooltips on hover provide descriptions ("Sensory details, atmosphere")
- Single-select; `null` is valid (no style preference)

**Length** — 3 options in a single-row segmented control:
- Similar, Shorter, Longer
- Single-select; defaults to "Similar"

### Briefing Section

Live read from React Query cache and Zustand store. Always current — no manual refresh needed.

**Context subsection:**
- Shows truncated summary (2 lines max) from `story_context.summary`
- Lists pinned facts with category icons and content
- Empty state: "No facts pinned — [pin facts in Context](#) to guide the rewrite" (link switches to Context panel)

**Conversation subsection:**
- Shows turn count and active persona name
- Empty state: "No conversation yet — [chat with a persona](#) to build context" (link switches to AI Chat panel)

**Design note:** Empty states are instructional, not blocking. The user can trigger a rewrite with no facts pinned and no conversation — the rewrite just uses the story content and any style/length preferences. The briefing teaches the workflow but doesn't gatekeep.

### Rewrite Button

- Sticky at the panel bottom, always visible even if briefing scrolls
- **Enabled** when there's story content in the editor
- **Disabled** when editor is empty or a rewrite is actively streaming

## State Transitions

### Idle State
Panel shows style controls + briefing + enabled "Rewrite Story" button.

### Streaming State
After clicking "Rewrite Story":
1. Button transforms to "Rewriting..." with a pulsing animation
2. Editor panel switches to Streamdown view (existing behavior, no change)
3. Briefing section stays visible — user can see what's being applied
4. "Cancel" link appears below the button to abort via AbortController

### Reviewing State
After streaming completes:
1. Editor shows rewritten content with Accept / Discard / Regenerate buttons (existing behavior, no change)
2. Rewrite panel button changes to "Regenerate" label
3. Note below button: "Accept or discard the rewrite in the editor"
4. Style controls remain editable — user can tweak style before regenerating

## Mobile Experience

Mobile follows the existing MobileBottomBar + MobileToolSheet pattern:

- **MobileBottomBar**: Rewrite icon replaces the old standalone AI Rewrite button. Appears in the tool icon row alongside Chat, Context, Versions, Media.
- **Tapping Rewrite icon**: Opens MobileToolSheet with the same Rewrite panel content (style toggles, briefing, trigger button)
- **Triggering rewrite**: Dismisses the sheet so the user sees the streaming result in the editor

## Components Affected

### New
- **`RewriteTool.tsx`** — New tool panel component in `tools/` directory. Contains style controls, briefing section, and rewrite trigger.

### Modified
- **`ToolStrip.tsx`** — Remove Style tool, add Rewrite tool at bottom with divider grouping
- **`ToolPanel.tsx`** — Add RewriteTool to the panel dispatcher, remove StyleTool
- **`EvolveWorkspace.tsx`** — Remove BottomToolbar rendering (desktop), update handleRewrite to work from the panel
- **`MobileBottomBar.tsx`** — Replace standalone rewrite button with Rewrite tool icon
- **`useEvolveWorkspaceStore.ts`** — Remove `'style'` from tool types, add `'rewrite'`. Style state (`writingStyle`, `lengthPreference`) stays in the store.

### Removed
- **`StyleTool.tsx`** — Absorbed into RewriteTool
- **`BottomToolbar.tsx`** — Removed entirely (desktop)

### Unchanged
- **`EditorPanel.tsx`** — No changes to streaming, diff, or accept/discard flow
- **`AIChatTool.tsx`** — No changes
- **`ContextTool.tsx`** — No changes
- **`useAIRewrite.ts`** — Hook stays the same; just called from a different trigger point
- **Backend API** — No changes; rewrite request shape is identical

## Data Flow

```
User assembles ingredients:
  AI Chat    → conversationId, persona (Zustand)
  Context    → pinned facts, summary (React Query cache)
  Rewrite    → writingStyle, lengthPreference (Zustand)

User clicks "Rewrite Story" in RewriteTool:
  ↓
  handleRewrite() gathers:
    - content (editor)
    - conversationId (Zustand)
    - pinnedContextIds (Zustand)
    - context summary + pinned facts (React Query)
    - writingStyle + lengthPreference (Zustand)
  ↓
  triggerRewrite() → POST /api/stories/{storyId}/rewrite (SSE stream)
  ↓
  Editor shows streaming result → user accepts/discards/regenerates
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Rewrite fails during streaming | Button reverts to "Rewrite Story", toast: "Rewrite failed. Try again." |
| Cancel during streaming | Aborts stream, reverts to idle state |
| Context query fails | Briefing shows "Couldn't load context" with retry link |
| No story content | Button disabled with tooltip: "Write or paste story content first" |

## Testing Strategy

- **Component tests**: RewriteTool renders style controls, briefing, and button in correct states
- **Integration tests**: Clicking "Rewrite Story" gathers correct data from store/cache and calls triggerRewrite
- **Empty state tests**: Missing context/conversation shows instructional links
- **State transition tests**: idle → streaming → reviewing → idle cycle
- **Mobile tests**: MobileToolSheet renders RewriteTool correctly
