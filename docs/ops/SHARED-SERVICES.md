# Shared Services Requirements

**Platform:** Kubernetes (EKS or equivalent) on AWS.
**Networking:** AWS ALB → Ingress Controller (NGINX/Gateway API) with AWS WAF in front.
**Auth:** AWS Cognito (OIDC).
**CI/CD:** GitHub Actions → ArgoCD (GitOps).
**Observability:** Prometheus + Thanos, Grafana OSS, Grafana Loki, Jaeger (OTel).
**Messaging:** SNS/SQS.
**Search:** OpenSearch/Elasticsearch (vector‑ready).
**AI Registry:** LiteLLM (central proxy/quota/spend).
**Team:** 2 devs (expandable).
**Tracker:** Prefer Notion + GitHub; keep option for GitHub Projects or Linear.

---

## 1) Identity & Access (People and Machines)

### 1.1 Human access

* **SSO:** Google Workspace and/or GitHub SSO to AWS (AWS IAM Identity Center) for console + EKS access.
* **Kubernetes RBAC:** map IAM roles to cluster roles; least privilege per role (`dev`, `ops/admin`).
* **Audit:** enable CloudTrail; forward to S3 with lifecycle; schedule Athena tables for queries.

### 1.2 Workload identity

* **GitHub → AWS OIDC:** short‑lived federated roles for CI (no long‑lived keys).
* **Service accounts for pods (IRSA):** per‑service IAM roles; scope to exact AWS APIs (S3, SQS, SNS, Secrets Manager, etc.).

**Acceptance:** No static AWS keys in repos or images; all access is role‑based and auditable.

---

## 2) Secrets & Configuration

* **Secrets Manager/Parameter Store** as the source of truth (prod/stage/dev).
* **External Secrets Operator** to sync into Kubernetes Secrets.
* **Key management:** AWS KMS CMKs; rotation policies.
* **Config:** ConfigMaps + Helm values; separate overlays per env.
* **Local dev:** `.env` via `direnv`; never commit secrets.

**Acceptance:** Secrets never in Git; rotations do not require app rebuilds.

---

## 3) Container & Artifact Management

* **Container registry:** ECR (primary) or GHCR (secondary).
* **Charts/Manifests:** Helm charts pushed as **OCI artifacts** (ECR or GHCR).
* **Provenance:** cosign keyless signing (GitHub OIDC) for images and charts; store SBOMs (syft) and run vulnerability scans (grype/Trivy).
* **Policy:** Kyverno/Gatekeeper admission checks to verify signatures and block critical CVEs.

**Acceptance:** Only signed images/charts deploy; SBOM and scan reports kept for each release.

---

## 4) CI/CD (GitHub Actions → ArgoCD)

* **Pipelines:**

  1. **Verify:** lint, test, type‑check, build, unit/e2e
  2. **Build:** container image, SBOM, scan, **sign** → push to registry
  3. **Package:** Helm chart (OCI) with version pin → **sign** → push
  4. **Integrate:** spin up **kind** or preview namespace; smoke tests
  5. **Promote:** update GitOps repo (values/images) → ArgoCD sync to `staging`
  6. **Release:** manual approval → sync to `prod` (optional Argo Rollouts canary)
* **ArgoCD:** App‑of‑Apps or ApplicationSets per env; SSO enabled; RBAC for admin vs read‑only.
* **Notifications:** ArgoCD → Google Chat/Email for sync status, health, and rollbacks.

**Acceptance:** Every deploy is reproducible from Git; prod changes require PR + approval.

---

## 5) Observability (Metrics, Logs, Traces, Dashboards)

### 5.1 Metrics

* **Prometheus Operator** with ServiceMonitors/PodMonitors; scrape app + system metrics.
* **Thanos** for long‑term storage and cross‑env querying.
* **SLOs:** define per service; error budget dashboards.

### 5.2 Logs

* **Loki** with Promtail/Fluent Bit; JSON logs only.
* **Retention:** hot (7–14 days) then archive (S3).

### 5.3 Traces

* **OpenTelemetry Collector** sidecar/daemonset → **Jaeger** as backend.
* Propagate W3C `traceparent` across BFF ↔ services ↔ plugins ↔ SQS/SNS (attributes carry correlation).

