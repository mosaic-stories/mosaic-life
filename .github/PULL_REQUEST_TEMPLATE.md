<!--
Title: Conventional Commit format — `type(scope): imperative summary`.
We squash-merge, so the title becomes the commit subject on main.
Size: target < 400 LOC of reviewable change; split the PR if larger.
-->

## Summary

<!-- 2-4 sentences, outcome first: what changed, why, and the user-visible or
operational effect. This survives squash-merge as the permanent commit body —
write it for someone reading `git log` next year, not for this week's reviewer. -->

**Refs:** Closes #___ · OpenSpec: `openspec/changes/<change-id>`
<!-- No OpenSpec change? Say why: "trivial — refactor / tests / docs / CI". -->

## What & why

<!-- Decision-level bullets: the approach you took (and what you rejected, if a
reviewer might wonder), constraints, and anything in the diff that would
surprise someone — renames, moved code, behavior changes hiding in "cleanup".
Do NOT recap the diff file-by-file; the Files tab already does that. -->

## Verification

<!-- Evidence, not assertions (SPEC-DRIVEN-WORKFLOW §4). "Tests pass" is a
claim; "created a story via the UI, saw the outbox row and the SSE event" is
evidence. State what you exercised and what you observed. -->

- [ ] `just validate-backend` / `just validate-frontend` (as applicable)
- [ ] Tests added or updated for new behavior
- [ ] Drove the affected flow in the running compose stack — observed:
- [ ] Security: no secrets committed; inputs validated; user content sanitized (or n/a)
- [ ] Observability: OTel spans / structured logs for significant new operations (or n/a)

## Migration & rollback

<!-- Delete this section if nothing applies. Cover: Alembic migrations
(upgrade + downgrade verified on a fresh DB), env/config or Helm changes,
required operator actions, feature flags, and how to roll back. -->

## Reviewer notes

<!-- The insight section — where to start reading, the riskiest part of the
change, what you're least confident about, known gaps and planned follow-ups.
An empty section here reads as "I didn't think about risk". -->
