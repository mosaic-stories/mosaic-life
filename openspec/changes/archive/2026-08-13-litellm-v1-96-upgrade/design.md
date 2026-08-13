## Context

The LiteLLM proxy is deployed as `infra/helm/litellm/` and synced by ArgoCD into the `aiservices` namespace (shared across staging/prod — there is no per-environment values overlay for this chart). Two config surfaces exist today and already drift from each other:

- **Prod/staging**: `infra/helm/litellm/templates/configmap.yaml`, mounted into the pod and hashed into a `checksum/config` pod annotation so config changes trigger a rolling restart. Models are addressed via `us.`-prefixed cross-region Bedrock inference profiles (e.g. `bedrock/us.anthropic.claude-sonnet-4-6`).
- **Local dev**: `infra/compose/litellm-config.yaml`. Models are addressed via direct, un-prefixed Bedrock model IDs (e.g. `bedrock/anthropic.claude-sonnet-4-6-20250514`), since cross-region inference profiles aren't needed for local dev and the account-direct IDs are simpler to reason about there.

The image tag (`infra/helm/litellm/values.yaml`) is currently the floating `main-stable` tag. `docs/plans/completed/2026-03-07-litellm-implementation-plan.md` records that the team originally intended to pin `main-v1.72.0` but that tag didn't exist in GHCR at deployment time, so they fell back to floating. That precedent is why this design treats "confirm the tag actually exists before merging" as a hard gate rather than an assumption.

The IRSA role backing the LiteLLM pod (`infra/cdk/lib/litellm-shared-stack.ts`, `mosaic-shared-litellm-role`) already grants `bedrock:InvokeModel*` on `arn:aws:bedrock:*::foundation-model/*` and `arn:aws:bedrock:${region}:${account}:inference-profile/*` — wildcarded, so no CDK/IAM change is needed to call new models.

## Goals / Non-Goals

**Goals:**
- Move the LiteLLM proxy from a floating tag to a pinned, reproducible version (`v1.96.0`).
- Add `claude-sonnet-5`, `claude-opus-5`, `glm-5` to both config surfaces using each surface's existing ID convention.
- Keep the two config surfaces from drifting further apart than they already have (mirror every new entry into both files in the same PR).
- Leave a verification gate between the version bump and the model additions so a regression in either is easy to attribute and revert independently.

**Non-Goals:**
- Reconciling the prod/local-dev config surfaces into a single source of truth (e.g. templating one from the other) — real, but a separate refactor from this change.
- Changing budget/team-key enforcement, even though v1.96.0 changes that subsystem's defaults (mosaic doesn't configure per-team budgets, so the behavior change is a no-op here).
- Enabling Bedrock model access in the AWS account — that's a console action outside this repo (see proposal Open Questions).
- Exposing the new models in the frontend picker or as new defaults.

## Decisions

**1. Pin to `tag: "v1.96.0"` (not `main-v1.96.0-stable` or similar).**
BerriAI publishes the monolithic `litellm-database` image at plain version tags (confirmed for v1.88.0, both amd64/arm64 — the only documented GHCR gap is in their newer *componentized* gateway/backend/ui images, which this chart does not use). A plain version tag is what LiteLLM's own deployment docs use for production and is the simplest thing that could exist. Alternative considered: keep `main-stable` and add a separate periodic-bump process — rejected because it's exactly the non-reproducibility this change sets out to fix.

**2. Sequence as two phases in one change, not two separate OpenSpec changes.**
The version bump and the model additions touch overlapping files and are easiest to reason about together, but they carry different risk profiles (the version bump can affect all 10 existing models; the model additions are purely additive). Splitting into two PR-sized phases inside one change/tasks.md gets independent revertibility without the coordination overhead of two proposals. Alternative considered: two separate OpenSpec changes — rejected per user preference, revisit if Phase 1 turns out to need its own extended stabilization period.

