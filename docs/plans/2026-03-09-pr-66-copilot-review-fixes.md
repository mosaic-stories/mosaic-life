# PR 66 Copilot Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the real defects identified in Copilot's PR 66 review without expanding scope beyond the approved Option A bugfix set.

**Architecture:** Keep the fixes localized at the current boundaries. Persist prompt status mutations in the prompt routes before 204 responses, make prompt-seed streaming explicitly report no-op responses so the UI can clear optimistic state, synchronize legacy tab state with the URL query param while the page stays mounted, and normalize story prompt 204 responses to `null` in the feature API wrapper.

**Tech Stack:** Python, FastAPI, SQLAlchemy, React, TypeScript, Vitest, pytest

---

### Task 1: Backend regression tests for 204 commit paths

**Files:**
- Modify: `services/core-api/tests/integration/test_story_prompts_flow.py`

**Step 1: Write the failing tests**

Add focused tests that:
- Create a prompt, revoke the only legacy membership, call `GET /api/prompts/current`, then verify a follow-up database query sees the original prompt marked `rotated`.
- Create a prompt, call `POST /api/prompts/{id}/shuffle`, force prompt generation to produce no replacement, and verify the original prompt remains rotated after the endpoint returns `204`.

**Step 2: Run the focused tests and verify they fail**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/integration/test_story_prompts_flow.py -q`

Expected: failures showing prompt status changes are not persisted on the 204 return paths.

**Step 3: Implement the minimal route fix**

Update `services/core-api/app/routes/prompts.py` so both `get_current_prompt` and `shuffle_prompt` commit before returning `204` when the service may already have mutated prompt state.

**Step 4: Re-run the focused tests and verify they pass**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/integration/test_story_prompts_flow.py -q`

Expected: the new regression tests pass.

### Task 2: Frontend regression tests for prompt seed no-op handling

**Files:**
- Modify: `apps/web/src/features/legacy/components/AISection.test.tsx`

**Step 1: Write the failing test**

Add a test that renders `AISection` in `story_prompt` seed mode, captures the seed callbacks passed to `streamPromptSeed`, simulates a 204/no-op completion path, and verifies streaming state is cleared.

**Step 2: Run the focused test and verify it fails**

Run: `cd /apps/mosaic-life/apps/web && npm run test -- AISection.test.tsx`

Expected: failure showing the no-op path leaves the component/store in streaming state.

**Step 3: Implement the minimal stream fix**

Update `apps/web/src/features/ai-chat/api/seedPrompt.ts` to expose an explicit no-op callback or status, then update `apps/web/src/features/legacy/components/AISection.tsx` to clear optimistic streaming state on that path.

**Step 4: Re-run the focused test and verify it passes**

Run: `cd /apps/mosaic-life/apps/web && npm run test -- AISection.test.tsx`

Expected: the no-op regression test passes.

### Task 3: Frontend regression tests for tab sync and prompt 204 normalization

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx`
- Modify: `apps/web/src/features/story-prompts/api/storyPrompts.ts`
- Add or Modify: frontend test files near these modules as needed

**Step 1: Write the failing tests**

Add focused tests that:
- Verify `LegacyProfile` updates the active section when the `tab` query param changes while the component remains mounted.
- Verify story prompt API helpers return `null` rather than leaking `undefined` on a 204 response.

**Step 2: Run the focused tests and verify they fail**

Run only the affected Vitest files.

Expected: failures showing tab/URL divergence and `undefined` leaking through the prompt API wrapper.

**Step 3: Implement the minimal fixes**

Update `LegacyProfile.tsx` to synchronize `activeSection` from `tabParam` in an effect. Update `storyPrompts.ts` to normalize `undefined` results from `apiGet` and `apiPost` to `null`.

**Step 4: Re-run the focused tests and verify they pass**

Run only the affected Vitest files.

Expected: the new tab sync and 204 normalization tests pass.

### Task 4: Full verification

**Step 1: Run backend validation**

Run: `cd /apps/mosaic-life && just validate-backend`

**Step 2: Run focused frontend tests**

Run: `cd /apps/mosaic-life/apps/web && npm run test -- AISection.test.tsx`

Run any additional focused Vitest files added for this work.

**Step 3: Run frontend validation if the touched area supports it cleanly**

Run: `cd /apps/mosaic-life && just validate-frontend`

If unrelated pre-existing failures block this, record them precisely instead of claiming success.