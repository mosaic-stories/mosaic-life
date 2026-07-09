# Design — story-lifecycle-split

## Context

See [proposal.md](proposal.md) for motivation and the seed spec ([docs/design/2026-07-ui-review/specs/01-story-lifecycle.md](../../../docs/design/2026-07-ui-review/specs/01-story-lifecycle.md)) for evidence. Current state, verified in code:

- **One route serves read**: `legacy/:legacyId/story/:storyId` → `StoryCreation.tsx` → `StoryViewer.tsx`, which renders `<StoryEditor readOnly>` in a bordered box. No edit route exists; `.../evolve` is the only authoring surface.
- **Create is eager**: `LegacyProfile.tsx:92`, `QuickActions.tsx:30`, `LegacyPickerDialog.tsx:29` each build a client-side `` `Untitled Story - ${date}` `` title, POST a story, and navigate to Evolve.
- **API contract**: `StoryCreate.title` is required (`min_length=1`); `Story.title` is `NOT NULL` (`String(500)`); `content` is Markdown (max 50k). So a title *must* be invented at create time today — that's where the leak comes from.
- **Evolve side effects**: `EvolveWorkspace.tsx` bootstraps a `biographer` evolution session in a mount-time effect (on 404 of active evolution) and a sibling effect creates one AI conversation per persona via `setConversationForPersona`.

## Goals / Non-Goals

**Goals:**
- Three distinct surfaces — Read (default URL), Edit (plain), Evolve (opt-in) — with the seed's acceptance criteria as the definition of done.
- Zero API writes from navigation alone, on every surface.
- No persisted placeholder titles anywhere; derived working titles as data, placeholder text only at render time.

**Non-Goals:**
- Evolve internals, story responses, copy renames, story-model changes beyond title semantics (see proposal Non-goals).
- Toast/error-surface overhaul (spec 05) — this change uses inline indicators only.

## Decisions

### D1. Read-page rendering: restyled TipTap vs. dedicated Markdown renderer

| | Option A — keep TipTap read-only, add a "reading" presentation | Option B — dedicated renderer (react-markdown + rehype-sanitize) |
|---|---|---|
| Fidelity | Guaranteed parity with editor output (custom nodes, media embeds) | Must re-implement custom nodes; divergence risk |
| Bundle | TipTap loaded on the read path (already the case today) | Lighter read path |
| Effort | Low — strip chrome, add typographic wrapper | Medium — new renderer + sanitizer config |
| Security | Content stays in TipTap's schema | rehype-sanitize per CODING-STANDARDS |

**Selected: Option A** (owner-confirmed with the 2026-07-08 decisions pass). The complaint is visual (border, toolbar, form-look), not architectural. Restyle: no border/box/toolbar, serif body per existing story typography, byline/date/visibility/legacy-link header, inline media. Option B remains a later optimization behind the same component boundary (`StoryReadPage` owns presentation; the render engine is an internal detail).

### D2. Title semantics: server-derived working title, render-time placeholder

Make `title` optional end-to-end and derive it from content on the server:

