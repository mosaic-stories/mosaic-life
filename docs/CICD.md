# CI/CD Stack Checklist

Concise deployment guide for Mosaic Life continuous integration and delivery using GitHub Actions and ArgoCD on AWS EKS. Complements `/docs/ops/KUBERNETES.md`, `/docs/ops/OBSERVABILITY.md`, and `/docs/ops/SHARED-SERVICES.md`.

---

## CI Platform — GitHub Actions
- **Repositories:** Use GitHub Issues, Projects, and Pull Requests across the org; enforce linked issues for every PR and Conventional Commit titles.
- **Workflows:**
  - `verify`: lint, type-check, unit/integration tests, build artifacts.
  - `security`: gitleaks, dependency audits, SAST, license checks.
  - `build`: container images + SBOM (syft), scan (trivy/grype), sign via cosign (keyless) with GitHub OIDC.
  - `package`: Helm charts (OCI) signed with cosign; publish to registry using Trusted Publishing when available.
  - `preview`: deploy PR namespace via ArgoCD ApplicationSet; run smoke/Playwright tests.
  - `promote`: update GitOps repo values (image tags, chart versions) on merge; trigger ArgoCD sync.
- **Secrets & Credentials:** No static secrets; use GitHub → AWS IAM OIDC federation with role assumption per workflow. **OIDC provider and IAM roles are managed in the infrastructure repository.** Enable GitHub Trusted Publishing for registries (GHCR/ECR, Helm OCI) and package registries.
- **Caching & Runners:** Use GitHub-hosted runners with per-language caching (pnpm, uv). For heavy builds consider self-hosted runners in isolated subnets.
- **Checks:** Require `verify`, `security`, and signature verification before merge. Block unsigned artifacts and failing quality gates.

## Artifact Management
- **Containers:** Push signed images to ECR (primary) and GHCR (optional mirror). Retain provenance metadata; enforce immutability.
- **Helm Charts:** Package per service under `infra/helm/*`; publish to OCI registry with exact version; include `chart-testing` validation in CI.
- **SBOM & Reports:** Store SBOMs and vulnerability reports as GitHub workflow artifacts and optionally upload to artifact bucket (S3) for retention.

## CD Platform — ArgoCD on EKS
- **Namespace:** Deploy ArgoCD via Helm into dedicated `argocd` namespace.
- **Access:**
  - Keep the ArgoCD UI/API internal by default and access it via `kubectl port-forward` against the `argocd-server` service. Only authorized kubeconfig holders can reach the UI.
  - For production-grade exposure, front with an AWS ALB + ACM certificate (`argocd.<env>.mosaiclife.dev`) once SSO and hardened RBAC are ready.
  - Enforce SSO (OIDC with Cognito/GitHub) and RBAC groups (`ops-admin`, `dev-readonly`).
- **GitOps Structure:**
  - Primary GitOps repo contains environment folders (`envs/prod`, `envs/staging`, previews) referencing Helm charts/values.
  - Use App-of-Apps or ApplicationSet pattern to manage workloads, including preview namespaces `mosaiclife-${branch}`.
  - Enable auto-sync for non-prod; require manual sync/approval for production applications.
- **Cluster Permissions:** Grant ArgoCD ServiceAccount cluster-admin only if necessary; otherwise scope via ClusterRole/Role per namespace. Authenticate via IRSA.

## Delivery Flow
1. Developer opens PR linked to GitHub Issue/Project item.
2. CI workflows (verify/security/build/package) run; artifacts signed and pushed.
3. `preview` workflow updates GitOps repo/values for PR namespace; ArgoCD ApplicationSet deploys to `mosaiclife-${branch}`.
4. On merge to `main`, `promote` workflow bumps image/chart versions in GitOps repo (separate commit/PR if required) and tags release.
5. ArgoCD syncs staging automatically; post-validation, ops triggers production sync via ArgoCD UI/CLI (auditable).

## Observability & Compliance
- **Telemetry:** Emit build/deploy metrics (duration, status, DORA) via GitHub Actions `workflow_run` export → Prometheus (pushgateway or GitHub exporter). Annotate Grafana dashboards with ArgoCD deployment events.
- **Audit:** Keep signed commits/tags; enable branch protections (reviews, required checks). Capture GitHub Actions logs centrally as needed.
- **Policy Enforcement:**
  - Admission controllers validate cosign signatures on deploy.
  - ArgoCD `resource.exclusions` configured to prevent drift on managed namespaces.
  - Use ArgoCD notifications for sync failures, health degradations, manual sync reminders.

## DNS & Certificates
- **Route53:** Manage DNS zones for environments; create ALB host records (`argocd`, `grafana`, etc.).
- **ACM:** Issue certificates per domain; auto-renew; attach via Ingress annotations/Helm values.

## Validation Checklist
- [ ] GitHub Actions workflows defined, versioned, and required for PR merge.
- [ ] **OIDC provider and IAM roles configured in infrastructure repository** (no long-lived AWS credentials in repo or secrets).
- [ ] Images/Helm charts published with cosign signatures and SBOMs.
- [ ] GitOps repo structure documented; ArgoCD applications synced and healthy.
- [ ] ArgoCD UI accessible over TLS via ALB + Route53; SSO enforced.
- [ ] Preview environments create/tear down automatically; smoke tests execute.
- [ ] Production deploy requires manual approval; rollback procedure tested (ArgoCD revert/rollback Helm).
- [ ] CI/CD telemetry captured (build stats, deployment events) and alerts configured for pipeline failures.

---

## Reference Runbooks
- GitHub Actions incident response (failed workflows, credential issues).
- Artifact signing or verification failures (cosign, policy controller).
- ArgoCD sync failure triage (health check, drift, permissions).
- GitOps repo rollback and promotion gating.
- Certificate/DNS rotation for ArgoCD and other CI/CD endpoints.
