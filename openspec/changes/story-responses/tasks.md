## 1. Backend: responses

- [x] 1.1 Add `StoryResponse` model (`app/models/story_response.py`): `id`, `story_id` fk, `user_id` fk, `body` (Text), `created_at`, `edited_at` (nullable), `deleted_at` (nullable).
- [x] 1.2 Add `response_count` integer column (`server_default="0"`) to `Story`.
- [x] 1.3 Alembic migration for the new table and column.
- [x] 1.4 Add `app/schemas/story_response.py`: create/update/response schemas, cursor-paginated list response (`next_cursor`, `has_more`), matching `app/schemas/activity.py`'s cursor shape.
- [x] 1.5 Add `app/services/story_response.py`: create (membership-gated per design §2), list (cursor pagination), update (author-only, sets `edited_at`), delete (author or legacy creator/admin, per spec's removal-rights requirement; soft delete + decrement `response_count`).
- [x] 1.6 Wire notification fan-out into create: notify story author (if not actor) and each distinct prior responder (if not actor/author) via `create_notification`, per design §3.
- [x] 1.7 Add `app/routes/story_response.py`: `POST/GET /api/stories/{story_id}/responses`, `PATCH/DELETE /api/stories/{story_id}/responses/{response_id}`; enforce plain-text body (reject HTML/rich content).
- [x] 1.8 Emit `story_response.create`/`.update`/`.delete` OTel spans and structured logs per design's Observability section.
- [x] 1.9 Tests: membership gating (member/non-member/author), edit marker, delete rights (author, creator/admin allowed; advocate denied), notification fan-out (including "actor not notified of own action"), cursor pagination.
- [x] 1.10 Run `just validate-backend` and `uv run pytest` (services/core-api) — must pass before opening the PR.

## 2. Backend: reactions

- [x] 2.1 Add `StoryReaction` model (`app/models/story_reaction.py`): `id`, `story_id` fk, `user_id` fk, `reaction_type` (`heart`/`candle`/`smile`), `created_at`; unique constraint `(story_id, user_id, reaction_type)`.
- [x] 2.2 Add `reaction_heart_count`, `reaction_candle_count`, `reaction_smile_count` integer columns (`server_default="0"`) to `Story`.
- [x] 2.3 Alembic migration for the new table and columns.
- [x] 2.4 Add `app/schemas/story_reaction.py`: toggle request/response schema (mirrors `FavoriteToggleRequest/Response`).
- [x] 2.5 Add `app/services/story_reaction.py`: toggle (insert-or-delete on unique constraint, atomic counter increment/decrement per design §1, mirroring `favorite.py`), membership-gated per design §2.
- [x] 2.6 Wire notification fan-out into reaction create (author-only, if not actor).
- [x] 2.7 Add `app/routes/story_reaction.py`: `POST /api/stories/{story_id}/reactions` (toggle).
- [x] 2.8 Update story serializer(s) to include `response_count` and the three reaction counts on story detail and list/card responses.
- [x] 2.9 Emit `story_reaction.toggle` OTel span, structured logs, and the `story_reactions_toggled_total` metric labeled by `reaction_type`.
- [x] 2.10 Tests: toggle on/off, "one of each type per user," membership gating, counter accuracy after add/remove, counts surfaced in story serializers.
- [x] 2.11 Run `just validate-backend` and `uv run pytest` — must pass before opening the PR.

## 3. Frontend: responses UI

- [x] 3.1 Add `apps/web/src/features/story-responses/api/` TanStack Query hooks: list (cursor), create, update, delete, matching the existing `features/story/api` client conventions.
- [x] 3.2 Add "Memories & responses" section component on the Read page (below story body, per `story-reading`'s reserved surface): flat list, avatar + name + relative time, oldest-first.
- [x] 3.3 Add response input with placeholder "Add what you remember…"; optimistic insert on submit, reconciled via query invalidation.
- [x] 3.4 Add inline edit affordance for the response's own author, showing an "edited" marker after save.
- [x] 3.5 Add delete affordance visible to the response's author and to legacy creator/admin (hidden for advocate/admirer per spec).
- [x] 3.6 Sanitize/render response body as plain text with line breaks only (no HTML injection) — reuse the existing sanitizer utility.
- [ ] 3.7 Add the "this sounds like its own story" gentle inline offer for long responses, seeding the Edit page per the proposal (stretch — only if time allows within the 400 LOC budget; otherwise move to section 7).
- [x] 3.8 Component/unit tests for the responses section (render, submit, edit, delete, permission-gated affordances).
- [x] 3.9 Run `npm run lint` and `npm run test` (apps/web) — must pass before opening the PR.

## 4. Frontend: reactions UI

- [x] 4.1 Add reaction toggle row (Heart/Candle/Smile, lucide icons) on the Read page, with counts, toggled state per current user, and optimistic update reconciled via query invalidation.
- [x] 4.2 Add reaction counts to story card components on hubs and legacy pages, alongside existing metadata.
- [x] 4.3 Add TanStack Query hook for the reaction toggle endpoint.
- [x] 4.4 Component/unit tests for reaction toggling and count display.
- [x] 4.5 Run `npm run lint` and `npm run test` — must pass before opening the PR.

## 5. Invite moment

- [x] 5.1 Add `invite_prompt_dismissed_at` (nullable timestamptz) to `Legacy`; Alembic migration.
- [x] 5.2 Add a dismiss endpoint/service call (e.g. `PATCH /api/legacies/{legacy_id}` or a dedicated dismiss route, matching existing legacy-route conventions) that sets `invite_prompt_dismissed_at`.
- [x] 5.3 Add frontend logic computing prompt visibility from published-story-count and member-count (per design §4), reading `invite_prompt_dismissed_at` from the legacy payload.
- [x] 5.4 Add the dismissible full-card prompt component ("…Invite the people who knew her.") wired to open the existing `InviteMemberModal` (`features/members/components/InviteMemberModal.tsx`).
- [x] 5.5 Wire the dismiss action to the new endpoint and invalidate the legacy query on success.
- [x] 5.6 Tests: prompt appears at 1 member/1 published story and after legacy creation with zero stories; prompt absent at 2+ members; dismissal persists and is visible to other members.
- [x] 5.7 Run `just validate-backend` (for 5.1–5.2) and `npm run lint`/`npm run test` (for 5.3–5.6) — must pass before opening the PR.

## 6. Activity feed language

- [x] 6.1 Define the (action, entity_type) → sentence-template map in `app/services/activity.py` (backend) covering at minimum story creation/publish, response, reaction, and membership events.
- [x] 6.2 Filter untemplated events out of `get_activity_feed`/`get_social_feed` before pagination, per design §5.
- [x] 6.3 Update `apps/web/src/features/activity/components/ActivityFeedItem.tsx` to render the templated sentence (no client-side fallback to raw metadata).
- [x] 6.4 Tests: templated event renders as a sentence naming actor + legacy/story; untemplated event (e.g. raw media CRUD) is absent from the feed response; `limit` counts only templated items.
- [x] 6.5 Run `just validate-backend` and `npm run lint`/`npm run test` — must pass before opening the PR.

## 7. Optional / stretch: "Save as story" upgrade

- [ ] 7.1 (If not completed in 3.7) Add the long-response prompt offering to save the response as its own story, pre-seeding the Edit page with the response text and linking it to the same legacy.
- [ ] 7.2 Tests for the seed-and-navigate flow.
- [ ] 7.3 Run `npm run lint` and `npm run test` — must pass before opening the PR. Not required for this change's acceptance criteria; safe to defer to a follow-up change if it doesn't fit the 400 LOC budget.
