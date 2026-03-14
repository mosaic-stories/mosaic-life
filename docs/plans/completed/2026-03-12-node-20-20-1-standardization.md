# Node 20.20.1 Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize all local, CI, and Docker-based Node tooling on Node 20.20.1 and make `nvm` the default local workflow.

**Architecture:** Use a single root `.nvmrc` as the developer entry point, pin exact Node versions in GitHub Actions, and update Docker images/install paths to 20.20.1. Add package-level engine constraints and refresh local setup documentation so contributors use `nvm install` and `nvm use` from the repo root.

**Tech Stack:** Node.js 20.20.1, nvm, GitHub Actions, Docker, pnpm, npm

---

### Task 1: Add Repository-Level Node Pin

**Files:**
- Create: `.nvmrc`
- Modify: `README.md`
- Modify: `docs/developer/LOCAL.md`

**Step 1:** Add `.nvmrc` with `20.20.1`.

**Step 2:** Update setup docs to instruct developers to run `nvm install` and `nvm use` from the repo root before frontend or docs work.

**Step 3:** Verify docs consistently refer to Node 20.20.1 rather than generic `20+` or `18+` guidance.

### Task 2: Pin Docker-Based Node Environments

**Files:**
- Modify: `apps/web/Dockerfile`
- Modify: `apps/docs/Dockerfile`
- Modify: `infra/compose/docker-compose.yml`

**Step 1:** Pin the web Docker build image to `node:20.20.1-alpine`.

**Step 2:** Pin the compose `web` service image to `node:20.20.1-alpine`.

**Step 3:** Replace floating Node 20 installation in the docs Dockerfile with an exact 20.20.1 source.

### Task 3: Pin GitHub Actions Node Versions

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/e2e-tests.yml`
- Modify: `.github/workflows/docs.yml`
- Modify: `.github/workflows/cdk-deploy.yml`
- Modify: `.github/workflows/README.md`

**Step 1:** Replace floating Node 20 selectors with `20.20.1`.

**Step 2:** Update workflow documentation to reflect the exact pinned version.

### Task 4: Add Package-Level Engine Guardrails

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/docs/package.json`
- Modify: `packages/shared-types/package.json`

**Step 1:** Add `engines.node` entries requiring Node 20.20.1 or newer within Node 20.

**Step 2:** Keep the constraints compatible with a future major-version upgrade path.

### Task 5: Validate and Sweep for Drift

**Files:**
- Review: repo-wide Node references

**Step 1:** Search for remaining `20.x`, `node:20`, generic `Node.js 20+`, and outdated local setup guidance.

**Step 2:** Run targeted validation commands where the environment permits.

**Step 3:** Summarize any residual follow-up needed for a future Node 22/24 migration.