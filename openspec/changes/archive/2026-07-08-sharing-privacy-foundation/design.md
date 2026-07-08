# Design: sharing-privacy-foundation

## Context

Story/legacy authorization logic is currently spread across at least six sites in `services/core-api`:

| Site | Surface | Notes |
|---|---|---|
| `app/services/story_access.py::can_read_story` | AI, rewrite, story-context, graph-context routes | No link-share awareness |
| `app/services/story.py::_check_story_visibility` | Story detail endpoint | Duplicate of the above; no link-share awareness |
| `app/services/story.py::list_legacy_stories` (inline SQL) | Per-legacy story list | Shows `private` to **all** non-pending members incl. admirers |
| `app/services/story.py::list_stories_scoped` / `list_public_stories` (inline SQL) | My-stories tabs, public list | Own copies of the visibility OR-clauses |
| `app/services/retrieval.py::resolve_visibility_filter` + `get_linked_legacy_filters` | AI/RAG chunk retrieval | Role-gates admirers out of `private`; honors legacy-link shares |
| `app/services/graph_access_filter.py` | Graph-context story filtering | Composes the two retrieval functions |

Known divergences: (1) legacy-link shares grant access in retrieval/graph paths only — a link-shared story 403s on its own detail endpoint; (2) admirer access to `private` stories differs between lists (yes) and retrieval (no); (3) `app/services/story.py::_can_edit_story` defines role-based editing that no caller uses — `update_story` enforces author-only; (4) the obsolete join flow (`request_join_legacy`/`approve_legacy_member`, exposed as `POST /api/legacies/{id}/join` and `POST /{legacy_id}/members/{user_id}/approve`) writes `role="pending"` then `role="member"`, values outside the 4-tier model; frontend caller is dead code. No CHECK constraints exist on `stories.visibility`, `legacies.visibility`, or `legacy_members.role`; `ROLE_HIERARCHY` (deprecated) coexists with `ROLE_LEVELS` in `app/services/legacy.py`.

Constraint: this change must not alter intended behavior — only close the divergences, each resolved by an explicit owner decision in `proposal.md` Open Questions.

## Goals / Non-Goals

**Goals:**

- One implementation of "who can read this story" used by every surface: single-story check and SQL filter builder produced from the same rules.
- Legacy-link share grants honored uniformly (detail, lists, retrieval, graph).
- One join mechanism (`legacy_access_requests`); canonical role values enforced by the database.
- A golden access-matrix test suite that pins behavior before and after the refactor.
- Living specs (`story-access`, `legacy-access`) describing enforced behavior.

**Non-Goals:**

- No scope renames, posture settings, responses/perspectives, circles, Explore, or graph-write changes (later phases).
- No changes to media or conversation access rules beyond what the shared filters already do.
- No API shape changes other than removing the two dead join endpoints.

## Decisions

### D1. Shape of the policy module

**Options:**

- **A (recommended): evolve `app/services/story_access.py` into the policy module.** Module-level async functions, no class/DI. Public surface:
  - `can_read_story(db, story, user_id) -> bool` — single-story decision (visibility + membership + link-share grants + draft gating stays at call sites that need 404-vs-403 semantics).
  - `visible_stories_criteria(user_id, *, legacy_id, membership_role, link_filters) -> ColumnElement` — returns SQLAlchemy criteria for list queries, built from the same rule table.
  - `allowed_visibilities(role) -> list[str]` — the role→scope mapping, single definition (replaces `PRIVATE_ACCESS_ROLES` as the source of truth; retrieval imports it).
  - `require_story_read_access(...)` — existing HTTP wrapper, unchanged signature.
- **B: new `app/services/authz.py` service class registered in `providers/registry.py`.** More extensible (future grant types plug in as strategies) but introduces a DI pattern no other service-layer check uses, and callers churn more.

**Choice: A.** Matches the existing service-layer idiom, keeps the refactor mechanical (callers of the three old functions redirect to one), and Option B's extensibility isn't needed until circles (audience-model Option B) arrive — at which point a new grant becomes one more clause in the same two functions. `story.py::_check_story_visibility` and the inline list SQL are deleted; `retrieval.py::resolve_visibility_filter` becomes a thin wrapper that resolves membership then calls `allowed_visibilities` (its 403-on-non-member contract and span are preserved).

### D2. Link-share grants in single-story reads

`can_read_story` gains a final clause: if direct rules deny and the story is `public`/`private`-scoped with legacy associations, look up active `legacy_links` connecting the user's legacies to the story's legacies and apply the sharing side's `share_mode` (`all`, or `selective` + `legacy_link_shares` row). Implementation reuses `get_linked_legacy_filters` (moved or imported — no second implementation). The extra queries run only when direct membership fails, so the hot path (member reads own legacy's story) is unchanged. `personal` stories are never link-shareable. Role gating across links follows the owner's decision on proposal Q3 (default: same rule as local stories).

