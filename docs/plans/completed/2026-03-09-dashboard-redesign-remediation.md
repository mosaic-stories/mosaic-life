# Dashboard Redesign Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix the reviewed dashboard redesign regressions and design gaps without broad refactors.

**Architecture:** Add an explicit legacy role field to the scoped legacies API, then update the dashboard to use that contract for quick actions. Keep the frontend changes local to the dashboard and legacy card components, and add focused regression tests for the new widgets.

**Tech Stack:** FastAPI, Pydantic v2, React, TypeScript, Vitest, React Testing Library

---

### Task 1: Fix scoped legacy role contract

**Files:**
- Modify: `services/core-api/app/schemas/legacy.py`
- Modify: `services/core-api/app/services/legacy.py`
- Test: `services/core-api/tests/test_legacy_scope.py`

**Steps:**
1. Add `current_user_role` to `LegacyResponse` with a safe default.
2. Populate `current_user_role` in `list_user_legacies_scoped()` from the membership join result.
3. Add a route-level regression test proving scoped legacy responses include the authenticated user's role.

### Task 2: Fix dashboard quick actions behavior

**Files:**
- Modify: `apps/web/src/features/legacy/api/legacies.ts`
- Modify: `apps/web/src/components/dashboard/QuickActions.tsx`
- Test: `apps/web/src/components/dashboard/QuickActions.test.tsx`

**Steps:**
1. Extend the legacy client type to include `current_user_role`.
2. Replace role derivation from optional members with `current_user_role`.
3. Replace the modal picker with inline legacy selection using already-fetched legacies.
4. Keep single-legacy actions direct; multi-legacy actions expand inline options.
5. Add tests for direct and multi-legacy quick action flows.

### Task 3: Align dashboard layout and accessibility

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/components/legacy/LegacyCard.tsx`
- Modify: `apps/web/src/components/dashboard/RecentStoriesList.tsx`
- Test: `apps/web/src/pages/DashboardPage.test.tsx`
- Test: `apps/web/src/components/legacy/LegacyCard.test.tsx`
- Test: `apps/web/src/components/dashboard/RecentStoriesList.test.tsx`

**Steps:**
1. Add the missing create-legacy tile to the My Legacies grid.
2. Convert dashboard-only click targets to links or buttons.
3. Add a dashboard-specific flag to suppress the legacy context badge.
4. Add keyboard semantics to the legacy card container.
5. Add regression tests for the new layout and interactions.

### Task 4: Validate the remediation

**Files:**
- No code changes expected.

**Steps:**
1. Run targeted frontend tests for the dashboard widgets.
2. Run the targeted backend legacy scope test.
3. Run `just validate-backend` because backend code changed.
