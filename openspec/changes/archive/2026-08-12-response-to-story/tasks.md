Suggested PR split (each < 400 LOC): **PR1** = §1–4 (backend), **PR2** = §5 + §8 (offer/seed/convert UI), **PR3** = §6–7 + §8 (note/backlink/hide UI). Reference change id `response-to-story` in each PR.

## 1. Backend: data model + migrations

- [x] 1.1 Add columns to `StoryResponse` (`app/models/story_response.py`): `converted_story_id` (UUID FK → `stories.id`, `ondelete="SET NULL"`, nullable, indexed), `hidden_at` (timestamptz nullable), `hidden_by_id` (UUID FK → `users.id`, nullable), `offer_dismissed_at` (timestamptz nullable). Keep `body` on conversion (needed for restore).
- [x] 1.2 Add `source_story_id` (UUID FK → `stories.id`, `ondelete="SET NULL"`, nullable, indexed) to `Story` (`app/models/story.py`).
- [x] 1.3 Alembic migration #1: the four `story_responses` columns. Additive/nullable; rollback `downgrade -1`.
- [x] 1.4 Alembic migration #2: the `stories.source_story_id` column. Additive/nullable.

## 2. Backend: create-from-response wiring

- [x] 2.1 Extend the create story schema/endpoint to accept optional `source_response_id` (`app/schemas/story.py`, `app/routes/story*.py`).
- [x] 2.2 In the create service, when `source_response_id` is present, in ONE transaction: create the story, set `story.source_story_id = source_response.story_id`, set `source_response.converted_story_id = new_story.id`. Authorize that the actor is the source response's author.
- [x] 2.3 Update the story serializer to expose a `source_story` summary (id/title/link) for the backlink, and a reciprocal "stories grown from responses" surface on the source story.
- [x] 2.4 Update the response serializer to expose `converted_story_id` + a converted-story summary (id/title/link), `offer_dismissed_at`, and a per-viewer `hidden` flag.
- [x] 2.5 Emit span `story_response.convert` and log `story_response.converted` (fields per design's Observability) + `story_responses_converted_total` metric.

## 3. Backend: dismissal, note hide, list filtering, restore

- [x] 3.1 Add a dismiss action (PATCH on the response, or dedicated route) that sets `offer_dismissed_at`; author-only.
- [x] 3.2 Add a story-author hide action (`POST /api/stories/{story_id}/responses/{response_id}/hide`) setting `hidden_at` + `hidden_by_id`; authorized to the story's author only; reject unless the target is a converted note (`converted_story_id` non-null). Emit `story_response.hide` span / `story_response.hidden` log.
- [x] 3.3 Update response list filtering: exclude rows with `hidden_at` set unless the viewer is the note's author (`user_id`).
- [x] 3.4 Confirm restore works via FK: deleting the converted story sets `converted_story_id` NULL (response reverts to editable); deleting the source story sets `source_story_id` NULL (backlink drops). Add a service/integration test asserting both.

## 4. Backend: tests + validation

- [x] 4.1 Tests: create-from-response sets both FKs; note render fields present; author-only convert; dismissal author-only; hide is story-author-only and note-only; hidden note filtered for others but visible to its author; restore-on-story-delete; backlink-drop-on-source-delete.
- [x] 4.2 Run `just validate-backend` and `uv run pytest` (services/core-api) — must pass before opening the PR.

## 5. Frontend: offer + long check + seed seam

- [x] 5.1 Add `isLongResponse(body)` util in `features/story-responses/utils/` — hardcoded constant: more than four sentences (5+), simple `.?!` splitter; boundary unit tests.
- [x] 5.2 Thread `legacyId` and the source story id from `StoryReadPage` → `ResponsesSection` → `ResponseItem` (add to each props interface).
- [x] 5.3 In `ResponseItem`, render the gentle, dismissible inline offer only when `isOwnResponse && isLongResponse(body) && !offer_dismissed_at && converted_story_id == null` and not on `temp-` rows. Grief-sensitive copy (e.g. "This sounds like its own story"); quiet, not a prominent CTA. Wire the dismiss action to the backend (§3.1) and invalidate the responses query.
- [x] 5.4 On take: `navigate(\`/legacy/${legacyId}/story/new\`, { state: { seedBody: response.body, sourceResponseId: response.id } })` (mirror `StoryPromptCard`).
- [x] 5.5 Extend `EditPageLocationState` in `StoryEditPage.tsx` with `seedBody?` (verbatim, no `> ` wrap) and `sourceResponseId?`; seed `content` from `seedBody` in both the initial `useState` and the `storyId`-change effect; default seeded story `visibility` to private; pass `source_response_id` into the create mutation. Leave `seedQuote` behavior unchanged.
- [x] 5.6 Add the "not saved yet" indicator on the seeded Edit page (driven off `isNew && !hasCreated`) with guidance that an edit will save the draft.

## 6. Frontend: note render + backlink + hide

- [x] 6.1 Render the converted-note state in `ResponseItem` when `converted_story_id != null`: show "Turned this into a story →" linking to the new story; hide the edit affordance; keep delete for the note's author.
- [x] 6.2 Render the backlink on the story read page ("grew out of a memory on …" → source story) and the reciprocal "stories grown from responses" surface on the source story.
- [x] 6.3 Add the story-author "hide note" affordance (visible to the story's author on a converted note) wired to §3.2; invalidate the responses query on success. Do not render hidden notes for non-authors (server already filters; the UI must not assume presence).

## 7. Frontend: tests

- [x] 7.1 Component tests (`ResponseItem`): offer shown for own long, undismissed, unconverted response; absent for own short, others', dismissed, converted, and `temp-` rows; take-action navigates with `seedBody` + `sourceResponseId` and correct `legacyId`; note state renders link + no edit + delete-for-author; hide affordance visible only to the story author.
- [x] 7.2 Test that a plain-text response seeds as plain body (no unintended markdown formatting).
- [x] 7.3 Test the backlink render on both the new story and the source story.

## 8. Validation & end-to-end verification

- [x] 8.1 Run `npm run lint` and `npm run test` (apps/web) — must pass before opening each frontend PR.
- [x] 8.2 Drive the flow in the running compose stack (per AGENTS.md "verify, don't just validate"): post a >4-sentence response, take the offer, confirm the seeded Edit page (raw body, same legacy, private, "not saved" indicator), make an edit to save, then confirm the original response became a note linking to the new story and the new story links back to the source; delete the new story and confirm the response is restored; as the story author, hide a note and confirm it disappears for another member but stays for its author; dismiss an offer and confirm it stays dismissed.
