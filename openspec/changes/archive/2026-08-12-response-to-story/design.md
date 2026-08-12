## Context

This implements the stretch item deferred by the archived `story-responses` change (tasks 3.7 / 7.1–7.3). The base capability is live: responses render in a "Memories & responses" section on the story Read page, with author edit and author/admin delete. This adds: (a) an offer on a member's own long response, (b) conversion of that response into a standalone story, (c) a converted-note state on the original response, (d) a story-to-story backlink, and (e) a note-scoped hide power for the story author. All seven original questions plus five follow-ups are resolved (see `proposal.md`).

Confirmed seams in the current code:

- **Author gate exists.** `apps/web/src/features/story-responses/components/ResponseItem.tsx` computes `isOwnResponse`. It does **not** currently receive `legacyId` or the source story id.
- **`legacyId` is upstream but not threaded down.** `StoryReadPage.tsx` has `legacyId` and `existingStory` and renders `<ResponsesSection storyId=… currentUserId=… canModerate=… />`.
- **Edit-page seed seam.** `StoryEditPage.tsx` reads `location.state.seedQuote` and seeds `content` as a markdown blockquote; it has a `SaveState` machine (`idle | saving | saved | error`) and creates the story lazily via `runCreate` on the first `handleChange`. Precedent: `features/story-prompts/components/StoryPromptCard.tsx` navigates to `/legacy/:legacyId/story/new` with `state`.
- **Create flow.** `useCreateStory` → `POST /api/stories/` accepts `{ legacies:[{ legacy_id }], title?, content, visibility?, status? }`; legacy linkage comes from the `:legacyId` path segment.
- **Response model.** `services/core-api/app/models/story_response.py` has `body`, `created_at`, `edited_at`, `deleted_at` (soft delete). No story-to-story link exists anywhere in the DB today — "related stories" is a Neptune/graph concept (`apps/web/src/features/evolve-workspace/api/graphContext.ts`).

## Goals / Non-Goals

**Goals:**
- Reuse the existing seed-and-navigate seam and lazy-create behavior rather than inventing a new create path.
- Make conversion recoverable: never destroy the member's original writing; a deleted story restores the response.
- Keep the new moderation power tightly scoped to converted notes; leave general response moderation untouched.

**Non-Goals:**
- No AI/quality judgement — "long" is a sentence-count signal only.
- No general story-author moderation of ordinary responses (deferred to a separate change).
- No auto-publish; the seeded story enters the normal Edit flow at private.
- No change to reactions, threading, or story/legacy access rules.

## Decisions

### D1. Offer placement and threshold

Render the offer inside `ResponseItem`, gated by `isOwnResponse && isLongResponse(body) && !offerDismissed && !isConverted`. `ResponsesSection`/`StoryReadPage` thread `legacyId` and the source story id down. `isLongResponse` is a single util in `features/story-responses/utils/` with a hardcoded constant: **more than four sentences (5+)**, counted by a simple `.?!`-terminator split (R1) — accepted to miscount rare abbreviation/ellipsis/decimal cases for MVP. One testable place to tune later.

### D2. Seeding and the non-atomic create (R1-adjacent)

