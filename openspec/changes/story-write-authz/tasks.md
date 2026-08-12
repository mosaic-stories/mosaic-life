Suggested PR split (each well under 400 LOC): **PR1** = §0–2 (the security fix for #98, ship first), **PR2** = §3–4 (consolidation + guardrail), **PR3** = §5 (verification is folded into PR1 and PR2; §5.3 closes the issue). Reference change id `story-write-authz` and `Fixes #98` in PR1.

## 0. Pre-flight — production exploitation audit (non-gating, per Q3)

- [x] 0.1 Read-only check for prior exploitation in production (`mosaic-prod`, run 2026-08-11) — **clean, no evidence of exploitation.** Copy this result into the PR description.

      -- every version whose creator is not the story's author (the exact fingerprint of the #98 exploit)
      SELECT v.id, v.story_id, v.created_by, s.author_id, v.source, v.status, v.created_at
      FROM story_versions v JOIN stories s ON s.id = v.story_id
      WHERE v.created_by IS DISTINCT FROM s.author_id ORDER BY v.created_at DESC;
      -- → 0 rows (of 117 versions across 47 stories, 15 users; only 1 version with source = 'ai_rewrite')

      -- every evolution session whose creator is not the story's author
      SELECT e.id, e.story_id, e.created_by, s.author_id, e.phase, e.draft_version_id
      FROM story_evolution_sessions e JOIN stories s ON s.id = e.story_id
      WHERE e.created_by IS DISTINCT FROM s.author_id;
      -- → 0 rows (of 55 sessions)

      Deliberately not filtered on `source` — a broader net costs nothing at this data volume. The version query alone is sufficient coverage: `_save_rewrite_version` always inserts a draft row before repointing the session, so a tampered session cannot exist without a mismatched version row. No authors need notifying.

## 1. Canonical write gate

- [x] 1.1 Add `can_write_story(story, user_id) -> tuple[bool, str]` to `app/services/story_access.py`: returns `(True, "author")` when `story.author_id == user_id`, else `(False, "not_author")`. Wrap in span `authz.can_write_story` (attributes `story_id`, `user_id`, `decision`, `reason`, `action`), increment `AUTHZ_DECISIONS` with the same reason values, and log `authz.write_denied` at WARNING on deny — mirroring `can_read_story`'s existing structure exactly.
- [x] 1.2 Add `require_story_write_access(db, story_id, user_id, *, action="modify") -> Story` per design.md Option A: call `require_story_read_access` first, then `can_write_story`; raise 403 `f"Only the story author can {action} this story"` on deny.
- [x] 1.3 Add a docstring warning to `require_story_read_access`: it is a **read** gate and must never be the only gate on an endpoint that mutates story-owned state; point at `require_story_write_access`.
- [x] 1.4 Unit tests in `tests/test_access_matrix.py`: author allowed on `public`/`private`/`personal` and on their own draft; non-author denied 403 on a readable public story; non-member denied 403 on a private story (read gate's message); non-author denied **404** on another author's draft; missing story → 404. Assert the `action` string reaches the detail message.
- [x] 1.5 `just validate-backend`.

## 2. Fix the rewrite IDOR (issue #98)

- [x] 2.1 In `app/routes/rewrite.py`, replace the import and line 50: `require_story_read_access` → `require_story_write_access(db=db, story_id=story_id, user_id=user_id, action="rewrite")`. Confirm it still raises before the `StreamingResponse` is constructed, so the caller gets a JSON 403 rather than an SSE error frame (the module's existing "pre-stream checks must raise JSON HTTP errors" contract).
- [x] 2.2 **Exploit regression test** in `tests/routes/test_rewrite.py` using `test_story_public` (author `test_user`) and `test_user_2`: seed a draft `StoryVersion` plus an active `StoryEvolutionSession` pointing at it, then have `test_user_2` POST `/rewrite`. Assert **403** with a JSON content-type **and** — per design.md's verification strategy — that the original draft row still exists with unchanged `id`, `content`, and `created_by`, and that `evo_session.draft_version_id` is unchanged. A status-only assertion is insufficient.
- [x] 2.3 Positive test: the author can still rewrite their own story (mock the LLM provider as the existing rewrite tests do) and the draft is replaced as before.
- [x] 2.4 Confirm the existing `test_rewrite_rejects_unauthorized_story_access` (private story, non-member → 403 "Not authorized to view this story") still passes unchanged — the read gate runs first, so its message is preserved.
- [x] 2.5 `just validate-backend` and `uv run pytest tests/routes/test_rewrite.py tests/test_access_matrix.py`.

## 3. Consolidate the duplicate author checks

- [x] 3.1 `app/routes/story_version.py`: `_require_author` delegates to `require_story_write_access(..., action="manage versions for")` (or keep a thin wrapper preserving its current message). Remove the duplicated `SELECT` + `selectinload`.
- [x] 3.2 `app/services/story_evolution.py`: `_require_story_author` delegates to `require_story_write_access(..., action="evolve")`. Verify no import cycle (`story_access` imports only models/schemas — clean).
- [x] 3.3 **(pending Q1)** `app/services/story.py::update_story`: replace the inline load + author check with the helper, keeping the existing `story.update_denied` log. Skip this task entirely if Q1 is answered "no".
- [x] 3.4 Tests: for each migrated surface, a non-author requesting another author's **draft** now gets **404** (existence not disclosed) and a non-author on a readable published story gets 403. Update any existing test that asserted 403-on-draft.
- [x] 3.5 `just validate-backend` and full `uv run pytest`.

## 4. Guardrail against recurrence

- [x] 4.1 Add an explicit rule to the security section of `docs/developer/CODING-STANDARDS.md`: an endpoint that mutates a resource must gate on a write/ownership check; a read check is never sufficient. Name `require_story_write_access` as the story-scoped helper.
- [x] 4.2 Record in the same section the audited exception list from proposal.md Impact (graph-context, AI seed, context extraction, fact status) with the reason each is legitimately read-gated — writes are keyed to the calling user, so there is no cross-user tamper. This is what stops a future reviewer re-flagging them.

## 5. Verification & closeout

- [x] 5.1 Drive the exploit in the running compose stack (run 2026-08-11, `core-api` restarted first to guarantee the fix was loaded) — **blocked as expected.** Real signed session cookies for two throwaway users were minted via the app's own `create_session_cookie`/`SessionData` helpers (exercising the real `SessionMiddleware` validation + `UserSession` revocation-check path against real Postgres rows), not a browser login. Fixture: user A (author) owns a public, published `Story`, with an active v1 `StoryVersion` and an in-progress `StoryEvolutionSession` (`phase="drafting"`) pointing at a draft v2 `StoryVersion` (content `"ORIGINAL DRAFT CONTENT — must survive the exploit attempt"`), simulating "A entered Evolve and generated a draft."

      -- attacker B → POST /api/stories/{A_story_id}/rewrite
      curl -s -i -X POST "http://localhost:8080/api/stories/<story_id>/rewrite" \
        -H "Cookie: mosaic_session=<B's cookie>" -H "Content-Type: application/json" \
        -d '{"content": "malicious overwrite attempt"}'
      -- →
      HTTP/1.1 403 Forbidden
      content-type: application/json
      {"detail":"Only the story author can rewrite this story"}

      -- re-queried the draft StoryVersion and StoryEvolutionSession after the attempt: byte-for-byte unchanged
      DRAFT_ID=ddca88e1-17a2-4316-8da6-ddf5b10d8e59        (same id as before the attempt)
      DRAFT_CONTENT="ORIGINAL DRAFT CONTENT — must survive the exploit attempt"  (unchanged, NOT "malicious overwrite attempt")
      DRAFT_CREATED_BY=<A's user id>                       (unchanged)
      EVO_SESSION_DRAFT_VERSION_ID=ddca88e1-17a2-4316-8da6-ddf5b10d8e59  (unchanged, still points at the original draft)

      -- author A → POST /api/stories/{A_story_id}/rewrite (same story, own session cookie)
      curl -s -i --max-time 15 -X POST "http://localhost:8080/api/stories/<story_id>/rewrite" \
        -H "Cookie: mosaic_session=<A's cookie>" -H "Content-Type: application/json" \
        -d '{"content": "legitimate rewrite request"}'
      -- →
      HTTP/1.1 200 OK
      content-type: text/event-stream; charset=utf-8
      -- (not 403/404 — the write gate does not block the real author; core-api logs show the request
      -- proceeded through graph-context assembly and a real LiteLLM call that returned 200 before the
      -- 15s client timeout cut the stream — confirms the gate passes cleanly for the author)

      All fixture rows (2 throwaway users, Person, Legacy, Story, 2 StoryVersions, StoryLegacy,
      AIConversation, StoryEvolutionSession, 2 UserSessions) were deleted afterward; re-queries by id
      confirmed zero rows remain.

- [x] 5.2 Confirmed `authz_decisions_total{reason="not_author"}` increments on the denied call and that `authz.write_denied` appears in the structured logs with `story_id`/`author_id`/`action` (run 2026-08-11, same session as 5.1).

      -- before the exploit attempt (core-api freshly restarted): metric family absent (no denials/writes recorded yet)
      curl -s http://localhost:8080/metrics | grep 'authz_decisions_total{.*reason="not_author"'
      -- → (no output)

      -- after: attacker's denied call (5.1) + author's allowed call (5.1) + their shared read-gate pass
      curl -s http://localhost:8080/metrics | grep '^authz_decisions_total'
      -- →
      authz_decisions_total{decision="allow",reason="public",service="core-api"} 2.0
      authz_decisions_total{decision="deny",reason="not_author",service="core-api"} 1.0
      authz_decisions_total{decision="allow",reason="author",service="core-api"} 1.0
      -- not_author incremented by exactly 1, matching the single denied attempt; the author's allowed
      -- rewrite produced reason="author" instead, as expected; reason="public" (x2) is the shared
      -- require_story_read_access pass that both calls go through first.

      docker compose -f infra/compose/docker-compose.yml logs core-api --tail 500 | grep 'authz.write_denied'
      -- →
      {"levelname": "WARNING", "name": "app.services.story_access", "message": "authz.write_denied",
       "user_id": "<B's user id>", "story_id": "<A_story_id>", "author_id": "<A's user id>",
       "action": "rewrite", "visibility": "public", "status": "published", ...}

- [ ] 5.3 Close [issue #98](https://github.com/mosaic-stories/mosaic-life/issues/98) via `Fixes #98` in PR1, then `/opsx:archive story-write-authz` after merge to fold the delta into `openspec/specs/story-access/spec.md`.

      -- PR opened 2026-08-11: https://github.com/mosaic-stories/mosaic-life/pull/120
      -- (develop -> main, `Fixes #98` in the description; §0-4 landed as a single PR
      -- rather than the suggested PR1/PR2 split — normal develop-flow promotion, per
      -- this repo's established pattern). Remaining: merge, then `/opsx:archive story-write-authz`.
