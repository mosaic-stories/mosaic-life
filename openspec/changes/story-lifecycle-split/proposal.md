# story-lifecycle-split

**Source:** [docs/design/2026-07-ui-review/specs/01-story-lifecycle.md](../../../docs/design/2026-07-ui-review/specs/01-story-lifecycle.md) (UI review seed, P0)
**Evidence:** [docs/design/2026-07-ui-review/00-review-summary.md](../../../docs/design/2026-07-ui-review/00-review-summary.md) §A

## Why

Every write path today routes through the Evolve workspace — the heaviest surface owns the most delicate action. Creating a story POSTs an empty draft and drops first-time writers into a three-panel AI environment; reading a story renders a read-only editor in a form-styled box under a purple "evolution in progress" banner; and the workspace auto-creates AI sessions/conversations on mount (observed: 8 duplicate "The Biographer" conversations, 6 empty) and leaks "Untitled Story – {date}" titles across the app. This is the core loop of the product and it currently punishes both reading and simple writing.

## What Changes

- **Read page** (`/legacy/:id/story/:storyId`): replace the read-only-editor look with rendered typographic content — no editor chrome, no bordered box. Byline, date, visibility badge, legacy link, inline media. Author actions become a quiet `Edit` button + overflow menu. The purple `EvolutionResumeBanner` becomes one quiet inline draft-resume line.
- **Edit page** (new route `/legacy/:id/story/:storyId/edit` and `/legacy/:id/story/new`): plain page reusing the TipTap `StoryEditor` — title, body, visibility, autosave with a calm "Saved" indicator, one unobtrusive entry point to Evolve.
- **Create-on-first-input**: all create affordances (`LegacyProfile`, `QuickActions`, `LegacyPickerDialog`, prompt cards, draft CTA) point to the Edit page; the story record is created on first keystroke or explicit save — never on navigation.
- **Lazy Evolve sessions**: Evolve (route unchanged) is entered only deliberately from Read/Edit; session + AI conversation are created on the first AI action (chat message, context extraction, rewrite), not on mount. Discarding an AI draft never deletes the story. No empty sessions/conversations are ever created.
- **Auto-titling**: derive a working title from the first line of content (~60 chars); Evolve may suggest a better title at Finish. Empty drafts display a render-time "Draft story" + relative-date placeholder that is never persisted. Remove persisted "Untitled Story – {date}" strings.
- **One-time orphan cleanup** (per Open Question 4 decision): delete existing zero-message conversations and empty untitled drafts via an idempotent script with dry-run mode.

## Capabilities

### New Capabilities

- `story-reading`: how a story is presented at its default URL — typographic rendering, metadata, author actions, draft-resume affordance. (Spec 02 story-responses will later render onto this surface.)
- `story-authoring`: the plain Edit surface — create/edit routes, create-on-first-input semantics, autosave, visibility control, working-title derivation and placeholder display.
- `evolve-workspace`: entry points and side-effect contract for the AI workspace — deliberate entry only, lazy session/conversation creation on first AI action, discard semantics that never destroy the story.

### Modified Capabilities

- None. `story-access` (who can read/create/edit/delete, visibility scopes) is unchanged; this change alters *when* a story record comes into existence and *how* surfaces are presented, not access rules. If design work uncovers a story-status/draft requirement change, a `story-access` delta will be added before approval.

## Impact

- **Frontend** (`apps/web`): `routes/index.tsx` (new edit route); `features/story/components/StoryCreation.tsx` + `StoryViewer.tsx` + `StoryToolbar` + `EvolutionResumeBanner` (Read restyle); new `StoryEditPage`; `LegacyProfile.tsx`, `QuickActions.tsx`, `LegacyPickerDialog`, prompt cards (repoint affordances); `features/evolve-workspace/EvolveWorkspace.tsx` + `store/useEvolveWorkspaceStore.ts` (lazy sessions).
- **Backend** (`services/core-api`): story create/update paths for auto-titling; whatever lazy session creation requires (per seed non-goals, no story-model changes beyond that). One-time orphan-cleanup script (Open Question 4: approved).
- **Coordination**: spec 04 (voice-and-copy) owns the "Discard session" wording — don't rename here. Spec 02 (story-responses) builds on the new Read page. Dead `features/story-evolution/` directory is out of scope (spec 05 hygiene).

## Non-goals

- Redesigning Evolve's internals — tool rail, rewrite pipeline, versions, diff review stay as-is.
- Story responses/comments (seed spec 02).
- Renaming Evolve jargon/copy (seed spec 04; coordinate on "Discard session").
- Backend story-model changes beyond what lazy session creation requires.

## Open Questions

Carried from the seed spec — owner decisions recorded 2026-07-08.

1. **Quick capture from prompt cards.** Story Prompt cards ("What's the best advice…?") currently jump to Evolve. Should they open (a) the Edit page seeded with the prompt as a quote, (b) a lightweight modal composer that saves and offers "keep going → Edit", or (c) keep routing to Evolve?
   → Decision: **(a)** — prompt cards go directly to the Edit page (seeded with the prompt as a quote).
2. **Draft persistence on abandon.** If a user opens Edit for a new story and types nothing, create nothing until first input — acceptable, or do you want an explicit "Save draft" action?
   → Decision: **Create nothing until first input.** Once there is input, autosave the draft — no manual "Save draft" step required.
3. **Where does Evolve's entry live on Read?** Overflow menu only, or a visible "Open AI workspace" button for authors?
   → Decision: **Overflow menu only.**
4. **Existing orphan cleanup.** Ship a one-time cleanup (delete zero-message conversations + empty untitled drafts older than N days), or leave existing data alone?
   → Decision: **Ship the one-time cleanup.**
5. **Component rename.** `StoryCreation.tsx` → `StoryReadPage.tsx` (or similar) as part of this work, or defer to spec 05 hygiene?
   → Decision: **Rename now**, as part of the Read-page PR.