Extend `EditPageLocationState` with `seedBody?: string` (seeded **verbatim**, no `> ` wrap) plus `sourceResponseId?: string`; leave `seedQuote` untouched so the Story Prompt flow is unaffected. Keep the **lazy create** behavior; add a "not saved yet" affordance driven off `isNew && !hasCreated` (e.g. a badge/tooltip near the save-state indicator) telling the author an edit will save the draft (R2 of the original set / owner's caveat handling). We deliberately do **not** force eager-create on mount — that would risk creating empty stories for abandoned Story-Prompt seeds; the note replacement is simply deferred until the story actually exists.

### D3. Data model (Option C + backlink + dismissal + hide)

`story_responses` gains:
| column | type | notes |
|---|---|---|
| `converted_story_id` | UUID fk → `stories.id`, **`ondelete=SET NULL`**, nullable | non-null ⇒ this row renders as a note; SET NULL means deleting the story auto-restores the response (R3) |
| `hidden_at` | timestamptz, nullable | note hidden by the story author; visible only to the note's author (R2) |
| `hidden_by_id` | UUID fk → `users.id`, nullable | who hid it (audit) |
| `offer_dismissed_at` | timestamptz, nullable | server-side, per-response dismissal (R4) |

`stories` gains:
| column | type | notes |
|---|---|---|
| `source_story_id` | UUID fk → `stories.id`, **`ondelete=SET NULL`**, nullable | backlink to the story the source response was on (R5) |

The original `body` is **retained** on conversion (not cleared) so restore is trivial — the note is a *render-time* decision on `converted_story_id`, not a destructive edit.

### D4. Create-from-response wiring

Extend the create endpoint/schema to accept an optional `source_response_id`. When present, in **one transaction**: create the story, set `story.source_story_id = source_response.story_id`, and set `source_response.converted_story_id = new_story.id`. The frontend carries `sourceResponseId` through nav state into the create mutation. Because create is lazy, this fires on the first edit's `runCreate` — matching the owner's "make a modification to save" model. Serializers expose the note link (source response → converted story summary) and the backlink (story → source story summary).

*Alternative considered (rejected): a separate POST /responses/{id}/convert endpoint that creates the story eagerly.* Rejected because it duplicates create logic and forces eager creation, producing empty stories if the author abandons the draft.

### D5. Note moderation — notes-only (R2)

Add a story-author hide action (e.g. `POST /api/stories/{story_id}/responses/{response_id}/hide`) that sets `hidden_at` + `hidden_by_id`, authorized to the **story author** only and rejected unless the target is a converted note (`converted_story_id` is non-null). Response **list filtering** excludes rows with `hidden_at` set unless the viewer is the note's author (`user_id`). The existing "Response removal rights" (author + legacy creator/admin, hard soft-delete for everyone) is **unchanged** and continues to apply to notes as to responses. Deleting a note reuses the existing response delete.

*Alternative considered (rejected): apply the hidden-from-others outcome to all responses and add the story author as a general remover.* Rejected for scope — it modifies the existing removal-rights requirement and adds a visibility tier for every response; split to its own proposal.

### D6. Dismissal (R4)

A small PATCH (e.g. `PATCH /api/stories/{story_id}/responses/{response_id}` or a dedicated dismiss route, matching existing response-route conventions) sets `offer_dismissed_at`, author-only. The serializer exposes it; the frontend suppresses the offer when set. Server-side (not localStorage) so dismissal is cross-device.

## Risks / Trade-offs

- **[Sentence counting is heuristic]** (`.?!` split miscounts abbreviations/ellipses/decimals) → accepted for MVP; isolated in one util with boundary tests; tune later without touching callers.
- **[Non-atomic conversion]** (author takes the offer, never edits ⇒ story never created ⇒ response stays a normal response) → correct by design; the note replacement only runs in the create success path, and the "not saved yet" indicator nudges the author.
- **[Duplicate-then-restore churn]** (convert, then delete the story ⇒ response returns) → intended; `SET NULL` + retained `body` make it lossless.
- **[Hidden note + later story delete]** (a hidden note whose story is deleted becomes a restored-but-still-hidden response) → minor edge; default is to leave `hidden_at` as-is on restore (a story author who hid it keeps it hidden); revisit only if it confuses users.
- **[Seed text formatting]** (markdown-like characters in a response render as formatting) → same as any pasted text today; covered by a plain-text seed test.
- **[PR size]** (backend model + endpoints + several UI surfaces) → split into ~2–3 PRs per the task groups; each stays under the 400 LOC target.

## Migration Plan

Two additive Alembic migrations, no backfill:
1. `story_responses`: add `converted_story_id` (FK `ondelete=SET NULL`), `hidden_at`, `hidden_by_id` (FK), `offer_dismissed_at` — all nullable.
2. `stories`: add `source_story_id` (FK `ondelete=SET NULL`), nullable.

Both are backward-compatible and deployable ahead of the frontend that reads them. Rollback is `alembic downgrade -1` per migration; nothing existing is altered. The `SET NULL` FKs encode the R3 restore/backlink-drop behavior at the database level.

## Observability

Following the existing `story_response.*` span/log naming from the archived change (component `story-responses`):
- **Spans:** `story_response.convert` (create-from-response wiring), `story_response.hide`, `story_response.dismiss_offer`.
- **Logs:** `story_response.converted` (fields `story_id` = new story, `source_response_id`, `source_story_id`, `legacy_id`, `user_id`), `story_response.hidden` (`response_id`, `story_id`, `hidden_by_id`), `story_response.offer_dismissed` (`response_id`, `user_id`) — structured JSON alongside the standard `service`/`component`/`version`/`request_id` fields.
- **Metrics:** counter `story_responses_converted_total` (labels `service`, `component`, `version`). Optional frontend UI event `response_to_story.offer_taken` if the app has a client analytics hook.

## Open Questions

None remain blocking apply. One item is explicitly **deferred to a separate change**: general story-author moderation of any response (the hidden-from-others outcome applied beyond converted notes).
