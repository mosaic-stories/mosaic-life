## 1. Preconditions (verify before editing anything)

- [x] 1.1 Confirm `ghcr.io/berriai/litellm-database:v1.96.0` exists for both `linux/amd64` and `linux/arm64` (e.g. `docker manifest inspect ghcr.io/berriai/litellm-database:v1.96.0` or the GHCR package page). **Done 2026-08-13**: verified via the GHCR registry API — manifest index present with `linux/amd64` and `linux/arm64` entries plus attestations.
- [x] 1.2 Confirm (via AWS Bedrock console, `us-east-1`) that model access is enabled for `anthropic.claude-sonnet-5`, `anthropic.claude-opus-5`, and `zai.glm-5`. **Done 2026-08-13**: confirmed by user — all three enabled in `us-east-1`.

## 2. Phase 1 — Pin the LiteLLM proxy version

- [x] 2.1 In `infra/helm/litellm/values.yaml`, change the image tag from `"main-stable"` to `"v1.96.0"`.
- [x] 2.2 Review the full v1.96.0 (and intermediate, if the changelog spans them) release notes one more time against `infra/helm/litellm/templates/configmap.yaml`'s `general_settings`/`litellm_settings` for any newly-required or renamed config keys; adjust the ConfigMap only if something is actually required (do not speculatively add new v1.96.0 settings like `service_tier` labels or `exclude_metrics` unless there's a concrete reason to). **Done 2026-08-13**: reviewed v1.96.0 release notes — only breaking config change is a new `general_settings.dangerously_allow_mock_testing_request_params` flag required for `mock_*` request params, which this deployment doesn't use. No other renamed/required `general_settings`/`litellm_settings` keys found; no ConfigMap changes made.
- [x] 2.3 Commit and open a PR scoped to Phase 1 only (per design.md's independent-revertibility decision).

## 3. Phase 1 — Deploy and verify

- [x] 3.1 After merge, confirm ArgoCD synced `infra/helm/litellm` and the pod is running the new image tag (`kubectl -n aiservices get pods -o jsonpath` or ArgoCD UI — inspection only, per CLAUDE.md's GitOps rules). **Done 2026-08-13**: `kubectl -n aiservices get pods` shows `litellm-895fd4fb8-s4bgv` running `ghcr.io/berriai/litellm-database:v1.96.0`.
- [x] 3.2 Hit `/health/liveliness` and `/health/readiness` on the deployed proxy and confirm 200s. **Done 2026-08-13**: both endpoints returned 200 via port-forward (`{"status":"healthy","db":"connected"}` on readiness).
- [x] 3.3 Call `/v1/models` and confirm all 10 pre-existing aliases are still listed. **Done 2026-08-13**: confirmed by user (requires master-key auth not independently pulled from the cluster secret).
- [x] 3.4 Run one live completion through core-api's LiteLLM adapter against an existing alias (e.g. `claude-sonnet-4-6`) and confirm a successful response end-to-end. **Done 2026-08-13**: confirmed by user.
- [x] 3.5 Confirm Prometheus is still scraping `/metrics` on the proxy and that existing dashboard queries aren't broken by the new `service_tier` label. **Done 2026-08-13**: confirmed by user.
- [x] 3.6 If any of 3.2–3.5 fail, revert the Phase 1 PR (single-file `values.yaml` revert) before proceeding to Phase 2. N/A — no failures; Phase 1 verified healthy.

## 4. Phase 2 — Add the new Bedrock model catalog entries

- [x] 4.1 In `infra/helm/litellm/templates/configmap.yaml`, add `claude-sonnet-5` (`bedrock/us.anthropic.claude-sonnet-5`), `claude-opus-5` (`bedrock/us.anthropic.claude-opus-5`), and `glm-5` (`bedrock/zai.glm-5`) to `model_list`, grouped/commented consistently with the existing entries.
- [x] 4.2 In `infra/compose/litellm-config.yaml`, add the same three aliases using local-dev's direct-ID convention: `claude-sonnet-5` → `bedrock/anthropic.claude-sonnet-5`, `claude-opus-5` → `bedrock/anthropic.claude-opus-5`, `glm-5` → `bedrock/zai.glm-5` (identical to prod for this one, since GLM 5 has no cross-region inference profile).
- [x] 4.3 Update `docs/ai-models.md` model tables to include the three new aliases and their IDs per environment.
- [x] 4.4 Commit and open a PR scoped to Phase 2 only. **Done 2026-08-13**: [PR #130](https://github.com/mosaic-stories/mosaic-life/pull/130), committed directly to `develop` and opened against `main`.

## 5. Phase 2 — Local and staging verification

- [x] 5.1 Locally: `docker compose -f infra/compose/docker-compose.yml up -d litellm` (or full stack), then `curl http://localhost:14000/v1/models` and confirm the three new aliases are listed. **N/A 2026-08-13**: the `litellm` service in `infra/compose/docker-compose.yml` has been commented out/disabled since 2026-07-07 (commit `19b93c5`, when local personas switched to a local Qwen/MLX model) — there's no running local LiteLLM to verify against. `infra/compose/litellm-config.yaml` was still updated per 4.2 so it stays correct for whenever local LiteLLM is re-enabled. Skipped per user decision; relying on staging verification (5.3/5.4) instead.
- [x] 5.2 Locally: run one completion against each of `claude-sonnet-5`, `claude-opus-5`, and `glm-5` through the local LiteLLM proxy and confirm successful responses (or a clear, expected `AccessDeniedException` if 1.2's Bedrock access precondition hasn't landed yet in this AWS account — distinguish that from a config bug). **N/A 2026-08-13**: same as 5.1 — no running local LiteLLM proxy to test against. Skipped per user decision.
- [x] 5.3 After merge/ArgoCD sync to staging: repeat 5.1/5.2 against the staging LiteLLM endpoint. **Done 2026-08-13**: confirmed by user — PR #130 merged, ArgoCD synced, all 3 new models tested successfully in the LiteLLM UI.
- [x] 5.4 Confirm the three new aliases appear in staging's `/v1/models` and that existing aliases are unaffected. **Done 2026-08-13**: confirmed by user — new models visible in the LiteLLM UI post-sync; no reported issues with existing aliases.

## 6. Wrap-up

- [x] 6.1 Confirm `docs/ai-models.md` accurately reflects the final state of both config files (prod and local dev) after Phases 1 and 2 land. **Done 2026-08-13**: re-diffed `docs/ai-models.md`'s new-aliases table against `configmap.yaml` and `litellm-config.yaml` — model IDs match exactly in both environments.
- [x] 6.2 Note in the PR description(s) that production ArgoCD sync/rollout to `mosaiclife.me`'s backing services is a separate, human-triggered GitOps step per CLAUDE.md, not performed as part of this task list. **Done 2026-08-13**: both [PR #129](https://github.com/mosaic-stories/mosaic-life/pull/129) and [PR #130](https://github.com/mosaic-stories/mosaic-life/pull/130) include a "Post-merge (human-triggered GitOps step, not part of this PR)" section.
