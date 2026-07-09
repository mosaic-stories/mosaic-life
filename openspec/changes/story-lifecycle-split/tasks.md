# Tasks — story-lifecycle-split

Grouped to match PR slices (< 400 LOC each; ordering per design.md Migration Plan — backend title semantics first, since groups 2–3 depend on it). Owner decisions Q1–Q5 recorded in proposal.md 2026-07-08 — ready for `/opsx:apply`.

## 1. Backend: title semantics (PR: auto-titling)

- [x] 1.1 Make `title` optional in `StoryCreate`/`StoryUpdate` (`services/core-api/app/schemas/story.py`); allow empty stored title
- [x] 1.2 Implement server-side working-title derivation on create/update when title is absent/blank: first non-empty content line, Markdown stripped, ~60 chars on a word boundary
- [x] 1.3 Add `title_derived` attribute to existing `story.create`/`story.update` spans and structured logs (per design.md Observability)
- [x] 1.4 Unit tests: derivation (markdown stripping, truncation, empty content → empty title), optional-title contract; run `just validate-backend` + `uv run pytest`

## 2. Frontend: Edit page (PR: edit page)

- [x] 2.1 Add routes `legacy/:legacyId/story/new` and `legacy/:legacyId/story/:storyId/edit` in `apps/web/src/routes/index.tsx`
- [x] 2.2 Create `features/story/components/StoryEditPage.tsx`: title field, `StoryEditor` body, visibility control, calm "Saving…/Saved" indicator, one unobtrusive Evolve entry
- [x] 2.3 Implement create-on-first-input: local state on `/new`, POST draft on first keystroke, `navigate(…/edit, { replace: true })` to the real id; autosave owns persistence — no manual "Save draft" action; nothing persisted if abandoned empty (Q2)
- [x] 2.4 Implement debounced PATCH autosave; on failure keep local text and show inline retry (never lose typed content)
- [x] 2.5 Render-time placeholder helper for empty drafts ("Draft story" + relative date), used by lists/hubs/dashboard — never persisted
- [x] 2.6 Vitest coverage: create-on-first-input, abandon-empty, autosave failure retry, placeholder rendering; verify single-column at 390px; `just validate-frontend`

## 3. Frontend: repoint create affordances (PR: repoint affordances)

- [x] 3.1 Point `LegacyProfile.tsx` `handleAddStory`, `QuickActions.tsx`, and `LegacyPickerDialog.tsx` at the Edit page; delete their `Untitled Story - ${date}` title generation and eager POSTs
- [x] 3.2 Repoint the draft CTA in `StoryCreation.tsx`; prompt cards open the Edit page seeded with the prompt as a quote (Q1)
- [x] 3.3 Verify in the compose stack: every create affordance reaches Edit in ≤1 click with zero API writes on navigation (watch network tab / API logs); no stored "Untitled Story" titles from any flow

## 4. Frontend: Read page restyle (PR: read restyle)

- [x] 4.1 Restyle `StoryViewer.tsx`/`StoryToolbar`: typographic reading presentation (design.md D1 Option A) — no toolbar, no bordered box; byline, date, visibility badge, legacy link, inline media
- [x] 4.2 Author actions: quiet Edit button + overflow menu (versions, delete, AI-workspace entry in the overflow menu only — no standalone button, per Q3); hidden for non-authors
- [x] 4.3 Replace `EvolutionResumeBanner` with the quiet inline draft-resume line under the title (no discard action on Read)
- [x] 4.4 Rename `StoryCreation.tsx` → `StoryReadPage.tsx` (Q5: now), updating imports, tests, and the lazy route in `routes/index.tsx`
- [x] 4.5 Vitest + manual pass: author vs non-author actions, draft-resume line, media nodes, no horizontal scroll at 390px; `just validate-frontend`

## 5. Frontend: lazy Evolve sessions (PR: lazy sessions)

- [x] 5.1 Remove the mount-time `biographer` bootstrap effect and per-persona conversation pre-creation from `EvolveWorkspace.tsx`
- [x] 5.2 Add `ensureSession()` (memoized, single in-flight promise) in `useEvolveWorkspaceStore`/hook; call it from the chat-send, context-extraction, and rewrite paths only
- [x] 5.3 Workspace shell renders from story data alone pre-session; AI panel shows idle state instead of bootstrap skeleton
- [x] 5.4 Confirm discard removes only session/conversation/draft state — story row untouched
- [x] 5.5 Emit `evolve.session.ensure` span/log (`trigger`, `created`) and `evolve_sessions_started_total{trigger}` counter
- [x] 5.6 Verify in the compose stack: open Evolve, leave without acting → no session/conversation (Conversations page + DB); first chat creates exactly one conversation; full flow (chat, context, rewrite+diff, versions, media, finish) works end-to-end

## 6. Orphan cleanup (PR: cleanup — Q4: approved)

- [x] 6.1 One-time idempotent script: delete zero-message conversations and empty untitled drafts older than N days, with a dry-run mode that reports counts before deleting
- [ ] 6.2 Run dry-run against local compose data, review counts with owner, then execute per GitOps rules — dry-run completed (see change notes); execution pending owner sign-off

## 7. Acceptance pass

- [x] 7.1 Walk every acceptance criterion in the seed spec (docs/design/2026-07-ui-review/specs/01-story-lifecycle.md) against the running compose stack, desktop 1440px + mobile 390px
- [x] 7.2 Tick the implementation checkbox for spec 01 in the docs/design/2026-07-ui-review/README.md status table (owner-pass and plan are already ticked)
