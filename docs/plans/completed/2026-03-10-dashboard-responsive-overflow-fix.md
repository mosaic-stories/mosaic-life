# Dashboard Responsive Overflow Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent dashboard content from expanding beyond the viewport when legacy cards or sidebar content contain long production data.

**Architecture:** Tighten the dashboard grid so the primary column can shrink within the viewport, then harden legacy-card text and action areas against intrinsic-width overflow. Add regression tests that exercise long card content and verify the dashboard still renders within a constrained layout.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, React Testing Library

---

### Task 1: Add failing responsive regression tests

**Files:**
- Modify: `apps/web/src/components/legacy/LegacyCard.test.tsx`
- Modify: `apps/web/src/pages/DashboardPage.test.tsx`

**Step 1: Write the failing test**

Add a legacy-card test with very long title and biography content that expects the title region to be truncation-safe. Add a dashboard test that renders long legacy content and asserts the main dashboard wrappers include the shrink-safe classes required to prevent horizontal overflow.

**Step 2: Run test to verify it fails**

Run: `cd /apps/mosaic-life/apps/web && pnpm vitest run src/components/legacy/LegacyCard.test.tsx src/pages/DashboardPage.test.tsx`

Expected: FAIL because the current dashboard grid and legacy-card markup do not include the required responsive classes.

**Step 3: Write minimal implementation**

Update the dashboard grid and legacy card markup to include shrink-safe classes.

**Step 4: Run test to verify it passes**

Run: `cd /apps/mosaic-life/apps/web && pnpm vitest run src/components/legacy/LegacyCard.test.tsx src/pages/DashboardPage.test.tsx`

Expected: PASS.

### Task 2: Patch dashboard layout constraints

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

**Step 1: Write the failing test**

Covered in Task 1.

**Step 2: Write minimal implementation**

Change the large-screen grid template to `minmax(0,1fr)` for the left track and add `min-w-0` to both columns so content can shrink instead of forcing page overflow.

**Step 3: Run focused tests**

Run: `cd /apps/mosaic-life/apps/web && pnpm vitest run src/pages/DashboardPage.test.tsx`

Expected: PASS.

### Task 3: Patch shared legacy card sizing

**Files:**
- Modify: `apps/web/src/components/legacy/LegacyCard.tsx`
- Modify: `apps/web/src/features/activity/components/RecentlyViewedSection.tsx`

**Step 1: Write the failing test**

Covered in Task 1.

**Step 2: Write minimal implementation**

Add `min-w-0`, truncation, and non-shrinking trailing controls so long names or badges cannot widen the card beyond its grid track.

**Step 3: Run focused tests**

Run: `cd /apps/mosaic-life/apps/web && pnpm vitest run src/components/legacy/LegacyCard.test.tsx`

Expected: PASS.

### Task 4: Verify broader frontend stability

**Files:**
- No code changes expected

**Step 1: Run validation**

Run: `cd /apps/mosaic-life && just validate-frontend`

Expected: PASS for lint and TypeScript checks.