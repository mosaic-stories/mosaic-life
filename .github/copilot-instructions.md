# GitHub Copilot Instructions — Mosaic Life

Mosaic Life is a memorial stories platform: FastAPI + PostgreSQL + Neptune backend (`services/core-api`), React 18 + TypeScript + Vite frontend (`apps/web`), Helm/ArgoCD GitOps deploys. The audience includes grieving families — UI copy must stay warm and human.

**Canonical guidance (read in this order when anything conflicts):**

1. [`CLAUDE.md`](../CLAUDE.md) — agent behavior, architecture, commands
2. [`AGENTS.md`](../AGENTS.md) — engineering playbook, approval rules
3. [`docs/developer/SPEC-DRIVEN-WORKFLOW.md`](../docs/developer/SPEC-DRIVEN-WORKFLOW.md) — how changes move from idea to production
4. [`docs/developer/CODING-STANDARDS.md`](../docs/developer/CODING-STANDARDS.md) — style, testing, security

## Spec-driven workflow (required for non-trivial changes)

This repo uses [OpenSpec](https://openspec.dev). Use the `/opsx-propose`, `/opsx-apply`, and `/opsx-archive` prompts (in `.github/prompts/`):

- **Propose** a change (proposal + design + tasks + spec deltas) before writing code.
- **Wait for human approval** — every open question answered, an approach selected.
- **Apply** tasks in order; each ends with its validation gate.
- **Archive** after merge to update the living specs in `openspec/specs/`.

Skip the proposal only for: refactors with no behavior change, test additions, doc/CI fixes. `docs/plans/` is legacy — never add documents there.

## Non-negotiable operational rules

- **Docker Compose only** for local dev: `docker compose -f infra/compose/docker-compose.yml ...` — never standalone `docker` commands.
- **uv only** for Python: `uv run pytest`, `uv sync` — never `pip` or bare `python`.
- **No git worktrees** — work on `develop` or a feature branch in the main workspace.
- **GitOps for production** — all changes via commits + CI + ArgoCD; never manual kubectl/helm.
- **Never commit secrets**; sanitize user content; validate inputs (zod / Pydantic).

## Quality gates (before any work is "done")

```bash
just validate-backend    # ruff + format check + mypy — required for services/ changes
just validate-frontend   # ESLint + tsc — required for apps/web changes
just validate-all        # both
```

- Tests for new behavior: `uv run pytest` / `npm run test`; Playwright E2E for user-facing flows. ≥80% coverage on new code.
- **Verify by driving the affected flow** in the running compose stack — passing checks alone is not done.
- PRs: Conventional Commits, < 400 LOC, squash-merge, linked issue + OpenSpec change ID.
