# Evolve Workspace Design

**Date:** 2026-02-26
**Status:** Approved
**Replaces:** Current 5-stage story evolution flow (elicitation → summary → style → drafting → review)

---

## Overview

Replace the linear 5-stage story evolution pipeline with a unified, non-linear workspace. The workspace puts an editable TipTap story editor front-and-center with a vertical tool strip providing access to AI chat, graph context, versions, media, and style preferences. AI rewrites produce a full rewrite that users review via a toggleable diff/editor view.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Scope | Replace the 5-stage flow entirely |
| AI editing model | Full rewrite + diff view |
| AI panel | Conversational chat (existing pattern) |
| Context tool | Graph-connected stories & entities |
| Mobile | Bottom sheet tools via Vaul drawers |
| Layout | Resizable panels (`react-resizable-panels`, already installed) |

---

## Section 1: Workspace Layout Architecture

The workspace lives at the existing route `/legacy/:legacyId/story/:storyId/evolve` and uses three zones built on `react-resizable-panels`:

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: ← Back to story  │  "The Summer of '92"  │  Save      │
├──────────────────────────────┬───┬──────────────────────────────┤
│                              │   │                              │
│                              │ T │                              │
│   TipTap Editor              │ B │   Active Tool Panel          │
│   (editable story content)   │   │   (AI Chat / Context /       │
│                              │   │    Versions / Media / Style) │
│                              │   │                              │
│                              │   │                              │
├──────────────────────────────┴───┴──────────────────────────────┤
│  ✨ AI Rewrite  │  Style  │  Length  │              word count   │
└─────────────────────────────────────────────────────────────────┘
```

### Component tree

```
<EvolveWorkspace>
  <WorkspaceHeader />
  <ResizablePanelGroup direction="horizontal">
    <ResizablePanel defaultSize={65}>
      <EditorPanel />
    </ResizablePanel>
    <ToolStrip />                        // fixed 48px, outside resizable system
    <ResizablePanel defaultSize={35}>
      <ToolPanel activeTool={...} />
    </ResizablePanel>
  </ResizablePanelGroup>
  <BottomToolbar />
</EvolveWorkspace>
```

### Panel sizing

- **Editor panel**: defaults to 65%, min 40%, max 80%. Contains TipTap with story content, editable at all times.
- **Tool strip**: fixed 48px column. Vertically stacked icon buttons. Active tool highlighted.
- **Tool panel**: defaults to 35%, min 20%. Content swaps based on selected tool icon.
- **Bottom toolbar**: fixed bar outside the resizable area. Primary AI actions.
- **Header**: title, save status, back navigation. No phase indicator.

---

## Section 2: Tool Strip & Tool Panels

### Tool strip icons (top to bottom)

| Icon | Tool ID | Label |
|------|---------|-------|
| `MessageSquare` | `ai-chat` | AI Persona |
| `GitBranch` | `context` | Context |
| `History` | `versions` | Versions |
| `Image` | `media` | Media |
| `Pen` | `style` | Style |

Extensible later with People, Places, Events, Objects as dedicated tools.

### AI Persona Panel (`ai-chat`)

Reuses the existing `useAIChat` hook and chat UI from `ElicitationPanel`, adapted to fit in the side panel. Persona selector at the top (dropdown or icon row for biographer/friend/colleague/family). Chat messages below. Input at bottom. Conversation persists when switching tools.

### Context Panel (`context`)

Calls `GraphContextService` backend to show:

- **Related Stories** section: clickable cards with title + snippet. Clicking opens a preview or inserts a reference.
- **Entities** section: grouped by type (People, Places, Events, Objects) as tag chips. Tapping an entity shows connected stories.
- Auto-refreshes based on current story content (debounced).
- Users can "pin" items to keep them in the AI's context for the next rewrite.

### Versions Panel (`versions`)

Adapts the existing `VersionHistoryDrawer` content into the side panel. Adds a diff view trigger: selecting a version switches the editor panel to diff view showing current vs. selected version.

### Media Panel (`media`)

- Drop zone at top for uploads.
- "Legacy Media" grid showing thumbnails from the legacy's media library.
- "Click to insert into story" inserts the image at the editor's cursor position.
- Reuses existing `useMediaUpload` hook.

### Style Panel (`style`)

Persists writing style and length preferences for the session. Uses existing style options (vivid, emotional, conversational, concise, documentary) and length options (similar, shorter, longer). Preferences feed into the AI rewrite.

---

## Section 3: AI Rewrite Flow & View Modes

### Triggering a rewrite

The bottom toolbar "AI Rewrite" button gathers context and streams the result:

1. Snapshots current editor content as `originalContent`
2. Sends to backend: content + conversation history + pinned context IDs + style/length prefs
3. Streams rewrite back via SSE
4. User reviews in their preferred view mode

### View modes (freely toggleable)

A toggle in the editor panel header switches between two views:

```
┌─────────────────────────────────────────────────┐
│  View:  [Editor]  [Diff]          AI Rewrite ●  │
├─────────────────────────────────────────────────┤
│  (content displayed based on selected view)     │
├─────────────────────────────────────────────────┤
│   Accept    Discard    Regenerate               │
└─────────────────────────────────────────────────┘
```

| Mode | Behavior |
|------|----------|
| **Editor view** | Rewritten content loaded into TipTap, fully editable. User can tweak the AI output directly. |
| **Diff view** | Read-only unified diff (red/green inline highlights) showing changes from original. |

### Key behaviors

- **Toggle is instant** — both views reference the same content. Edits in editor view are reflected in diff view (diff recomputes against original).
- **While streaming** — both views work. Editor view shows TipTap with streaming indicator. Diff view shows diff growing progressively.
- **Default view** remembered per user in localStorage. First-time default: Editor view.
- **Accept** — saves current content (including manual edits) as a new version.
- **Discard** — restores original content in the editor.
- **Regenerate** — re-triggers rewrite, preserves view mode preference.

### Diff implementation

- `diff-match-patch` (new npm dependency) computes diffs between original and rewritten content.
- Rendered as inline red/green highlighted `<span>` elements in a read-only view.
- Diff view replaces TipTap temporarily in the same panel.

---

## Section 4: State Management & Data Flow

### New Zustand store: `useEvolveWorkspaceStore`

```typescript
interface EvolveWorkspaceState {
  // Tool panel
  activeTool: 'ai-chat' | 'context' | 'versions' | 'media' | 'style';

