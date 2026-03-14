# Node 22.22.1 Upgrade Design

**Date:** 2026-03-13
**Status:** Approved
**Previous:** [Node 20.20.1 Standardization](2026-03-12-node-20-20-1-standardization.md)

## Goal

Upgrade all Node.js references from 20.20.1 to 22.22.1 across local development, Docker, CI, and production environments.

## Motivation

- `rollup-plugin-visualizer@7.0.0` requires Node 22 minimum
- Node 22 is the current LTS line (entered LTS October 2024)
- Aligns the project with long-term support and modern tooling

## Approach: Two-Phase Incremental

Validate locally before pushing to CI and production. This isolates breaking changes early and avoids blocking CI for other work.

## Phase 1: Local & Docker Compose

Update version pins and validate that the web app builds and runs correctly under Node 22.

### Files to Modify

| File | Current | Target |
|------|---------|--------|
| `.nvmrc` | `20.20.1` | `22.22.1` |
| `apps/web/Dockerfile` | `node:20.20.1-alpine` | `node:22.22.1-alpine` |
| `apps/docs/Dockerfile` | `node:20.20.1-bookworm-slim` | `node:22.22.1-bookworm-slim` |
| `infra/compose/docker-compose.yml` | `node:20.20.1-alpine` (web service) | `node:22.22.1-alpine` |
| `apps/web/package.json` | `>=20.20.1 <21` | `>=22.22.1 <23` |
| `apps/docs/package.json` | `>=20.20.1 <21` | `>=22.22.1 <23` |
| `packages/shared-types/package.json` | `>=20.20.1 <21` | `>=22.22.1 <23` |

### Validation Steps

1. `nvm install && nvm use` — confirm Node 22.22.1 is active
2. `cd apps/web && npm install && npm run build && npm run test` — verify build and tests pass
3. `docker compose -f infra/compose/docker-compose.yml up -d` — verify web service starts
4. `docker compose -f infra/compose/docker-compose.yml logs web` — confirm `rollup-plugin-visualizer` warning is gone

## Phase 2: CI & Production

After Phase 1 is validated locally, update CI workflows and documentation.

### GitHub Actions Workflows

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | `NODE_VERSION: '20.20.1'` → `'22.22.1'` |
| `.github/workflows/e2e-tests.yml` | 3x `node-version: '20.20.1'` → `'22.22.1'` |
| `.github/workflows/docs.yml` | `node-version: '20.20.1'` → `'22.22.1'` |
| `.github/workflows/cdk-deploy.yml` | `node-version: '20.20.1'` → `'22.22.1'` |
| `.github/workflows/README.md` | Documentation reference |

### Documentation Updates

All text references to Node 20.20.1 updated to 22.22.1:

- `README.md`
- `docs/developer/LOCAL.md`
- `docs/developer/CODING-STANDARDS.md`
- `docs/architecture/MVP-SIMPLIFIED-ARCHITECTURE.md`
- `docs/developer/COGNITO-SETUP.md`
- `apps/web/tests/README.md`
- `apps/docs/docs/getting-started/installation.md`
- `apps/docs/docs/developer-guide/environment-setup.md`
- `apps/docs/docs/developer-guide/local-setup.md`

### Production Deployment

No additional infrastructure changes needed. The Dockerfiles updated in Phase 1 are what get built and pushed to ECR by the CI pipeline. ArgoCD reconciles automatically after a successful build.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Native addon incompatibility (musl/Alpine changes in Node 22) | Phase 1 Docker Compose test catches this before CI |
| Lockfile drift from major version jump | Run `npm install` fresh under Node 22, commit updated lockfile |
| CDK or Playwright incompatibility with Node 22 | Phase 2 CI run surfaces this; can pin those workflows independently if needed |

## Not In Scope

- Application code changes (this is purely tooling/infrastructure)
- Adding `engines` to `infra/cdk/package.json` (separate concern)
- Node 22 new features adoption (can follow in later PRs)
