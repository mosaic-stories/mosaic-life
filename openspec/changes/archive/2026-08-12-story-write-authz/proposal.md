## Why

`POST /api/stories/{story_id}/rewrite` gates on **read** access but performs **writes**. `require_story_read_access` returns the story to any authenticated user on a `public` story (and to any non-pending legacy member on a `private` one), and the handler then calls `_save_rewrite_version`, which **deletes the author's existing draft**, inserts a new draft built from the caller's prompt, and repoints the active evolution session's `draft_version_id` at it.

Any authenticated user can therefore destroy another author's in-progress draft and inject their own content into that author's editing session. This is a broken-object-level-authorization (IDOR) defect: the permission checked is weaker than the action performed.

The `story-access` spec already says only the author may edit a story ("Author-only editing"); the code simply does not enforce that on this endpoint. The sibling evolution flow gets it right (`story_evolution._require_story_author`), so the rewrite endpoint is also inconsistent with the established pattern.

Requirement source: [issue #98](https://github.com/mosaic-stories/mosaic-life/issues/98) (automated security review, severity **High**).

## What Changes

- A single canonical write gate, `require_story_write_access`, is added to `app/services/story_access.py` alongside the existing read gate. It composes the read gate first (so draft-existence hiding and read denials stay identical to every read surface) and then enforces **author-only**, per the existing `story-access` "Author-only editing" requirement.
- `routes/rewrite.py` swaps its read gate for the write gate. A non-author calling `/rewrite` gets **403** on a story they can read, **404** on someone else's draft, and the author's draft is left untouched. **This is the fix for #98.**
- The three existing near-duplicate author checks — `routes/story_version.py::_require_author`, `services/story_evolution.py::_require_story_author`, and (pending Q1) the inline check in `services/story.py::update_story` — delegate to the new helper so there is one authorization policy rather than four.
- As a side effect of consolidation, the version and evolution surfaces stop disclosing the existence of another author's **draft** story: they currently answer 403 ("Only the author can…"), which confirms the story exists. Composing the read gate makes them answer **404**, matching the spec's "Draft stories are invisible to non-authors" requirement.
- The trap is documented: `require_story_read_access` gains a docstring warning, and `docs/developer/CODING-STANDARDS.md` gains an explicit rule that a mutating endpoint must never gate on a read check.

No schema change, no migration, no API-contract change for legitimate users (the web app already gates Edit/Evolve entry on `isAuthor` in `StoryReadPage.tsx`, so no UX regression is expected).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `story-access`: broadens the existing **Author-only editing** requirement so it covers every mutation of story-owned state — content, title, visibility, status, **versions and drafts, AI-assisted rewrite output, and evolution-session state** — not just the story row; and adds a requirement that write access is never inferred from read access, with the draft-existence rule applying to write endpoints too.

## Impact

- **Backend** (`services/core-api`), no frontend changes:
  - `app/services/story_access.py`: add `require_story_write_access` + `can_write_story` decision helper; docstring warning on `require_story_read_access`.
  - `app/routes/rewrite.py:50`: `require_story_read_access` → `require_story_write_access`. Single-line fix; the rest of the module is unchanged.
  - `app/routes/story_version.py:34-53`: `_require_author` delegates to the helper.
  - `app/services/story_evolution.py:51-63`: `_require_story_author` delegates to the helper.
  - `app/services/story.py:1266-1280` (pending **Q1**): inline author check delegates to the helper.
  - `app/observability/metrics.py`: no new metric — reuse `authz_decisions_total` with new reason values (see design.md).
  - Tests: `tests/routes/test_rewrite.py` (exploit regression), `tests/test_access_matrix.py` (write-gate matrix), version/evolution draft-404 cases.
- **Docs**: `docs/developer/CODING-STANDARDS.md` security section.
- **Surfaces deliberately left on the read gate** (audited, not vulnerable — each writes only rows keyed to the *calling* user, so there is no cross-user tamper):
  - `routes/graph_context.py:43` — GET, read-only.
  - `routes/ai.py:359` — conversation seeding, reads story content only.
  - `routes/ai.py:752` and `routes/story_context.py:92` — context extraction; writes `StoryContext` scoped to `(story_id, user_id)`.
  - `routes/story_context.py:129` — fact status; already scoped to the caller's own `StoryContext`.

## Non-goals

- **No new roles or co-editing.** The spec's decision stands: author-only, no membership role grants edit access. Issue #98 floats "editor/creator legacy role" as an option; we are explicitly not taking it. (Story *deletion* rights — author or legacy `creator` — are a separate, already-specified rule and are unchanged.)
- No change to any **read** rule, visibility scope, legacy-link share behavior, or the story-deletion rule.
- No refactor of the rewrite pipeline itself (prompt building, streaming, draft-replacement semantics) beyond the authorization gate.
- No rate limiting, abuse detection, or audit-log subsystem — out of scope for this fix.
- No change to `story-responses` moderation or reaction authorization.

## Open Questions

All answered by the owner (2026-08-11) — see Resolved Decisions. None remain blocking apply.

1. ~~**Does `services/story.py::update_story` join the consolidation?**~~ → **Yes.**
2. ~~**Ship path: hotfix to `main`, or normal `develop` flow?**~~ → **Normal `develop` flow.**
3. ~~**Do we audit production for prior exploitation before shipping?**~~ → **Yes, but not gating** — the platform is early-stage and exploitation is considered unlikely.

## Resolved Decisions

Settled with the owner (2026-08-11):

- **Scope** → fix **plus** consolidate the duplicate author-check helpers onto one canonical gate (not the minimal one-line patch, not a full authz audit of every story-scoped surface). The audit of the other read-gated call sites was still performed and is recorded under Impact.
- **Artifact** → formalize as this OpenSpec change rather than patching directly.
- **Q1 — `update_story` consolidation** → **yes**, it migrates onto the canonical gate (task §3.3 stands). Accepted behavior change: a non-author updating another author's **draft** goes from 403 to **404**, which is the spec-conformant answer.
- **Q2 — ship path** → **normal `develop` flow**, no `main` hotfix. The PR split in `tasks.md` still holds (fix first, then consolidation), but both travel the ordinary GitOps path.
- **Q3 — production audit** → run it, but it does **not** gate the fix. Early-stage platform, low exploitation likelihood. Result recorded in task §0.1; a non-empty result escalates, an empty one is simply noted in the PR.
