# Kubernetes & EKS Checklist

Concise design reference for the Mosaic Life single-cluster AWS EKS deployment. Complements `/docs/ops/AWS.md` with Kubernetes-specific requirements.

---

## Cluster Topology
- **Control plane:** Managed AWS EKS (version ≥ 1.29); upgrade quarterly with two-step validation (staging → production).
- **Node groups:** Spot + on-demand mix via managed node groups; GPU pool optional for AI workloads; taint GPU nodes.
- **Namespaces:**
  - `mosaiclife` – production workloads.
  - `mosaiclife-${branch}` – ephemeral preview environments (ArgoCD ApplicationSets handle lifecycle).
  - `argocd` – GitOps control plane.
  - `observability` – Prometheus/Thanos, Loki, Grafana, Jaeger, OTel Collector.
  - Add-on namespaces (`kube-system`, `karpenter` or autoscaler, `external-secrets`) per component; document ownership.
- **Cluster services:** Core DNS (CoreDNS), metrics-server, Cluster Autoscaler/Karpenter, AWS Load Balancer Controller, External Secrets Operator, Cert-Manager (if needed for internal certs).

## Networking & Ingress
- **VPC:** Dedicated VPC with private subnets for nodes, public subnets only for ALB/ingress; enforce NACLs and security groups aligning with least privilege.
- **Ingress:** AWS Load Balancer Controller (ALB) with AWS WAF; enforce TLS 1.2+, HSTS; set SSE annotations for streaming endpoints (`proxy-read-timeout`, `proxy-send-timeout`, `proxy-buffering`).
- **Internal services:** Use ClusterIP + mesh-ready annotations; consider NLB for internal data services if latency sensitive.
- **CNI:** AWS VPC CNI with prefix delegation; monitor IP utilization; enable kube-proxy IPVS.
- **NetworkPolicy:** Default deny egress/ingress; allow only required traffic (Postgres, OpenSearch, Neo4j, LiteLLM, SNS/SQS endpoints, Bedrock); manage via `infra/helm/*` chart values.

## Identity & Security
- **IAM integration:**
  - Map human roles through AWS IAM Identity Center + `aws-auth` ConfigMap for `dev`, `ops`, `read-only` personas.
  - **IRSA:** ServiceAccount per workload with tightly scoped policies (S3, RDS IAM auth if enabled, Secrets Manager, Bedrock, SNS/SQS, OpenSearch, Neo4j, LiteLLM, CloudWatch events).
- **Secrets:** AWS Secrets Manager + External Secrets Operator; no plaintext secrets in manifests.
- **Admission controls:** Enable OPA/Gatekeeper or Kyverno for policy enforcement (signed images, namespace labels, resource limits, required probes).
- **RBAC:** Namespace-level roles; aggregate cluster roles for platform teams; audit with `kubectl auth can-i` automation.
- **Image policy:** Enforce cosign signature verification (matching CI pipeline output).

## Deployment Workflow
- **GitOps:** ArgoCD (App-of-Apps) manages all namespaces; production changes flow via GitOps repo updates only.
- **Preview envs:** ApplicationSet generates `mosaiclife-${branch}` namespace + value overrides; auto-clean on PR close.
- **Helm-only:** Charts stored in OCI registry; `values-<env>.yaml` pinned in GitOps repo; align with `infra/helm/` structure.
- **Eksctl/Karpenter:** Provision baseline cluster with `eksctl`; chart-managed add-ons post-provision; capture commands/manifests in infra repo.

## Observability & Operations
- **Metrics:** Prometheus Operator in `observability`; scrape via ServiceMonitors; integrate Kube State Metrics, Node Exporter, AWS CloudWatch exporter as needed.
- **Logs:** Promtail/Fluent Bit DaemonSet → Loki; enforce JSON logs; attach env/service labels.
- **Tracing:** OTel Collector (DaemonSet + deployment) ships spans to Jaeger/Tempo; propagate `traceparent` across ingress, services, and SQS/SNS hops.
- **Dashboards:** Version control Grafana dashboards; include cluster health, namespace capacity, control-plane metrics, ArgoCD sync status, preview env usage.
- **Alerting:** Alertmanager/Grafana Alerts with runbook links; integrate with incident channel.

## Resilience & Scaling
- **Autoscaling:**
  - Cluster Autoscaler/Karpenter for nodes.
  - HPAs per workload (CPU/memory + custom metrics).
  - KEDA for SQS queue depth-based scaling.
- **Disruption management:** PodDisruptionBudgets for critical services; plan maintenance windows.
- **Backups:** Velero for cluster resources + CSI snapshots; schedule RDS, OpenSearch, Neo4j backups per SHARED-SERVICES guidance; test restores quarterly.
- **DR:** Multi-AZ nodes; evaluate warm standby region-based runbook; document RTO/RPO in ops handbook.

## Data & Service Integrations
- **Datastores:**
  - RDS/Postgres accessed via private endpoint; enforce TLS; optionally use IAM auth with sidecar token refresh.
  - OpenSearch domain reachable via VPC endpoint; control IP allowlists.
  - Neo4j self-hosted inside cluster with StatefulSet + PVCs (gp3/ebs-csi);
- **AI & ML:** LiteLLM and Bedrock access via IRSA; restrict Bedrock model permissions; log usage metrics.
- **Messaging:** SNS/SQS via VPC endpoints or NAT; ensure egress allowed only to required AWS APIs; configure DLQs + CloudWatch alarms.
- **Secrets Manager:** Use `ExternalSecret` resources per namespace; DR plan includes secret sync validation.

## Compliance & Governance
- **Tagging:** Apply AWS resource tags (`Project=MosaicPlatform`, `Env`, `Owner`, `Component`) via eksctl; propagate to load balancers and node groups.
- **Audit:** Enable CloudTrail, EKS control plane logging (api, audit, authenticator); ship to centralized S3 with lifecycle policies.
- **Policies:** Document namespace ownership, SLOs, on-call rotations; ensure RBAC + IAM reviewed quarterly.

## Validation Checklist
- [ ] Cluster version within N-1 of latest EKS release.
- [ ] All namespaces labeled with `env`, `owner`, `component`; NetworkPolicies applied.
- [ ] ArgoCD sync health green; preview namespaces cleaned up automatically.
- [ ] IRSA mappings validated; no pods using default ServiceAccount.
- [ ] Secrets synced via External Secrets; no `Secret` manifest with inline values.
- [ ] Ingress annotations support SSE; ALB/WAF logging enabled to S3.
- [ ] Observability stack operational; dashboards + alerts linked to runbooks.
- [ ] Autoscaling (CA/HPA/KEDA) tested under load scenarios.
- [ ] Backup + restore drill completed within defined RTO/RPO.
- [ ] Policy enforcement (image signing, resource limits, probes) verified in CI and cluster.

---

## Reference Runbooks
- Cluster lifecycle (provision/upgrade/decommission) – store scripts in `infra/`.
- ArgoCD incident response – sync failures, rollbacks, paused apps.
- Preview namespace triage – stuck ApplicationSet, quota issues.
- Node pool maintenance – draining, upgrading AMIs, handling spot interruptions.
- WAF/ALB tuning – rate limits, blocked origins, updating allowlists.

Keep this document updated alongside major infra changes; link related ADRs or issues when adjustments are made.
