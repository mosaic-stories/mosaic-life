# Story Prompts Stability Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the access-control, conversation handoff, and seeded-response gaps in the story prompts feature before release.

**Architecture:** Tighten backend prompt eligibility and action authorization around current legacy membership, prevent duplicate active prompts at the data layer, and make the Discuss navigation preserve its routed conversation and request the first assistant response automatically. Keep changes minimal and aligned with the existing AI chat and evolve workspace patterns.

**Tech Stack:** Python, FastAPI, SQLAlchemy, Alembic, React, TypeScript, Vitest, TanStack Query

---

### Task 1: Backend regression tests

**Files:**
- Modify: `services/core-api/tests/integration/test_story_prompts_flow.py`

**Steps:**
1. Add a failing test that removes a user's legacy membership after a prompt is created and verifies `POST /api/prompts/{id}/act` returns `403`.
2. Add a failing test that removes the user's only legacy membership and verifies `GET /api/prompts/current` returns `204` rather than surfacing an inaccessible prompt.
3. Run the focused integration test file and confirm the new cases fail for the expected reasons.

### Task 2: Backend access and integrity fixes

**Files:**
- Modify: `services/core-api/app/services/story_prompts.py`
- Modify: `services/core-api/alembic/versions/19807f99ca01_add_story_prompts_table.py`

**Steps:**
1. Filter prompt legacy selection to current non-pending memberships only.
2. Reject prompt actions for inaccessible legacies using the existing AI legacy access check.
3. Treat an active prompt pointing at an inaccessible legacy as unusable and rotate or suppress it.
4. Add a partial uniqueness constraint for one active prompt per user and make prompt creation resilient to duplicate-actives during concurrent requests.
5. Re-run the focused backend tests.

### Task 3: Frontend regression tests

**Files:**
- Create: `apps/web/src/features/legacy/components/AISection.test.tsx`

**Steps:**
1. Add a failing test that renders `AISection` with an initial conversation id and verifies the routed conversation remains selected after mount.
2. Add a failing test that renders `AISection` with a story-prompt seed mode and verifies the initial assistant seed request is triggered exactly once.
3. Run the focused Vitest file and confirm both fail before implementation.

### Task 4: Frontend handoff and seed fixes

**Files:**
- Modify: `apps/web/src/features/legacy/components/AISection.tsx`
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx`
- Create: `apps/web/src/features/ai-chat/api/seedPrompt.ts`

**Steps:**
1. Preserve the routed conversation id on first mount and only clear it when the user actually changes persona.
2. Pass an explicit prompt-seed mode from the dashboard navigation through the legacy profile into the AI section.
3. Add a small client helper that requests the first assistant response for a prompt-seeded conversation.
4. Trigger that helper only for prompt-seeded conversations that already contain the initial user prompt.
5. Re-run the focused frontend tests.

### Task 5: Verification

**Steps:**
1. Run `cd /apps/mosaic-life && just validate-backend`.
2. Run `cd /apps/mosaic-life/services/core-api && uv run pytest tests/integration/test_story_prompts_flow.py -q`.
3. Run `cd /apps/mosaic-life/apps/web && npm run test -- AISection.test.tsx EvolveWorkspace.test.tsx`.
4. Run `cd /apps/mosaic-life/apps/web && npm run build`.