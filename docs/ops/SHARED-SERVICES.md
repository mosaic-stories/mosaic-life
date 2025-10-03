# Shared Services Requirements

**Platform:** Kubernetes (EKS or equivalent) on AWS.
**Networking:** AWS ALB → Ingress Controller (NGINX/Gateway API) with AWS WAF in front.
**Auth:** AWS Cognito (OIDC).
**CI/CD:** See [CI/CD Requirements](https://github.com/mosaic-stories/infrastructure/blob/main/docs/CICD.md) - GitHub Actions → ArgoCD (GitOps).
**Observability:** See [Observability & Monitoring](https://github.com/mosaic-stories/infrastructure/blob/main/docs/OBSERVABILITY.md) - Prometheus + Thanos, Grafana OSS, Grafana Loki, Jaeger (OTel).
**Messaging:** SNS/SQS.
**Search:** OpenSearch (vector‑ready).
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
* **Local dev:** See [Local Development Setup](/docs/developer/LOCAL.md) for environment configuration; never commit secrets.

**Acceptance:** Secrets never in Git; rotations do not require app rebuilds.

---

## 3) CI/CD & Observability

* **CI/CD:** See [CI/CD Requirements](https://github.com/mosaic-stories/infrastructure/blob/main/docs/CICD.md) for complete pipeline architecture, security scanning, and deployment workflows.
* **Observability:** See [Observability & Monitoring](https://github.com/mosaic-stories/infrastructure/blob/main/docs/OBSERVABILITY.md) for comprehensive monitoring, logging, and tracing requirements.

---

## 4) Networking, Ingress, and Security Edge

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

## 5) Data Services & Reliability

* **Relational DB:** Postgres (RDS). **Backups:** automated snapshots; point‑in‑time recovery.
* **Graph DB:** Neo4j (self‑hosted) or Neptune. Scheduled backups/export.
* **Search:** OpenSearch managed or self‑hosted; k‑NN enabled for vectors.
* **Object store:** S3 buckets for media + artifacts; lifecycle policies (hot → warm → archive); **WAF logs** and **ALB logs** to S3.

**Acceptance:** Documented RPO/RTO per service; restore drills at least twice/year.

---

## 6) Messaging, Jobs & Autoscaling

* **SNS/SQS** for domain events and work queues.
* **KEDA** for event‑driven scaling from SQS queue depth.
* **DLQs** and retry with backoff; redrive policies.

**Acceptance:** Spiky workloads scale automatically; no message lost; DLQs monitored.

---

## 7) Security, Compliance & Supply Chain

* **WAF logging:** to S3 with Athena queries + alerts on anomalies.
* **IAM hygiene:** monthly review of roles/policies.
* **Backups encryption:** KMS; cross‑region copies for critical data.
* **Supply chain security:** See [CI/CD Requirements](https://github.com/mosaic-stories/infrastructure/blob/main/docs/CICD.md) for image scanning, secret scanning, SBOM generation, and artifact signing.

**Acceptance:** Zero plaintext secrets; periodic audits logged; all security policies automated.

---

## 8) Issue Tracking & Project Management

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

## 9) Documentation & Knowledge Base

* **Developer handbook** (Notion): architecture docs, onboarding, coding standards, PR checklist, release process.
* **Runbooks** per alert/service with Grafana/Loki/Jaeger links.
* **Changelogs** automated from Conventional Commits (release‑please) and published to Notion + GitHub Releases.

**Acceptance:** A new contributor can set up local dev and ship a small change within one day using the [Local Development Setup](/docs/developer/LOCAL.md) docs alone.

---

## 10) Backups, DR & Business Continuity

* **Velero** for Kubernetes resources (include CSI snapshots for PVCs where needed).
* **DB backups:** RDS automated + logical dumps; Neo4j/Neptune scheduled dumps.
* **Search:** snapshot repositories to S3.
* **Media:** S3 cross‑region replication for critical buckets.

**Acceptance:** Quarterly restore test of each tier (DB, graph, search, media, cluster manifests).

---

## 11) Cost & Tagging

* **AWS Budgets** with alerts; **Cost Explorer** dashboards.
* **Tagging standard:** `Project=LegacyPlatform`, `Env=dev|staging|prod`, `Owner`, `Component`.
* **Grafana cost panels** (optional via CloudWatch/Cost Explorer exporters).

**Acceptance:** Monthly cost report by component with at least 90% attribution coverage.

---

## 12) Developer Experience

See **[Local Development Setup](/docs/developer/LOCAL.md)** for complete local development environment setup including Docker Compose stack and development workflow.

* **Preview envs:** PR‑scoped namespaces via ArgoCD ApplicationSets; preview URLs posted to PR.
* **Conventions:** Conventional Commits, Prettier/ESLint/Black, pre‑commit hooks.
* **Testing:** unit/integration/E2E; contract tests for APIs and plugin UI contracts.

**Acceptance:** `just dev` (or `make dev`) launches local stack; PRs automatically get a preview link. (Target: see current setup in [Local Development Setup](/docs/developer/LOCAL.md))

---

## 13) Optional Shared Services (Phase 2+)

* **Feature flags:** Unleash/Flagsmith (self‑hosted) if runtime toggles become frequent.
* **Incident management:** lightweight status page (Instatus) + rotation schedule (Google Calendar).
* **Secrets sharing (people):** 1Password/Bitwarden for non‑AWS secrets (optional).

---

## 14) MVP Checklist (Ops Readiness)

* [ ] EKS cluster with RBAC + IRSA configured
* [ ] ALB Ingress + WAF + SSE settings verified  
* [ ] External Secrets Operator; Secrets Manager populated
* [ ] RDS + backups; Neo4j + backups; OpenSearch + snapshots
* [ ] SNS/SQS + KEDA wired; DLQs configured
* [ ] Notion (or GitHub Projects) boards set with MVP milestones
* [ ] Cost tags applied across resources
* [ ] CI/CD pipeline configured (see [CI/CD checklist](https://github.com/mosaic-stories/infrastructure/blob/main/docs/CICD.md))
* [ ] Observability stack deployed (see [Observability checklist](https://github.com/mosaic-stories/infrastructure/blob/main/docs/OBSERVABILITY.md))

---

## 15) Runbook Template (Notion)

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

## 16) Integrations Matrix

| Domain  | Tool                                   | Integration                                      | Details |
| ------- | -------------------------------------- | ------------------------------------------------ | ------- |
| CI → CD | GitHub Actions → ArgoCD                | GitOps repo update; ArgoCD notifications to Chat | [CI/CD](https://github.com/mosaic-stories/infrastructure/blob/main/docs/CICD.md) |
| Alerts  | Prometheus/Grafana → Google Chat/Email | Webhooks with severity routing                   | [Observability](https://github.com/mosaic-stories/infrastructure/blob/main/docs/OBSERVABILITY.md) |
| Traces  | OTel SDK → OTel Collector → Jaeger     | W3C tracecontext across HTTP/SQS                 | [Observability](https://github.com/mosaic-stories/infrastructure/blob/main/docs/OBSERVABILITY.md) |
| Logs    | Promtail → Loki                        | Labels: `app`, `component`, `env`, `version`     | [Observability](https://github.com/mosaic-stories/infrastructure/blob/main/docs/OBSERVABILITY.md) |
| Metrics | Prometheus → Thanos → Grafana          | SLO dashboards, error budgets                    | [Observability](https://github.com/mosaic-stories/infrastructure/blob/main/docs/OBSERVABILITY.md) |
| Search  | Indexer → OpenSearch                   | Hybrid and vector indices                        | - |
| AI      | Services/Plugins → LiteLLM             | Central model routing, budgets, audit            | - |
| Secrets | Secrets Manager → External Secrets     | Sync to K8s Secrets                              | - |
| Issues  | GitHub ↔ Notion                        | Links on PRs; Notion roadmap to issues           | - |
