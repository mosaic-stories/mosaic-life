# Spec 01: Story Lifecycle — Read, Edit, Evolve

**Status:** APPROVED — owner decisions recorded 2026-07-08; planned as OpenSpec change [`story-lifecycle-split`](../../../../openspec/changes/story-lifecycle-split/proposal.md)
**Priority:** P0 (core loop)
**Evidence:** [`../00-review-summary.md`](../00-review-summary.md) §A · screenshots `32-story-view.jpg`, `33-evolve-workspace.jpg`, `37-evolve-rewrite.jpg`, `15-my-conversations.jpg`
**Depends on:** nothing
**Blocks:** Spec 02 (the Read page hosts story responses)

## Context capsule

Mosaic Life is a memorial-stories platform (React 18 + TS, Vite, React Router in `apps/web/src/routes/index.tsx`, TanStack Query, Tailwind + shadcn/ui, TipTap editor). Stories belong to a "legacy" (a memorialized person). Today the only authoring surface is the **Evolve workspace** (`features/evolve-workspace/EvolveWorkspace.tsx`) — a three-panel AI-assisted environment. User feedback: too complex for simple edits. This spec splits the lifecycle into three modes and removes the workspace's side effects.

## Problem

1. **No simple write path.** Every create affordance POSTs an empty draft and navigates to `/legacy/:id/story/:storyId/evolve` (`LegacyProfile.tsx:90`, `QuickActions.tsx:28`, `LegacyPickerDialog`, draft CTA in `StoryCreation.tsx`; `StoryCreation.tsx:91` redirects if no storyId). First-time writers get resizable panels, a tool rail, "Unsaved", "Discard session", and a skeleton AI panel before writing a sentence.
2. **Reading looks like a disabled form.** The story view (`features/story/components/StoryCreation.tsx` → `StoryViewer.tsx`) renders `<StoryEditor readOnly>` in a bordered input-style box, topped by a purple "You have a story evolution in progress" banner with a red **Discard** (`EvolutionResumeBanner`).
3. **The workspace manufactures clutter.** On mount it auto-starts a `biographer` session (`EvolveWorkspace.tsx:152–177`) and creates one AI conversation per persona. Observed: 8 duplicate "The Biographer" conversations, 6 with zero messages. Drafts titled "Untitled Story – May 20, 2026" leak to dashboard, hubs, and conversation names.

## Goals

- A calm, typographic **Read** page — the default story URL.
- A plain **Edit** page: title, body, visibility, autosave. Nothing else.
- **Evolve** kept intact but opt-in, entered deliberately, with zero side effects until the user acts.
- No empty sessions/conversations exist anywhere, ever.
- No user-visible "Untitled Story – {date}" strings.

## Non-goals

- Redesigning Evolve's internals (tool rail, rewrite pipeline, versions, diff review stay as-is).
- Story responses/comments (spec 02).
- Renaming Evolve jargon (spec 04 owns copy; coordinate on "Discard session").
- Backend story model changes beyond what lazy session creation requires.

## Proposed direction

**Read** (`/legacy/:id/story/:storyId`) — replace the read-only-editor look with rendered typographic content (serif body per existing story typography, no border/box, no toolbar). Byline, date, visibility badge, legacy link, inline media. Author actions: quiet `Edit` button + overflow menu (versions, delete, "Open AI workspace"). Draft-resume becomes one quiet inline line under the title ("You have an unfinished draft — continue editing") instead of the purple banner.

**Edit** (`/legacy/:id/story/:storyId/edit`, and `/legacy/:id/story/new`) — the existing TipTap `StoryEditor` alone on a page: title field, body, visibility control, autosave with calm "Saved" indicator. One unobtrusive entry to Evolve ("Want help telling this story?"). All existing create affordances point here; a story record is created on first keystroke or explicit save — not on navigation.

**Evolve** (`.../evolve`, unchanged route) — entered only from Read/Edit. Session + conversation created on **first AI action** (first chat message, context extraction, or rewrite), not on mount. Discarding an AI draft never deletes the story.

**Titles** — derive a working title from the first line of content (truncated ~60 chars); Evolve may suggest a better one at Finish. Placeholder display for empty drafts: "Draft story" + relative date, generated at render, never persisted.

## Open questions (owner second pass)

1. **Quick capture from prompt cards.** The Story Prompt cards ("What's the best advice…?") currently jump to Evolve. Should they open (a) the Edit page seeded with the prompt as a quote, (b) a lightweight modal composer that saves and offers "keep going →  Edit", or (c) keep routing to Evolve?
   → Decision: (a) — prompt cards go directly to the Edit page, seeded with the prompt as a quote.
2. **Draft persistence on abandon.** If a user opens Edit for a new story and types nothing, today's behavior would still have created a draft. Proposed: create nothing until first input. Acceptable, or do you want explicit "Save draft"?
   → Decision: Create nothing until first input; once there is input, autosave the draft (no manual "Save draft").
3. **Where does Evolve's entry live on Read?** Overflow menu only, or a visible "Open AI workspace" button for authors?
   → Decision: Overflow menu only.
4. **Existing orphan cleanup.** Ship a one-time cleanup (delete zero-message conversations + empty untitled drafts older than N days), or leave existing data alone?
   → Decision: Ship the one-time cleanup.
5. **Component rename.** `StoryCreation.tsx` → `StoryReadPage.tsx` (or similar) as part of this work, or defer to spec 05 hygiene?
   → Decision: Rename now, as part of this work.

## Acceptance criteria

- [ ] Clicking any story opens a page with no editor chrome, no bordered content box, no purple banner.
- [ ] "Write a Story" / "Add Story" / dashboard quick action land on the plain Edit page in ≤1 click, with zero API writes until the user types or saves.
- [ ] Visiting `/evolve` and leaving without an AI action creates no session and no conversation (verify via Conversations page and DB).
- [ ] A story written as "I remember the lunch we had…" with no title shows "I remember the lunch we had…" (truncated) as its title in dashboard, hubs, and lists.
- [ ] Evolve reached only via explicit user action from Read or Edit; browser back returns to the originating page.
- [ ] Mobile (390px): Edit page is a single column; Read page has no horizontal scroll.
- [ ] Existing Evolve capabilities (chat, context, rewrite+diff, versions, media, finish/visibility) still function end-to-end.

## Suggested PR breakdown (<400 LOC each)

1. **Read page restyle** — typographic renderer, quiet draft-resume line, author actions. (`StoryViewer.tsx`, `StoryToolbar`, `EvolutionResumeBanner`)
2. **Edit page** — new route + page reusing `StoryEditor`; autosave; visibility control. (`routes/index.tsx`, new `features/story/components/StoryEditPage.tsx`)
3. **Repoint create affordances** — all entry points → Edit; create-on-first-input. (`LegacyProfile.tsx`, `QuickActions.tsx`, `LegacyPickerDialog`, prompt cards)
4. **Lazy Evolve sessions** — move session/conversation creation into first-AI-action paths. (`EvolveWorkspace.tsx`, `useEvolveWorkspaceStore.ts`)
5. **Auto-titling** — first-line derivation + render-time placeholder; remove persisted "Untitled Story – {date}". (story create/update paths)
6. *(Optional, per Q4)* **Orphan cleanup migration/script.**
