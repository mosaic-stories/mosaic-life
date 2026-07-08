# Tasks: sharing-privacy-foundation

Prerequisite (met 2026-07-08): all Open Questions in `proposal.md` have recorded owner decisions; the spec deltas encode them.

## 1. Golden access-matrix tests (pin current behavior)

- [x] 1.1 Add `tests/test_access_matrix.py` covering the read decision for every combination of scope (`public`/`private`/`personal`) × requester (author, creator, admin, advocate, admirer, non-member, unauthenticated where applicable) × draft status × legacy-link state (none, active-all, active-selective, revoked), exercised through the story detail endpoint, `list_legacy_stories`, and `resolve_visibility_filter`. Assert *current* behavior; mark the rows the Q2/Q3/Q5/Q6 decisions will flip with `pytest.mark.xfail(strict=True)` and a comment naming the question. Validate: `uv run pytest tests/test_access_matrix.py` green, then `just validate-backend`.

## 2. Policy module

- [x] 2.1 Evolve `app/services/story_access.py` into the policy module per design D1: `allowed_visibilities(role)`, link-share-aware `can_read_story` (D2), and `visible_stories_criteria(...)`; add the `authz.can_read_story` / `authz.visibility_criteria` spans, `authz.access_denied` log event, and `authz_decisions_total` metric. Unit tests for each rule clause including link-share edge cases (inactive links, selective misses, `personal` never crossing). Validate: `uv run pytest`, `just validate-backend`.

## 3. Route all surfaces through the policy module

- [x] 3.1 Story detail + lists: replace `_check_story_visibility` and the inline visibility SQL in `list_legacy_stories`, `list_stories_scoped`, `list_public_stories` with policy-module calls; delete `_can_edit_story`; add the Q6 role gate in `create_story` (and when adding legacy associations). Flip the affected xfail rows in the access matrix to their decided expectations. Validate: `uv run pytest`, `just validate-backend`.
- [x] 3.2 Retrieval + graph: make `resolve_visibility_filter` a wrapper over `allowed_visibilities` (preserving its 403 contract and `retrieval.resolve_visibility` span) and update `GraphAccessFilter` to the policy module; keep `get_linked_legacy_filters` as the single link-resolution helper. Confirm the full access matrix passes with zero xfails. Validate: `uv run pytest`, `just validate-backend`.

## 4. Join-flow consolidation

- [x] 4.1 Remove `POST /api/legacies/{legacy_id}/join` and `POST /{legacy_id}/members/{user_id}/approve` routes, `request_join_legacy` / `approve_legacy_member` services, and their tests; delete `ROLE_HIERARCHY` in favor of `ROLE_LEVELS`; change `check_legacy_access` default to `required_role="advocate"` and update callers passing `"member"`. Remove unused `joinLegacy()` from `apps/web/src/features/legacy/api/legacies.ts`. Validate: `uv run pytest`, `just validate-backend`, `just validate-frontend`.

## 5. Migration and constraints

- [x] 5.1 Alembic revision per design D5: normalize `member`→`advocate` and `editor`→`admin`, delete `pending` rows (per Q1 decision), pre-flight guard, then CHECK constraints on `legacy_members.role`, `stories.visibility`, `legacies.visibility`; `downgrade()` drops the constraints. Rehearse on the compose Postgres seeded with non-canonical rows: `uv run alembic upgrade head`, insert-violation test (constraint rejects `role='pending'`), `uv run alembic downgrade -1`, re-upgrade. Validate: rehearsal recorded in the task notes, `uv run pytest`, `just validate-backend`.

## 6. End-to-end verification

- [x] 6.1 In the running compose stack, drive and record: (a) admirer/advocate/non-member story visibility in a private legacy matches the decided matrix in UI and API; (b) a link-shared story opens on its detail page for a member of the receiving legacy and 403s after the link is revoked; (c) a draft is 404 to another member; (d) `POST /api/legacies/{id}/join` returns 404; (e) access-request → approve → membership flow works from the UI; (f) `authz_decisions_total` visible on `/metrics` and `authz.can_read_story` spans in Jaeger. Record observations in the change directory.
