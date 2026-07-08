# Proposal: sharing-privacy-foundation

## Why

Mosaic Life is evolving toward three sharing postures (Journal / Circle / Open — owner direction agreed 2026-07-08; see `docs/design/2026-07-ui-review/` for the review corpus that seeded this roadmap). Every planned phase (visibility-scope rename, posture settings, story responses/perspectives, audience circles) builds on the story/legacy authorization model — and that model today is implemented in **three named check functions plus inline SQL filters in each list endpoint**, and the copies have already diverged: legacy-link share grants are honored in AI retrieval but not in direct story reads; story lists show `private` stories to `admirer`-role members while AI retrieval withholds them; a dead role-based edit helper contradicts the enforced author-only rule; and an obsolete join flow writes role values that don't exist in the current role hierarchy. There is also no living spec: `openspec/specs/` is empty, so the enforced behavior has no authoritative statement to delta against in later phases.

This change consolidates enforcement into one policy module, closes the known inconsistencies, and establishes the baseline capability specs — before new sharing features multiply the defects.

## What Changes

- **Single authorization policy module** for story access: one `can_view`-style check and one SQL visibility-filter builder, replacing the parallel implementations (`app/services/story_access.py::can_read_story`, `app/services/story.py::_check_story_visibility`, `app/services/retrieval.py::resolve_visibility_filter`) and the inline visibility SQL in `list_legacy_stories`, `list_stories_scoped`, and `list_public_stories`. All read surfaces (story detail, story lists, AI/RAG retrieval, graph-context filtering) route through it.
- **Delete dead edit logic**: remove `app/services/story.py::_can_edit_story` (defined, never called). Author-only editing is the decided model and stays as-is.
- **Honor legacy-link shares in direct reads** (bug fix): a story shared across an active `legacy_link` (`share_mode="all"` or an explicit `legacy_link_shares` row) is currently reachable via AI context but returns 403/404 on its own detail endpoint. After this change, link-shared stories are readable and listed for members of the linked legacy, with the same role gating as local private stories.
- **BREAKING (API): remove the obsolete join flow**: `POST /api/legacies/{id}/join` and its member-approval endpoint, plus `app/services/legacy.py::request_join_legacy` / `approve_legacy_member` (lines 861–979). These write non-canonical roles (`"pending"`, `"member"`) that are outside the 4-tier hierarchy. The `legacy_access_requests` flow is the single join mechanism. The frontend's `joinLegacy()` (`apps/web/src/features/legacy/api/legacies.ts:127`) is exported-but-unused and is removed with it — no user-facing surface calls the old flow.
- **Data cleanup + DB constraints**: one Alembic migration that (a) normalizes any residual non-canonical `legacy_members.role` values, and (b) adds CHECK constraints on `stories.visibility`, `legacies.visibility`, and `legacy_members.role` so drift cannot recur silently.
- **Initial living specs** for the two capabilities below, documenting the *currently enforced* semantics (plus the link-share fix) as observable behavior.

No other user-visible behavior changes: visibility scope names, role names, invitation and access-request flows, and all frontend surfaces stay as they are.

## Capabilities

### New Capabilities

- `story-access`: who can read, list, edit, and delete a story — visibility scopes (`public`/`private`/`personal`), draft gating, author-only editing, role-gated member access, legacy-link share grants, and the guarantee that access decisions are identical across every surface (detail, lists, AI retrieval, graph context).
- `legacy-access`: who can see and join a legacy — legacy visibility (`public`/`private`), the 4-tier membership role hierarchy (`creator`/`admin`/`advocate`/`admirer`) and its management rules, invitations, and access requests as the single join mechanism, with canonical role values enforced at the database level.

### Modified Capabilities

None — `openspec/specs/` is currently empty; these are the first living specs.

## Impact