  // AI rewrite
  rewriteState: 'idle' | 'streaming' | 'reviewing';
  rewriteContent: string | null;
  originalContent: string | null;
  viewMode: 'editor' | 'diff';

  // Style preferences (persist for session)
  writingStyle: WritingStyle | null;
  lengthPreference: LengthPreference | null;

  // Pinned context items
  pinnedContextIds: string[];
}
```

### TanStack Query (server state)

Reuses existing hooks:

- `useStory(storyId)` — load story content
- `useVersions(storyId)` — version history list
- `useAIChat` — persona conversation (unchanged)

New hooks:

- `useGraphContext(storyId)` — fetches related stories/entities from GraphContextService
- `useAIRewrite` — streaming rewrite mutation

### State boundaries

- **TanStack Query**: story data, versions, graph context (server-derived, cacheable)
- **Zustand**: UI state only (active tool, view mode, rewrite lifecycle, pinned items, style prefs)
- **localStorage**: default view mode preference

### Rewrite data flow

```
1. User edits story in TipTap
2. User chats with AI persona (optional)
3. User pins context items (optional)
4. User sets style/length (optional)
5. User clicks "AI Rewrite"
   ├─ Store snapshots editor content → originalContent
   ├─ Store sets rewriteState → 'streaming'
   ├─ Backend receives: { content, conversation_id, pinned_context_ids,
   │    writing_style, length_preference, persona_id }
   ├─ Chunks stream in → rewriteContent accumulates
   └─ Stream completes → rewriteState → 'reviewing'
6. User reviews in editor or diff view (toggle freely)
7. Accept → updateStory mutation → rewriteState → 'idle'
   OR Discard → restore originalContent → rewriteState → 'idle'
```

### Session lifecycle

No more "evolution session" concept. The workspace is an enhanced editor. Conversation persists via the existing conversation API. Rewrites create versions directly. Transient rewrite state (streaming/reviewing) is lost on close; everything else persists.

---

## Section 5: Backend Changes

### What stays as-is

- Story CRUD + version APIs
- Conversation/chat APIs and streaming
- `GraphContextService` and all graph RAG infrastructure
- Media upload APIs
- Persona configuration

### New endpoint: `POST /api/stories/{storyId}/rewrite`

Replaces the old `streamGenerate` / `streamRevise` endpoints:

```python
class RewriteRequest(BaseModel):
    content: str
    conversation_id: str | None = None
    pinned_context_ids: list[str] = []
    writing_style: WritingStyle | None = None
    length_preference: LengthPreference | None = None
    persona_id: str = "biographer"
```

Response: SSE stream with existing event types (`chunk`, `done`, `error`).

Internally:
1. Assembles context via `GraphContextService.assemble_context()`
2. Builds system prompt with persona + style + length
3. Streams rewritten story via SSE
4. On completion, saves a draft version (source: `ai_generate`)

### New endpoint: `GET /api/stories/{storyId}/graph-context`

Exposes graph context for the Context panel:

```python
class GraphContextResponse(BaseModel):
    related_stories: list[RelatedStory]   # id, title, snippet, relevance
    entities: EntityGroups                 # people, places, events, objects
