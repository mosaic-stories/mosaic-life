# AGENT: Engineering Assistant Playbook

This repository uses an AI coding assistant to accelerate delivery while preserving quality and security. This document defines **how the assistant should work**, where to find the **authoritative architecture docs**, and the **approval workflow** for complex tasks.

> **Authoritative docs (store under `/docs`—see paths below):**
>
> * `/docs/architecture/CORE-BACKEND-ARCHITECTURE.md`
> * `/docs/architecture/FRONTEND-ARCHITECTURE.md`
> * `/docs/architecture/PLUGIN-ARCHITECTURE.md`
> * `/docs/ops/SHARED-SERVICES.md`
> * `/docs/standards/CODING-STANDARDS.md`

---

## 1) Operating Principles

1. **Plan first.** For any non-trivial task, propose **1–3 approaches** with pros/cons, risks, and the exact files to touch. Wait for human approval before coding.
2. **Follow the docs.** Implementations must conform to the documents listed above. If conflicts arise, use the precedence order in §2.
3. **Security and privacy first.** Never introduce insecure patterns (no plaintext secrets, unsafe HTML, eval, etc.).
4. **Keep changes small and testable.** Prefer incremental PRs with clear tests and telemetry.
5. **Make it observable.** Add OTel spans/metrics/logs for meaningful actions.

---

## 2) Source of Truth & Precedence

When guidance conflicts, apply this precedence (highest first):

1. **AGENT.md** (this file)
2. **CODING-STANDARDS.md**
3. **FRONTEND-ARCHITECTURE.md**
4. **CORE-BACKEND-ARCHITECTURE.md**
5. **PLUGIN-ARCHITECTURE.md**
6. **SHARED-SERVICES.md**

If a document is missing or outdated, prefer newer decisions captured here and open an issue to reconcile.

---

## 3) Repository Documentation Layout (required)

Store the markdown files under:

```
/docs/
  architecture/
    CORE-BACKEND-ARCHITECTURE.md
    FRONTEND-ARCHITECTURE.md
    PLUGIN-ARCHITECTURE.md
  ops/
    SHARED-SERVICES.md
  standards/
    CODING-STANDARDS.md
  AGENT.md  # this file (also at repo root if desired)
```

Keep these files versioned in PRs; link them in issues/PR descriptions.

---

## 4) Planning Template (use before coding)

For any **complex task** (new API, schema change, feature slice, infra change), respond with the following plan in the PR or issue comment **before** generating code:

**Title:** <short description>

**Goal & Success Criteria**

* What user impact or system behavior will change?

**Constraints & Inputs**

* Dependencies (APIs, schemas, tokens), performance budgets, security rules.

**Approach Options (1–3)**

1. **Option A:** <summary>

   * *Pros:* <list>
   * *Cons/Risks:* <list>
   * *Touched files:* <paths>
2. **Option B:** …
3. **Option C:** …

**Telemetry & Tests**

* OTel spans/metrics, log fields.
* Unit + integration + E2E notes.

**Migration/Backout**

* Data migrations, feature flags, rollback steps.

**Request for Approval:** *Select Option A/B/C*.

> Do not start implementing until a human selects the option.

---

## 5) Implementation Rules (must follow)

* **Languages & frameworks** per CODING-STANDARDS (§4):

  * Frontend: React + TS + **Vite**, **React Router**, **TanStack Query**, **Zustand**, **TipTap** editor; **SSE** for streaming.
  * Backend: **FastAPI**, Pydantic v2, Postgres (SQLAlchemy/Alembic), **Neo4j** (self‑hosted), **OpenSearch** (not Elasticsearch), **SNS/SQS**, **LiteLLM** proxy.
* **Auth:** OIDC via AWS Cognito with BFF-managed httpOnly cookies (see FRONTEND-ARCHITECTURE §3 and CORE-BACKEND-ARCHITECTURE §3).
* **Plugins:** UI via **Module Federation** (Pattern A); backend plugins deploy via **Helm-only** (Pattern 1). Follow PLUGIN-ARCHITECTURE.
* **Search:** Use **OpenSearch**; treat any reference to Elasticsearch as an alternative—prefer OpenSearch APIs and features (k‑NN vectors).
* **Tenancy:** Single-tenant by default. Do not add tenant selectors in UI. Keep APIs forward-compatible with a future `tenant_id` parameter.

---

