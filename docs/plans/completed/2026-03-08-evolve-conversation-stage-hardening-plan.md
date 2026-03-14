# Evolve Conversation to Story Stage Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the three confirmed pre-staging regressions in the conversation-to-story flow using a durable route-based conversation handoff.

**Architecture:** The frontend will pass the cloned conversation id through the Evolve Workspace URL as a query parameter and reuse that conversation instead of creating a new one. The backend will emit cleaned evolve suggestion events at stream completion and revalidate legacy membership before creating the draft story.

**Tech Stack:** React, React Router, Zustand, FastAPI, SQLAlchemy, pytest, Vitest

---

### Task 1: Wire durable conversation handoff through the route ✅

**Files:**
- Modify: `apps/web/src/features/legacy/components/AISection.tsx`
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`
- Test: relevant frontend test covering evolve navigation/workspace init

**Steps:**
1. Update the evolve navigation to append `conversation_id` from the evolve API response to the Evolve Workspace URL.
2. Parse `conversation_id` from the workspace URL.
3. Initialize the active persona with that conversation id when present.
4. Skip auto-creating a new conversation when the query param is available.
5. Add or update a frontend test that proves the workspace reuses the provided conversation id.

### Task 2: Fix evolve-summary seed behavior for cloned conversations ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/hooks/useConversationSeed.ts`
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`
- Test: relevant frontend test for seed behavior

**Steps:**
1. Keep `seed_mode=evolve_summary` for evolved stories.
2. Remove the client-side short-circuit that blocks seeding just because messages already exist when `seedMode` is `evolve_summary`.
3. Preserve one-time seed behavior per workspace load.
4. Verify the Writer tool highlight still fires after the evolve-summary seed completes.
5. Add or update a test for this flow.

### Task 3: Emit evolve suggestion SSE events correctly ✅

**Files:**
- Modify: `services/core-api/app/routes/ai.py`
- Test: `services/core-api/tests/routes/test_evolve_suggestion_sse.py`
- Test: add or extend streaming route tests if needed

**Steps:**
1. Integrate `parse_evolve_suggestion` into the streamed assistant response finalization path.
2. Strip the marker before persisting the assistant message.
3. Emit `evolve_suggestion` before the final `done` event when a marker is present.
4. Extend tests to verify both cleaned persistence and emitted event behavior.

### Task 4: Recheck legacy membership during evolve ✅

**Files:**
- Modify: `services/core-api/app/services/ai.py`
- Test: `services/core-api/tests/services/test_evolve_conversation.py`
- Test: `services/core-api/tests/routes/test_evolve_route.py`

**Steps:**
1. Add a membership check for the primary linked legacy before story creation.
2. Return `403` when the user no longer has access.
3. Add service and route coverage for the denied case.

### Task 5: Run verification for staging readiness ✅

**Files:**
- No new source files expected

**Steps:**
1. Run targeted backend tests for evolve service, evolve route, integration flow, and SSE suggestion handling.
2. Run `just validate-backend`.
3. Run the relevant frontend tests.
4. Run a frontend build in a supported Node version.
5. Record any remaining staging risks before push.

**Results:**
- 16/16 backend tests passed (evolve service, route, integration, SSE suggestion)
- `just validate-backend` passed (ruff lint, ruff format, mypy)
- 47/47 frontend evolve-workspace tests passed
- Frontend production build succeeded
- No remaining staging risks identified