```

### Deprecated (not removed yet)

- Evolution session endpoints (`/evolution`, `/evolution/{id}/phase`, etc.)
- `streamGenerate` and `streamRevise` endpoints
- `summarizeEvolution` endpoint

Removed in a follow-up cleanup PR once the workspace is stable.

---

## Section 6: Mobile Layout

On screens below 768px (`useIsMobile()` hook), the workspace collapses:

```
┌─────────────────────────────┐
│ ← Back   "Summer of '92"  💾│
├─────────────────────────────┤
│                             │
│   TipTap Editor             │
│   (full screen, editable)   │
│                             │
├─────────────────────────────┤
│  💬  🔗  📜  🖼️  🎨  ✨    │  ← bottom tab bar
└─────────────────────────────┘
```

- **Bottom tab bar** replaces the tool strip + bottom toolbar. Icons: AI Chat, Context, Versions, Media, Style, AI Rewrite.
- **Tapping a tool icon** opens a Vaul bottom sheet (~60% screen height). Same tool panel content as desktop.
- **Only one sheet open at a time.** Tapping another tool closes the current one.
- **AI Rewrite on mobile**: diff/editor toggle appears in a sheet. Accept/Discard as buttons inside the sheet.
- **Editor remains interactive** behind the sheet (scrollable above).

Uses existing `Drawer` component and `useIsMobile()` hook. No new responsive patterns needed.

---

## Section 7: Component Inventory & File Structure

### New files (frontend)

```
src/features/evolve-workspace/
├── EvolveWorkspace.tsx              # Root component
├── store/
│   └── useEvolveWorkspaceStore.ts   # Zustand store
├── components/
│   ├── WorkspaceHeader.tsx          # Title, save status, back nav
│   ├── EditorPanel.tsx              # TipTap wrapper with diff/editor toggle
│   ├── DiffView.tsx                 # Inline diff renderer
│   ├── ToolStrip.tsx                # Vertical icon bar
│   ├── ToolPanel.tsx                # Swappable container for active tool
│   ├── BottomToolbar.tsx            # AI Rewrite trigger, style/length
│   └── MobileToolSheet.tsx          # Vaul drawer wrapper for mobile
├── tools/
│   ├── AIChatTool.tsx               # Persona chat (adapts ElicitationPanel)
│   ├── ContextTool.tsx              # Graph-connected stories & entities
│   ├── VersionsTool.tsx             # Version history + diff trigger
│   ├── MediaTool.tsx                # Media browser + upload + insert
│   └── StyleTool.tsx                # Writing style & length prefs
├── hooks/
│   ├── useAIRewrite.ts              # Streaming rewrite mutation
│   └── useGraphContext.ts           # Graph context query hook
└── utils/
    └── diffEngine.ts                # diff-match-patch wrapper
```

### Modified files (frontend)

| File | Change |
|------|--------|
| `src/routes/index.tsx` | Point evolve route to new `EvolveWorkspace` |

### New files (backend)

| File | Purpose |
|------|---------|
| `app/routes/rewrite.py` | `POST /api/stories/{storyId}/rewrite` SSE endpoint |
| `app/routes/graph_context.py` | `GET /api/stories/{storyId}/graph-context` endpoint |

### Modified files (backend)

| File | Change |
|------|--------|
| `app/main.py` | Register new route modules |

### New dependency

| Package | Purpose |
|---------|---------|
| `diff-match-patch` (npm) | Compute text diffs for diff view |

### Existing code reused (not modified)

- `StoryEditor` + `useStoryEditor` + `EditorToolbar` — TipTap editor
- `useAIChat` + `useAIChatStore` — chat streaming
- `useMediaUpload` + `MediaUploader` — media handling
- `VersionHistoryDrawer` internals — adapted into `VersionsTool`
- `GraphContextService` — called by new backend endpoints
- `ResizablePanelGroup/Panel/Handle` — already wrapped in `components/ui/resizable.tsx`

### Deprecated files (removed in follow-up PR)

All files in `src/features/story-evolution/`: `ElicitationPanel`, `SummaryCheckpoint`, `StyleSelector`, `DraftStreamPanel`, `DraftReviewPanel`, `PhaseIndicator`, `EvolutionBanner`.

---

## Scope Summary

- ~15 new frontend files in a new `evolve-workspace` feature directory
- 2 new backend endpoints (rewrite SSE + graph context REST)
- 1 new npm dependency (`diff-match-patch`)
- 1 route change to swap in the new workspace
- Heavy reuse of existing components