### 5.4 Dashboards & Alerts

* **Grafana OSS**: version‑controlled dashboards (JSON in Git).
* **Alerting:** Prometheus/Alertmanager or Grafana Alerting → Google Chat/Email.
* **Runbooks:** Link every alert to a Notion page.

**Acceptance:** A single broken dependency surfaces within 5 minutes with clear, actionable alerts and a runbook link.

---

## 6) Networking, Ingress, and Security Edge

* **ALB Ingress Controller** with AWS **WAF** in front (managed rules + allowlist for plugin origins).
* **TLS:** ACM certificates; TLS 1.2+; HSTS.
* **SSE support:** increase ALB idle timeout; at Ingress set:
  `nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"`
  `nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"`
  `nginx.ingress.kubernetes.io/proxy-buffering: "off"`
* **NetworkPolicy:** default‑deny egress; allow core paths (DBs, S3, Cognito, LiteLLM, OpenSearch, SNS/SQS).
* **mTLS (optional):** Service mesh if needed later; start with TLS to edge + JWT between services.

**Acceptance:** Edge blocked by WAF, least‑privileged egress, and SSE works under load without broken streams.

---

## 7) Data Services & Reliability

* **Relational DB:** Postgres (RDS). **Backups:** automated snapshots; point‑in‑time recovery.
* **Graph DB:** Neo4j (self‑hosted) or Neptune. Scheduled backups/export.
* **Search:** OpenSearch/Elasticsearch managed or self‑hosted; k‑NN enabled for vectors.
* **Object store:** S3 buckets for media + artifacts; lifecycle policies (hot → warm → archive); **WAF logs** and **ALB logs** to S3.

**Acceptance:** Documented RPO/RTO per service; restore drills at least twice/year.

---

## 8) Messaging, Jobs & Autoscaling

* **SNS/SQS** for domain events and work queues.
* **KEDA** for event‑driven scaling from SQS queue depth.
* **DLQs** and retry with backoff; redrive policies.

**Acceptance:** Spiky workloads scale automatically; no message lost; DLQs monitored.

---

## 9) Security, Compliance & Supply Chain

* **Image scanning:** Trivy/Grype in CI; block critical CVEs unless exceptions are recorded.
* **Secret scanning:** Gitleaks pre‑commit + CI.
* **Dependency updates:** Dependabot (npm/pip).
* **WAF logging:** to S3 with Athena queries + alerts on anomalies.
* **IAM hygiene:** monthly review of roles/policies.
* **Backups encryption:** KMS; cross‑region copies for critical data.

**Acceptance:** SBOMs for all images; signed artifacts; zero plaintext secrets; periodic audits logged.

---

## 10) Issue Tracking & Project Management

### Option A — **Notion‑centric** (preferred to use existing)

* **Databases:**

  * **Roadmap** (Quarter, Goal, Status, Milestone links)
  * **Milestones** (Target date, Owner, Status)
  * **Backlog/Issues** (Title, Type, Component, Priority, Estimate, Status, Assignee, Links: PR/Commit/Dashboard/Runbook)
  * **Runbooks** (Service, Alert, Steps, Dashboards, Ownership)
* **Statuses:** Idea → Ready → In Progress → In Review → Blocked → Done.
* **Views:** Kanban by Status; Timeline by Milestone; Table by Component.
* **Automation:** GitHub Action posts PR links/status to Notion via Notion API (optional), or manual link property.

### Option B — **GitHub‑centric** (tighter code integration)

* **GitHub Projects** for roadmap/board; **GitHub Issues** as the source of truth.
* **Notion** hosts Product Specs/Runbooks; bi‑directional links.

**Acceptance:** Every deployable change traces to an issue; MVP scope lives in one board with milestones and owners.

---

## 11) Documentation & Knowledge Base

* **Developer handbook** (Notion): architecture docs, onboarding, coding standards, PR checklist, release process.
* **Runbooks** per alert/service with Grafana/Loki/Jaeger links.
* **Changelogs** automated from Conventional Commits (release‑please) and published to Notion + GitHub Releases.

**Acceptance:** A new contributor can set up local dev and ship a small change within one day using the docs alone.

