# PR 76 Copilot Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all Copilot review findings in PR 76 by aligning async DB URL normalization, correcting entity-sync telemetry, and refactoring Neptune permissions to least privilege with shared CDK wiring.

**Architecture:** Backend fixes stay minimal and behavior-preserving: centralize async DB URL normalization in the database module, reuse it in the backfill script, and make graph sync telemetry count the Story node that is now upserted. Infrastructure changes expand the current Neptune wiring slightly by exporting the shared cluster data-plane ARN from the Neptune stack and consuming that exact ARN in the prod and staging core-api IAM roles, eliminating wildcard Neptune access.

**Tech Stack:** Python, FastAPI, SQLAlchemy asyncpg, pytest, AWS CDK, TypeScript, IAM, Neptune

**Design doc:** In-conversation design approved on 2026-03-14 (Option C)

---

### Task 1: Add failing backend tests for DB URL normalization and telemetry

**Files:**
- Create: `services/core-api/tests/test_database.py`
- Modify: `services/core-api/tests/services/test_ingestion.py` or nearest existing ingestion test file if present

**Step 1: Write a failing DB URL normalization test**

Add a test that passes a psycopg-style Postgres URL with `sslmode=require` and asserts the async URL conversion strips `sslmode` entirely.

**Step 2: Run the targeted DB test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_database.py -q`
Expected: FAIL because the normalization helper does not yet exist or is not shared.

**Step 3: Write a failing telemetry test**

Add or update an ingestion test that verifies `nodes_upserted` includes the Story node after `_sync_entities_to_graph` runs.

**Step 4: Run the targeted ingestion test to verify it fails**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_ingestion.py -q`
Expected: FAIL because the telemetry count still excludes the Story node.

---

### Task 2: Implement the backend fixes

**Files:**
- Modify: `services/core-api/app/database.py`
- Modify: `services/core-api/scripts/backfill_entities.py`
- Modify: `services/core-api/app/services/ingestion.py`

**Step 1: Add a shared async DB URL normalization helper**

Implement a helper in `app/database.py` that:
- converts `postgresql+psycopg://` to `postgresql+asyncpg://`
- converts `postgresql://` to `postgresql+asyncpg://`
- removes `sslmode=require` from the query string
- raises on unsupported formats only where the caller already expects that behavior

**Step 2: Reuse the helper in app engine creation**

Update `get_async_engine()` to call the shared helper instead of reimplementing string replacement inline.

**Step 3: Reuse the helper in the backfill script**

Replace the local URL rewrite logic in `scripts/backfill_entities.py` with the shared helper so the script matches runtime behavior exactly.

**Step 4: Fix telemetry count**

Update `_sync_entities_to_graph()` so `nodes_upserted` includes the Story node.

**Step 5: Run targeted backend tests**

Run: `cd /apps/mosaic-life/services/core-api && uv run pytest tests/test_database.py tests/services/test_ingestion.py -q`
Expected: PASS.

---

### Task 3: Refactor Neptune least-privilege wiring in CDK

**Files:**
- Modify: `infra/cdk/lib/neptune-database-stack.ts`
- Modify: `infra/cdk/lib/mosaic-life-stack.ts`
- Modify: `infra/cdk/lib/staging-resources-stack.ts`
- Modify: `infra/cdk/bin/mosaic-life.ts` if constructor props need to be threaded

**Step 1: Export the shared Neptune data-plane ARN from the Neptune stack**

Expose the exact resource ARN derived from `dbCluster.clusterResourceIdentifier` as a public property and/or CloudFormation export.

**Step 2: Thread the ARN into app stacks**

Pass the shared Neptune resource ARN into the production and staging stacks, either through stack props or a CloudFormation import.

**Step 3: Replace wildcard Neptune resources**

Update the core-api IAM policy statements in both prod and staging stacks to use the exact shared resource ARN instead of `arn:aws:neptune-db:${region}:${account}:*/*`.

**Step 4: Verify TypeScript/CDK compilation**

Run: `cd /apps/mosaic-life/infra/cdk && npm run build`
Expected: PASS.

---

### Task 4: Run full required verification

**Files:**
- No additional file changes expected

**Step 1: Run backend validation**

Run: `cd /apps/mosaic-life/services/core-api && just validate-backend`
Expected: PASS.

**Step 2: Re-run the targeted CDK build**

Run: `cd /apps/mosaic-life/infra/cdk && npm run build`
Expected: PASS.

---

### Task 5: Review and summarize

**Files:**
- No additional file changes expected

**Step 1: Inspect changed files**

Run: `cd /apps/mosaic-life && git diff -- services/core-api infra/cdk`
Expected: Only the intended backend and CDK changes appear.

**Step 2: Summarize outcomes**

Document which Copilot comments were fixed, what tests were run, and any residual deployment considerations.