**3. Prod uses geo cross-region IDs (`us.anthropic.claude-sonnet-5`, `us.anthropic.claude-opus-5`); local dev uses the bare IDs (`anthropic.claude-sonnet-5`, `anthropic.claude-opus-5`); GLM 5 uses the same bare `zai.glm-5` in both.**
This follows the existing per-file convention for the two Claude models. GLM 5 is an exception forced by the platform: AWS Bedrock's GLM 5 model card lists no geo or global cross-region inference profile for this model (in-region only), and `us-east-1` — the only region this deployment runs in — supports in-region access. So there's no `us.`-prefixed form to use in prod even if we wanted consistency with the Claude entries; `bedrock/zai.glm-5` is the only valid ID today for either environment. If AWS adds a cross-region profile for GLM 5 later, prod should move to it for the same regional-failover benefit the Claude models get, but that's a future follow-up, not blocking this change.

**4. One narrow new capability spec (`ai-model-catalog`), not zero, and not one per model.**
`ai-rate-limiting` and `ai-prompt-safety` apply uniformly regardless of which model alias a request targets or which LiteLLM version serves it, so neither gets a delta. But the repo has never had a spec-level statement of how the model catalog itself behaves (alias-driven, config-only to extend, visible via `/v1/models`) — that's a genuine, testable, API-visible contract, and this change is a natural point to introduce it minimally. The requirement is written generically (extension mechanism), not as a closed enumeration of every current model, so it doesn't imply the archived spec is a complete model list and doesn't need to be revised every time a future change adds or removes a single alias.

## Observability

No new spans/metrics/log fields are introduced by this change. Existing signals to watch during rollout:
- LiteLLM's `prometheus` callback (`litellm_settings.callbacks` in configmap.yaml) — confirm scrape continues post-upgrade and that the new `service_tier` label (added in v1.96.0) doesn't break existing dashboard queries that assume a fixed label set.
- core-api's existing `ai.stream` / `ai.*` OTel spans (from `services/core-api/app/adapters/litellm.py`) will naturally start showing `model=claude-sonnet-5` / `claude-opus-5` / `glm-5` values once those aliases are called — no code change needed for this to work.
- LiteLLM's own request logs / spend logs (`disable_spend_logs: false` in configmap.yaml) will include the new aliases automatically.

## Risks / Trade-offs

- **[Risk] `ghcr.io/berriai/litellm-database:v1.96.0` doesn't exist at merge time** (recurrence of the March 2026 precedent) → **Mitigation**: verify the tag resolves (`docker manifest inspect` or GHCR package page) as an explicit task before editing `values.yaml`, not after.
- **[Risk] A v1.96.0 behavior change breaks one of the 10 existing model aliases or a client integration** (e.g. `drop_params: true` interacting differently with a param LiteLLM now validates) → **Mitigation**: Phase 1 verification gate runs a live completion against an existing alias before Phase 2 starts; ArgoCD/Helm rollback to the previous `main-stable`-resolved image digest is a one-line `values.yaml` revert plus sync.
- **[Risk] Bedrock model access isn't enabled for one or more of the three new models in the account/region** → **Mitigation**: this is called out as an explicit open question/precondition; Phase 2's verification task will surface it immediately as an `AccessDeniedException` from Bedrock, which is unambiguous and doesn't require debugging LiteLLM itself.
- **[Trade-off] Config duplication between prod and local-dev grows by 3 more entries** (10 → 13 duplicated blocks) instead of being addressed structurally → accepted for this change; flagged as a non-goal, candidate for a future templating/single-source-of-truth change if drift keeps causing incidents.

## Migration Plan

1. Verify `ghcr.io/berriai/litellm-database:v1.96.0` exists (both architectures) before touching `values.yaml`.
2. Merge Phase 1 (tag pin) alone; ArgoCD syncs; verify existing models + health + metrics.
3. Merge Phase 2 (three new model entries in both config files) once Phase 1 is confirmed healthy; ArgoCD syncs; verify new models via live completion in staging, then confirm in prod.
4. Rollback strategy: each phase is a single-file (or two-file, for Phase 2) revert in `infra/helm/litellm/` — `git revert` the merge commit and let ArgoCD re-sync. No database migration or stateful component is involved (LiteLLM's Postgres schema is managed by the image's own Prisma migrations, which v1.96.0's release notes don't report as breaking).

## Open Questions

See proposal.md Open Questions — both (GHCR tag existence, Bedrock model access enablement) are preconditions to verify during implementation, not open design decisions.