---

## 12) Backups, DR & Business Continuity

* **Velero** for Kubernetes resources (include CSI snapshots for PVCs where needed).
* **DB backups:** RDS automated + logical dumps; Neo4j/Neptune scheduled dumps.
* **Search:** snapshot repositories to S3.
* **Media:** S3 cross‑region replication for critical buckets.

**Acceptance:** Quarterly restore test of each tier (DB, graph, search, media, cluster manifests).

---

## 13) Cost & Tagging

* **AWS Budgets** with alerts; **Cost Explorer** dashboards.
* **Tagging standard:** `Project=LegacyPlatform`, `Env=dev|staging|prod`, `Owner`, `Component`.
* **Grafana cost panels** (optional via CloudWatch/Cost Explorer exporters).

**Acceptance:** Monthly cost report by component with at least 90% attribution coverage.

---

## 14) Developer Experience

* **Local dev:** Docker Compose stack (BFF, services, Localstack SNS/SQS, MinIO, Neo4j, OpenSearch, Jaeger, Prometheus, Grafana, Loki).
* **Preview envs:** PR‑scoped namespaces via ArgoCD ApplicationSets; preview URLs posted to PR.
* **Conventions:** Conventional Commits, Prettier/ESLint/Black, pre‑commit hooks.
* **Testing:** unit/integration/E2E; contract tests for APIs and plugin UI contracts.

**Acceptance:** `just dev` (or `make dev`) launches local stack; PRs automatically get a preview link.

---

## 15) Optional Shared Services (Phase 2+)

* **Feature flags:** Unleash/Flagsmith (self‑hosted) if runtime toggles become frequent.
* **Incident management:** lightweight status page (Instatus) + rotation schedule (Google Calendar).
* **Secrets sharing (people):** 1Password/Bitwarden for non‑AWS secrets (optional).

---

## 16) MVP Checklist (Ops Readiness)

* [ ] EKS cluster with RBAC + IRSA; ArgoCD installed & secured
* [ ] ECR + OCI Helm registry; cosign + SBOM pipeline in GitHub Actions
* [ ] Prometheus/Thanos, Loki, Jaeger, Grafana deployed with base dashboards
* [ ] ALB Ingress + WAF + SSE settings verified
* [ ] SNS/SQS + KEDA wired; DLQs and alerts configured
* [ ] External Secrets Operator; Secrets Manager populated
* [ ] RDS + backups; Neo4j/Neptune + backups; OpenSearch + snapshots
* [ ] Notion (or GitHub Projects) boards set with MVP milestones
* [ ] Runbooks created for top 5 failure modes
* [ ] Preview envs via ArgoCD ApplicationSets
* [ ] Cost tags applied across resources

---

## 17) Runbook Template (Notion)

**Service:** <name>
**Alert:** <rule name>
**Severity:** P1/P2/P3
**Dashboards:** links to Grafana panels
**Logs/Traces:** Loki query, Jaeger search
**Playbook:** step‑by‑step mitigation
**Rollback:** ArgoCD app + Helm chart version
**Escalation:** who/when
**Postmortem:** link

---

## 18) Integrations Matrix

| Domain  | Tool                                   | Integration                                      |
| ------- | -------------------------------------- | ------------------------------------------------ |
| CI → CD | GitHub Actions → ArgoCD                | GitOps repo update; ArgoCD notifications to Chat |
| Alerts  | Prometheus/Grafana → Google Chat/Email | Webhooks with severity routing                   |
| Traces  | OTel SDK → OTel Collector → Jaeger     | W3C tracecontext across HTTP/SQS                 |
| Logs    | Promtail → Loki                        | Labels: `app`, `component`, `env`, `version`     |
| Metrics | Prometheus → Thanos → Grafana          | SLO dashboards, error budgets                    |
| Search  | Indexer → OpenSearch                   | Hybrid and vector indices                        |
| AI      | Services/Plugins → LiteLLM             | Central model routing, budgets, audit            |
| Secrets | Secrets Manager → External Secrets     | Sync to K8s Secrets                              |
| Issues  | GitHub ↔ Notion                        | Links on PRs; Notion roadmap to issues           |