List surfaces get the same grant by passing `link_filters` into `visible_stories_criteria` (proposal Q2 decides whether lists include link-shared stories or only the detail endpoint honors them).

### D3. Admirer access to `private` stories

Both current behaviors are defensible; the policy module needs one rule (proposal Q5, owner decides):

- **A (recommended): scopes are audience, roles are capabilities.** All non-pending members see `private`; admirer stays view-only (cannot contribute). Consistent with the invite UI copy and with the future `private`→`members` rename. Effect: AI retrieval starts including `private` stories for admirers.
- **B: role-gated depth.** Align lists to retrieval; admirers see only `public` + own `personal`. Effect: story lists visibly shrink for existing admirers.

The golden test matrix encodes whichever is chosen; `allowed_visibilities` is the only code point that changes between them.

### D4. Join-flow consolidation and role canonicalization

Remove `POST /api/legacies/{legacy_id}/join`, `POST /{legacy_id}/members/{user_id}/approve`, `legacy_service.request_join_legacy`, `legacy_service.approve_legacy_member`, frontend `joinLegacy()`, and their tests — `legacy_access_requests` (already the UI path) is the single join mechanism. Delete `ROLE_HIERARCHY`; `check_legacy_access` keeps its behavior but its default becomes `required_role="advocate"` (same level as the old `"member"` default) and all internal callers pass canonical role names. `role != "pending"` guards become dead once the migration lands but are removed only where the policy module replaces them wholesale.

### D5. Migration and constraints

Single Alembic revision, in order:

1. `UPDATE legacy_members SET role='advocate' WHERE role='member'`; `UPDATE ... SET role='admin' WHERE role='editor'`; `DELETE FROM legacy_members WHERE role='pending'` (proposal Q1; counts logged via `op.execute` result rowcounts printed in migration output).
2. Add CHECK constraints: `legacy_members.role IN ('creator','admin','advocate','admirer')`; `stories.visibility IN ('public','private','personal')`; `legacies.visibility IN ('public','private')`.
3. Pre-flight guard inside the migration: a SELECT for any value outside the allowed sets after step 1 aborts the migration with a clear error rather than failing on constraint creation.

**Rollback:** `downgrade()` drops the three CHECK constraints. The role normalization is intentionally not reversed (old values are defects, not data); deleted `pending` rows are unrecoverable — acceptable because the same deletion was already performed once by `d2b2655f45ed` and nothing user-facing can create them since the join endpoints are removed in the same deploy. Deploy order is safe either way: code without old values tolerates an un-migrated DB; the migration tolerates old code for the minutes between steps in a rolling deploy (constraint violations could only come from the removed endpoints).

## Observability

- Spans: `authz.can_read_story` (attrs: `story_id`, `user_id`, `decision`, `reason`: `public|author|member|link_share|denied`), `authz.visibility_criteria` (attrs: `legacy_id`, `role`, `link_filter_count`). Existing `retrieval.resolve_visibility` span name is preserved by the wrapper.
- Logs (structured JSON, per CODING-STANDARDS fields): `authz.access_denied` with `user_id`, `story_id`, `visibility`, `reason` replaces the ad-hoc `story.access_denied` / `retrieval.access_denied` variants (message keys kept as aliases for one release for dashboard continuity).
- Metric: `authz_decisions_total{decision, reason, service="core-api"}` counter — cheap and makes a post-deploy diff of allow/deny rates the primary regression signal for the consolidation.

## Risks / Trade-offs

- **[Silent behavior delta hidden in the consolidation]** → Golden access-matrix tests (scope × role × membership × link-state × draft-status) are written against the *old* code paths first and must pass unchanged against the policy module, except for rows the owner explicitly decided (Q2/Q3/Q5), which are asserted to change.
- **[Link-share fix widens exposure]** → New tests cover: pending/rejected/revoked links grant nothing; `selective` shares only listed stories; `personal` never crosses links; revoking a link immediately revokes access (no caching).
- **[Migration fails or strands prod rows]** → Pre-flight guard aborts before constraint creation; migration rehearsed against a local compose DB seeded with non-canonical rows; counts logged.
- **[More queries on the story-detail deny path]** → Link lookup only runs after direct denial; two indexed queries, acceptable at MVP scale (measured in the verification task).
- **[Log/dashboard breakage from renamed events]** → old event names emitted as aliases for one release.

## Open Questions

None outstanding — all six `proposal.md` questions have owner decisions recorded (2026-07-08), matching the proposed defaults: Q1 delete `pending` rows / map `member` and `editor`; Q2 link-shared stories appear in lists with origin attribution; Q3 link-share audience = local `private` audience; Q4 hard-remove join endpoints; Q5 admirers see `private` (D3 Option A); Q6 story creation requires `advocate`+ per legacy.