- **Backend** (`services/core-api`): new policy module under `app/services/`; refactors in `story.py`, `story_access.py`, `retrieval.py`, `graph_access_filter.py`, `legacy.py`; route updates in `routes/story.py`, `routes/legacy.py` (endpoint removal); callers in `routes/ai.py`, `routes/rewrite.py`, `routes/story_context.py`, `routes/graph_context.py` switch to the policy module. One Alembic migration.
- **Frontend** (`apps/web`): delete unused `joinLegacy()`; no UI changes.
- **Tests**: replace `test_legacy_service.py` join-flow tests; new policy-module test suite covering the access matrix (scope × role × link-share); regression tests for the link-share read fix.
- **No changes** to auth/session handling, graph writes, media, or AI behavior (AI paths only swap which function performs an identical check — except where link-share now correctly grants access).

## Non-goals

Later phases of the agreed roadmap, explicitly out of scope here:

- Visibility vocabulary rename (`personal`→`private`, `private`→`members`) and any `unlisted`/tokenized share links.
- Posture settings (Journal / Circle / Open) at user or legacy level, and Journal-mode UI suppression.
- Story responses/reactions and perspective-linked stories (`docs/design/2026-07-ui-review/specs/02-story-responses.md`).
- Named circles / user-curated audiences (audience-model Option B); this change only keeps the schema compatible with adding grant types later.
- Explore-page wiring, graph `Legacy`/`LINKED_TO` sync, or any change to what gets written to Neptune. (Decided: the graph is never an authorization input; PostgreSQL remains the sole authorizer.)
- Media-level visibility.

## Open Questions

1. **Residual non-canonical rows** — for existing `legacy_members` rows with `role="pending"` (stale join flow) the migration must pick: delete them (they were never approved; matches what migration `d2b2655f45ed` did once before) or convert them to `legacy_access_requests`. **Proposed: delete.** For `role="member"`: map to `advocate` (same level in `ROLE_HIERARCHY`). **Proposed: map.**
   → Decision: **Delete** `pending` rows; map `member`→`advocate` (and `editor`→`admin`) as proposed. (Owner, 2026-07-08)
2. **Link-shared stories in lists** — should stories granted via a legacy link appear in the linked legacy's story *lists* (consistent with AI retrieval today), or only be readable by direct URL? **Proposed: appear in lists**, attributed to their origin legacy.
   → Decision: **Appear in lists, attributed to their origin legacy.** (Owner, 2026-07-08)
3. **Role gating across links** — which members of the linked legacy see link-shared private stories? **Proposed: exactly the same rule as local private stories** (whatever Q5 decides), so there is one audience rule everywhere.
   → Decision: **Same rule as Q5 — all non-pending members of the receiving legacy, including admirers, see link-shared private stories.** (Owner, 2026-07-08)
4. **Old join endpoint removal** — hard-remove `POST /api/legacies/{id}/join` in this change (proposed; no live callers), or deprecate-then-remove across two releases? **Proposed: hard-remove.**
   → Decision: **Hard-remove.** (Owner, 2026-07-08)
5. **Do admirers see `private` (members-only) stories?** (part 1 of the admirer question) Today the per-legacy story list says yes (`list_legacy_stories` shows private to any non-pending member) while AI retrieval says no (`PRIVATE_ACCESS_ROLES` excludes `admirer`). The consolidated policy must pick one. **Proposed: yes — scopes define the audience, roles define capabilities** ("Admirer — can view only" per the invite UI); this also matches the planned `private`→`members` rename, where "members can see it" should mean all members. The conservative alternative is to align lists to retrieval (admirers lose access they currently have in the UI). Note: choosing "yes" means AI retrieval starts including private stories for admirers; choosing "no" visibly shrinks story lists for existing admirers.
   → Decision: **Yes — admirers see `private` stories. Scopes define the audience; roles define capabilities.** AI retrieval aligns to this (starts including private stories for admirers). (Owner, 2026-07-08)
6. **Can admirers create stories?** (part 2 of the admirer question) Enforcement today lets any non-pending member create stories, but the invite UI promises "Admirer — can view only". **Proposed: require `advocate` or higher to create stories** (one role check in `create_story`), aligning enforcement with what inviters were told. Alternative: keep current behavior and fix the UI copy instead.
   → Decision: **No — `advocate` or higher is required to create a story against a legacy** (applies per-legacy, including when adding legacy associations to an existing story). (Owner, 2026-07-08)
