## Why

A member sometimes answers a story with a response so long and self-contained that it is really a story of its own — a full memory, not a comment. Today that writing is trapped in the flat responses list: it cannot be titled, given its own reading page, surfaced on the legacy, or responded to in turn. This closes the loop the archived `story-responses` change deliberately deferred (stretch tasks 3.7 / 7.1–7.3), turning a rich response into a first-class story with one gentle offer.

## What Changes

- On a member's **own** response of **more than four sentences**, the responses section shows a gentle, inline offer (e.g. "This sounds like its own story"). The offer never appears on other members' responses or on short responses. It is **dismissible once per response**.
- Taking the offer opens the story **Edit page pre-seeded with the response's text (raw body, verbatim)**, associated with the **same legacy** the story belongs to, and defaulting to **private** — reusing the existing Edit-page seed-and-navigate seam (`location.state`, as `StoryPromptCard` already does).
- Because story creation is **not atomic** (the Edit page only persists on the first edit), the seeded Edit page shows a **"not saved yet" indicator** with guidance (e.g. hover tooltip: make an edit to save) so the author knows autosave needs a modification to fire.
- Once the new story is actually created, the **original response is replaced in place with a short note + link** to the new story ("Turned this into a story →"). The note is **not editable**; its author may delete it.
- The new story records a **link back to the source story** (a nullable `source_story_id` FK, in addition to the legacy) so readers can explore related stories from either side.
- The **story author** (of the story the response was written against) can hide a **converted note** such that it stays visible to its own author but is hidden from everyone else — a new "hidden" moderation state, **scoped to notes only** in this change (broader response moderation is split to a separate proposal).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `story-responses`: adds three requirements — (1) a member can turn their own long (>4-sentence) response into a standalone story, seeded with the response text, defaulting to private, linked to the same legacy and back to the source story, with a dismissible offer; (2) a converted response becomes a non-editable, deletable note linking to the new story, and reverts to the original response if that story is deleted; (3) the story author can hide a converted note from others while keeping it visible to its author. The existing "Response removal rights" requirement is **not changed** (R2: notes-only scope); broader story-author response moderation is deferred to its own proposal.

## Impact

- **Frontend** (`apps/web`):
  - `features/story-responses/`: a ">4 sentences" check + gentle, dismissible inline offer on the author's own response (`ResponseItem.tsx` already computes `isOwnResponse`); thread `legacyId` (and source story id) down through `ResponsesSection` from `StoryReadPage`; render the converted **note** state (link, no edit, delete only) and the "hidden" state.
  - `features/story/components/StoryEditPage.tsx`: extend `EditPageLocationState` to seed a raw body (`seedBody`) and carry `sourceResponseId`/`sourceStoryId`; add the "not saved yet" indicator for seeded-but-uncreated drafts; default seeded story to private.
  - Story read page: render the "grew out of a memory on …" backlink to the source story.
- **Backend** (`services/core-api`) — now required (Option C + backlink + moderation):
  - `story_responses`: add `converted_story_id` (nullable FK → stories, `ondelete=SET NULL` so deleting the story auto-restores the response — R3); `hidden_at` + `hidden_by_id` (note-scoped "hidden from others" state, distinct from `deleted_at` — R2); `offer_dismissed_at` (server-side per-response dismissal — R4).
  - `stories`: add `source_story_id` (nullable FK → stories, `ondelete=SET NULL`) for the backlink (R5).
  - New/updated endpoints: create-from-response wiring (create endpoint accepts optional `source_response_id`; in one transaction sets the new story's `source_story_id` and the source response's `converted_story_id`); dismiss-offer; story-author hide-note; note delete reuses the existing response delete. Response serializer exposes note/hidden/dismissal fields + linked-story summary; story serializer exposes the source-story backlink. List filtering hides hidden notes from everyone but the note's author.
  - Two additive Alembic migrations (response columns; story column).
- **Routing/API**: reuses the create route (`legacy/:legacyId/story/new`) and create mutation, plus the new response-conversion/moderation endpoints above.
- Requirement source: archived `story-responses` tasks 3.7 / 7.1–7.3 (`openspec/changes/archive/2026-07-09-story-responses/tasks.md`).
- **Size note:** with Option C + backlink + moderation this is no longer a single <400 LOC PR; expect a split into ~2–3 PRs (backend model/endpoints; offer + seed + note UI; backlink + moderation UI).

## Non-goals

- No AI/heuristic detection of "story-worthiness" beyond the sentence-count signal — "long" is a length signal, not a quality judgement.
- No threaded replies, rich text, or any change to reactions — unchanged from the `story-responses` non-goals.
- No change to story or legacy **access/visibility** rules; the offer is a UI affordance layered on read access.
- No offer on **other members'** responses, and no admin/moderator "promote this response" action — a member converts only their own writing.
- No automatic publish — the seeded story lands in the normal Edit flow at private; the author decides title, visibility, and whether to publish.
- No migration/backfill of existing responses into stories.

## Resolved Decisions

The seven open questions were resolved by the owner (2026-07-10):

1. **"Long" threshold** → a response of **more than four sentences**. Hardcoded constant for now (no config).
2. **Original response after conversion** → **Option C: replaced in place with a short note + link** to the new story. To handle the non-atomic create, the seeded Edit page surfaces a "not saved yet" indicator instructing the author that a modification triggers autosave; the note replacement happens only after the story is actually created.
3. **Dismissible?** → **Yes, shown once and dismissible, dismissal is per response.**
4. **Interaction with edit/delete after conversion** → the converted note is **not editable**; the note's author (the response author) can **delete** it. Additionally, the **story author** can remove any response/note, with the outcome that it stays **visible to its own author but hidden from everyone else** (new "hidden" state — see R2).
5. **Seed raw or blockquote?** → **Raw body, verbatim** (no `> ` wrap).
6. **Backlink to source?** → **Yes** — in addition to the legacy, the new story links to the **source story** so people can explore related stories.
7. **Default visibility/status** → **private**; the author adjusts permissions afterward.

## Follow-up Decisions (from resolving the answers above)

Settled by the owner (2026-07-10); no open questions remain blocking apply:

- **R1 — Sentence-count rule** → the offer appears at **5+ sentences** (strictly more than four), counted with a simple `.?!`-based splitter for MVP (occasional miscounts on abbreviations/ellipses accepted).
- **R2 — Moderation scope** → **notes only.** The story-author "hide from others, keep visible to its author" outcome applies only to converted notes. The existing `story-responses` "Response removal rights" requirement is unchanged; broader story-author response moderation is **split to a separate future proposal**.
- **R3 — Note lifecycle** → **restore the original response** when the converted story is deleted (implemented via `converted_story_id` `ondelete=SET NULL`; the original body is retained, so the response becomes editable again). If the **source** story is deleted, the new story's backlink is simply dropped (`source_story_id` `ondelete=SET NULL`).
- **R4 — Dismissal persistence** → **server-side** `offer_dismissed_at` on the response (cross-device).
- **R5 — Backlink mechanism** → **DB FK** `source_story_id` on `stories`. Rendered on the new story's read page ("grew out of a memory on …") and reciprocally on the source story (stories that grew from its responses).

**Deferred to a separate change:** general story-author moderation of any response (the hidden-from-others outcome applied beyond converted notes).