- `StoryCreate.title` / `StoryUpdate.title` become optional (`None`/empty allowed).
- On create/update, when title is absent or blank: derive from the first non-empty line of `content`, stripped of Markdown syntax, truncated ~60 chars on a word boundary. Store the derivation (it's a real working title, shown in dashboards/hubs/lists/search).
- When content is also empty, store `""` (drop `min_length` on the column contract; keep `NOT NULL`).
- Frontend: anywhere a story title renders and is empty → display "Draft story" + relative date, computed at render, never sent to the API.
- Delete the three client-side `Untitled Story - ${date}` generators.

*Why server-side:* one derivation, consistent across every consumer (dashboard, hubs, conversation names, future search); the frontend can't forget to do it. Alternative (client-derives, sends title) rejected: three call sites today, more tomorrow, and it re-opens the leak this change closes.
*Migration:* Alembic no-op for the column (already `String(500) NOT NULL`); only the Pydantic contract changes. Backward compatible — existing clients sending titles are unaffected. Rollback: restore `min_length=1`; derived titles already stored remain valid.

### D3. Create-on-first-input flow

`/legacy/:legacyId/story/new` renders the Edit page with **no story record**. State is local until the first input:

1. First keystroke (title or body) → `POST /stories` (draft status, no title unless typed) → on success, `navigate(…/story/:id/edit, { replace: true })`. No manual "Save draft" action exists — autosave owns persistence from the first input (Q2).
2. Subsequent edits → debounced `PATCH` autosave (reuse the draft-save mutation pattern from Evolve) with a calm "Saved"/"Saving…" indicator.
3. Create failure → keep local state, inline retry affordance; never drop typed text.

The `replace: true` navigation keeps browser-back returning to the originating page (acceptance criterion), not to `/new`.

### D4. Lazy Evolve sessions: ensure-on-first-action

Replace the two mount effects with an `ensureSession()` gate in `useEvolveWorkspaceStore` (or a colocated hook):

- Called at the top of each first-AI-action path — send chat message, extract context, start rewrite. Creates the evolution session, then the single conversation for the persona actually being used, memoized so concurrent actions share one in-flight promise.
- Mount renders the workspace shell from story data alone; the AI panel shows its idle state instead of a skeleton-while-bootstrapping.
- Per-persona conversation pre-creation is removed entirely — a conversation exists only after its first message.
- Discard semantics: discarding an evolution session deletes session/conversation/AI-draft state only; the story row is never touched.

*Alternative considered:* keep mount bootstrap but delete empty sessions on unmount. Rejected — cleanup-on-exit is unreliable (tab close, crash) and still creates the observed pollution window.

### D5. Route & component layout

- Routes: add `legacy/:legacyId/story/new` and `legacy/:legacyId/story/:storyId/edit` beside the existing pair in `routes/index.tsx`.
- New `features/story/components/StoryEditPage.tsx` reusing `StoryEditor`, title input, visibility control, autosave.
- Read page: restyle within `StoryViewer.tsx`/`StoryToolbar`; `EvolutionResumeBanner` becomes a one-line inline draft-resume link under the title. `StoryCreation.tsx` is renamed to `StoryReadPage.tsx` in the Read-page PR (Q5: rename now).
- Evolve entry on Read lives in the overflow menu only — no standalone button (Q3). Prompt cards route to the Edit page seeded with the prompt as a quote (Q1).

## Observability

- Spans: existing `story.create` / `story.update` spans gain a `title_derived: bool` attribute; new span `evolve.session.ensure` (attributes: `trigger: chat|context|rewrite`, `created: bool`).
- Logs (structured JSON, standard fields): `story.create` logs `title_derived`; `evolve.session.ensure` logs `trigger`.
- Metric: counter `evolve_sessions_started_total{trigger}` — after this change, `trigger="mount"` must be zero.

## Risks / Trade-offs

- [Autosave vs. Evolve draft-save collision — both PATCH the story] → Edit and Evolve are never open simultaneously in one tab (distinct routes); last-write-wins across tabs is the existing behavior, unchanged.
- [Create-on-first-input still produces abandoned one-keystroke drafts] → Accepted per Q2 decision; derived titles make them legible, and the Q4 cleanup sweeps historical ones.
- [Restyled TipTap read page may keep interactive editor artifacts (cursor, focus ring)] → Verify read-only presentation at 390px and with media nodes as part of the acceptance pass.
- [Making title optional loosens API validation other clients may rely on] → Server always stores a valid string (derived or empty); `GET` shape is unchanged.
- [Removing mount bootstrap may break Evolve flows that assumed a session exists] → Every tool path goes through `ensureSession()`; the end-to-end Evolve acceptance criterion (chat, context, rewrite+diff, versions, media, finish) guards this.

## Migration Plan

1. Backend title-derivation + optional title (backward compatible) ships first; frontend PRs follow (see tasks.md ordering — matches the seed's PR breakdown).
2. No schema migration required. The one-time orphan cleanup (Q4: approved) ships as an idempotent script with a dry-run mode reporting counts before any delete; not an Alembic migration.
3. Rollback: each PR is independently revertable; D2 contract rollback restores `min_length=1` with no data repair needed.

## Open Questions

None outstanding. All five owner decisions (Q1–Q5) are recorded in [proposal.md](proposal.md) Open Questions (2026-07-08): prompt cards → Edit page seeded with the prompt; create-nothing-until-input with autosave after; Evolve entry via overflow menu only; ship the one-time orphan cleanup; rename `StoryCreation.tsx` now.
