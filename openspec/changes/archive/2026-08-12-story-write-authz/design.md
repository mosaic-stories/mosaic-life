## Context

Four independent implementations of "is this user allowed to write to this story" exist today, and a fifth surface has none:

| Surface | Gate | Draft of another author | Detail message |
|---|---|---|---|
| `story.py::update_story` | inline `author_id != user_id` | 403 (leaks existence) | "Only the story author can update this story" |
| `story_version.py::_require_author` | inline `author_id != user_id` | 403 (leaks existence) | "Only the author can manage versions" |
| `story_evolution.py::_require_story_author` | inline `author_id != user_id` | 403 (leaks existence) | "Only the story author can evolve it" |
| `story.py::delete_story` | author **or** legacy `creator` | 403 | (deletion rule — out of scope) |
| **`rewrite.py::rewrite_story`** | **`require_story_read_access`** | — | **no author check at all → issue #98** |

The read gate, by contrast, does apply the spec's draft rule (`story_access.py:44-45`: non-author + `status == "draft"` → 404). So the read path is *more* correct about existence disclosure than the write paths are.

Two design decisions follow: what the canonical gate is, and how much it changes for existing callers.

## Decision 1 — Shape of the canonical write gate

### Option A — Compose the read gate, then check authorship (recommended)

```python
async def require_story_write_access(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    *,
    action: str = "modify",
) -> Story:
    """Load a story and enforce author-only write access.

    Runs the read gate first so draft-existence hiding and read denials
    are identical to every read surface, then enforces the story-access
    spec's author-only editing rule.
    """
    story = await require_story_read_access(db=db, story_id=story_id, user_id=user_id)
    allowed, reason = await can_write_story(story=story, user_id=user_id)
    if not allowed:
        raise HTTPException(
            status_code=403, detail=f"Only the story author can {action} this story"
        )
    return story
```

- **Cost:** no extra queries on the path that matters. An author short-circuits `_can_read_story` before any membership query (`public` → immediate `True`; `private`/`personal` → `author_id == user_id` → immediate `True`). The read gate's single `SELECT` with `selectinload(Story.legacy_associations)` is the same query the callers already run.
- **Never discloses more than the read gate already does.** A caller who cannot read gets the read gate's 403/404 verbatim; only a caller who *can* read reaches the "not the author" message. Status codes are 403 in both cases, so there is no oracle.
- **Fixes the draft leak for free** on the version and evolution surfaces once they delegate.
- **Trade-off:** the author check is now coupled to read policy. If the two ever diverge (e.g. a future "story locked for moderation" read block that should not block the author's own writes), this composition needs revisiting. Acceptable today: the author can always read their own story under every current rule.

### Option B — Standalone author-only gate

Mirror `_require_story_author`: one `SELECT`, 404 if missing, 403 if not author. Simplest and fully decoupled from read policy — but it must *re-implement* the draft-existence rule to stay spec-conformant, which is exactly the duplication this change exists to remove. Rejected.

### Option C — Role-capable policy (`can_write_story` with a capability table)

Generalize now for future co-editing/editor roles, mirroring `allowed_visibilities`. Rejected as speculative: the `story-access` spec's "Author-only editing" requirement explicitly states that *no* membership role grants edit access, so there is no role to encode. Issue #98 suggests this option; we are declining it in favor of the specified rule. Option A leaves the door open — `can_write_story` is a separate decision function, so adding roles later is a change to one function, not to five call sites.

**Recommendation: Option A.**

### Signature notes

- `action: str = "modify"` exists only to preserve each caller's existing human-readable detail ("manage versions", "evolve it", "update this story"). No test or frontend string asserts on these today (verified), so this is politeness, not compatibility.
- `can_write_story(story, user_id) -> tuple[bool, str]` mirrors `can_read_story`'s shape, is synchronous-friendly but declared `async` for symmetry and future role lookups, and is where the span/metric/log live.

## Decision 2 — Migration blast radius for existing callers

Delegating changes two observable things for the three existing author checks:

1. **Draft of another author: 403 → 404.** This is a spec-conformance fix ("Draft stories are invisible to non-authors… so the draft's existence is not disclosed"). No client depends on 403 here — the web app gates these surfaces on `isAuthor` before calling.
2. **Unreadable story: message changes** from "Only the author can…" to "Not authorized to view this story". Same 403 status.

Both are improvements. The riskiest migration is `update_story` (highest traffic) — hence **Q1** in the proposal, which the human answers before apply. If Q1 is declined, tasks §1, §2, §3.1, §3.2 stand on their own and `update_story` keeps its inline check.

## Data & rollback

No schema change, no migration, no data backfill. Rollback is a code revert; nothing to undo in the database.

Because the gate only *narrows* access, the failure mode of a bad rollout is legitimate authors getting 403 — loud and immediately visible in the metric below, not silent. That is the right direction for a security fix.

## Observability

- **Span:** `authz.can_write_story` — attributes `story_id`, `user_id`, `decision` (`allow`/`deny`), `reason` (`author`/`not_author`), `action`. Mirrors the existing `authz.can_read_story` span so both decisions show up on the same trace.
- **Metric:** reuse the existing `authz_decisions_total{decision, reason, service}` counter (`app/observability/metrics.py:88`) — no new metric. New reason values: `author` (allow) and `not_author` (deny). `not_author` on `/rewrite` is the exploit-attempt signal; a spike after deploy means either an attacker or a legitimate flow we mis-gated.
- **Log:** `authz.write_denied` at WARNING with fields `user_id`, `story_id`, `author_id`, `action`, `visibility`, `status` — matching the shape of the existing `authz.access_denied` log so the same queries work.

## Verification strategy

Status-code assertions are necessary but **not sufficient** for this bug: the whole point is data integrity. The regression test must assert both halves —

1. User B's `POST /rewrite` on User A's public story returns 403, **and**
2. A's existing draft row is still present, unmodified, with its original `id`, `content`, and `created_by`, and the evolution session's `draft_version_id` still points at it.

A test that only checks the status code would still pass if the gate ran *after* `_save_rewrite_version`. The fixtures needed already exist: `test_story_public` (author = `test_user`) and `test_user_2`.

## Risks

- **Low.** Narrowing an over-permissive gate; the legitimate path (author rewrites own story) is exercised by the existing evolve flow and covered by a new positive test.
- The one thing to watch post-deploy is `authz_decisions_total{reason="not_author"}` on the rewrite route. If real authors appear there, something upstream is passing the wrong `story_id` — investigate rather than widen the gate.