## 6) Security & Compliance (always)

* Never commit secrets. Use AWS Secrets Manager + External Secrets (see SHARED-SERVICES §2).
* Sanitize all user-rendered content (Markdown/HTML) using the shared sanitizer.
* Enforce CSP and only allow declared plugin origins.
* Validate inputs with zod (frontend) and Pydantic (backend). Use least-privileged IAM roles via IRSA.

---

## 7) Observability & Quality Gates

* Emit OTel spans named using the conventions in CODING-STANDARDS §17.
* Add Prometheus metrics with standard labels.
* Log JSON only; include request IDs and versions.
* Tests required per CODING-STANDARDS §5, with Playwright flows for user-facing features.

---

## 8) CI/CD Expectations

* Generate SBOM (syft) and sign images/charts (cosign) in GitHub Actions.
* Use Helm (OCI) charts; ArgoCD deploys from a GitOps repo. No direct kubectl to prod.
* Include chart updates and values changes in PRs.

---

## 9) AI Assistant Prompt Patterns (copy/paste)

Use these when requesting code generation from the assistant:

**Component:**

```
Goal: Accessible <Component> with design tokens and tests.
Inputs: design tokens, props, states, loading rules.
Acceptance: a11y (keyboard + labels), RTL tests, Storybook stories, bundle size check.
Files: apps/web/src/components/<Component>.tsx (+ .test.tsx, .stories.tsx)
```

**Feature slice (AI chat):**

```
Goal: SSE-based chat with streaming tokens and abort.
Inputs: endpoint path, auth via cookies, OTel span names.
Acceptance: renders tokens incrementally, abort on route change, retries with backoff, Playwright E2E.
Files: apps/web/src/features/ai-chat/*
```

**Service endpoint (FastAPI):**

```
Goal: Add POST /v1/stories to Stories Service.
Inputs: Pydantic schema, authZ call, outbox event, OpenAPI update.
Acceptance: pytest unit + integration, Schemathesis contract test, OTel spans, Prom metrics.
Files: services/stories/*, packages/shared-types/*
```

**Search indexing:**

```
Goal: Index Story updates in OpenSearch (hybrid + vector-ready).
Inputs: index mapping, outbox event payload, LiteLLM embedding call.
Acceptance: idempotent indexing, alias switch pattern, integration test with Localstack/OpenSearch.
Files: services/search-indexer/*
```

---

## 10) Issue Tracking & Project Flow

* **Source of truth:** GitHub Projects + GitHub Issues (SHARED-SERVICES §10 Option B).
* Link every PR to an Issue. Use Conventional Commits in titles.
* Use the PR template from CODING-STANDARDS §16.

---

## 11) Known Consistency Decisions (Latest)

* **OpenSearch preferred** over Elasticsearch everywhere. If a doc mentions Elasticsearch, treat it as an alternative only.
* **Neo4j (self-hosted)** is the primary graph DB; Neptune remains an optional future alternative.
* **Single-tenant** product. Multi-tenancy may be added later; design APIs to accept a tenant\_id without exposing it in UI now.
* **Vite + React Router** for the web app shell. Next.js may be used only for a separate marketing site later.
* **SSE-first** streaming for AI chat; WebSockets are optional later.

If you find another inconsistency, **open an issue** and propose a short patch to the relevant doc.

---

## 12) When to Ask for Approval vs. When to Proceed

* **Ask for approval first** (plan with options) when:

  * Changing schemas or contracts, adding endpoints, modifying auth/session flows.
  * Adding new dependencies or altering build/deploy tooling.
  * Touching cross-cutting concerns (observability, security, plugin contracts).
* **Proceed without approval** when:

  * Internal refactors with no external behavior change.
  * Test additions or fixes.
  * Documentation or CI workflow fixes that do not affect deploy behavior.

---

## 13) Output Format for Plans & Changes

* Prefer **diffs** or **file lists** with proposed insertions/deletions.
* Include snippets for Helm values, Kubernetes manifests, and code when helpful.
* Always conclude with **“Request for Approval: Option A/B/C.”**

---

## 14) Contacts

* **Owners:** @hewjoe and @drunkie-tech
* **Where to ask:** Open a GitHub Discussion or Issue tagged `question`.
* **GitHub Project:** https://github.com/orgs/mosaic-stories/projects/1
* **Primary GitHub Repo:** https://github.com/mosaic-stories/mosaic-life
