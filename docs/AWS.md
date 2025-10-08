# AWS Platform Checklist

Concise guide for provisioning and operating the AWS foundation that hosts Mosaic Life. Complements `/docs/KUBERNETES.md`.

---

## Provisioning Approach
- **Infrastructure as Code:**
  - Use `eksctl` (YAML + CLI) for EKS cluster lifecycle and node group management (see `/docs/KUBERNETES.md`).
  - Prefer AWS CDK for defining other resources (VPC, IAM roles/policies, RDS, S3, Route53, ACM, Bedrock access, etc.), synthesizing CloudFormation templates only as deployment artifacts when required.
  - Store IaC definitions in `infra/` repo; require code review + pipeline validation before changes.
- **Environment Layout:** Dev, staging, prod accounts or isolated VPCs within single account (document chosen pattern). Ensure least privilege and blast-radius boundaries.

## Core Networking
- **VPC:** Dedicated VPC per environment with public/private subnets across ≥2 AZs; private subnets for workloads, public for ingress/egress.
- **Routing:** NAT gateways for outbound access; VPC endpoints for S3, SNS, SQS, Secrets Manager, ECR to minimize public traffic.
- **Security Groups:** Per service security groups with least privilege; ALB SG allows HTTPS only; database SG restricts to cluster nodes.

## Compute & Containers
- **EKS:** Managed control plane; node groups with spot/on-demand mix; enable logging (API, audit) to CloudWatch; integrate IRSA.
- **EC2:** Additional instances only when necessary (e.g., bastion, build runners); manage via ASG or Systems Manager Session Manager; enforce SSM onboarding and patch compliance.
- **Autoscaling:** Configure Cluster Autoscaler/Karpenter roles; ensure IAM permissions scoped appropriately.

## Storage & Data
- **S3:**
  - Buckets for media, backups, Thanos/Loki object storage, artifact retention.
  - Enable versioning, encryption (SSE-S3/KMS), lifecycle policies (IA/Glacier), access logging.
- **RDS (Postgres):** Multi-AZ deployment, automatic backups, enhanced monitoring, IAM authentication optional; encrypt with KMS CMK; parameter groups for workload tuning.
- **Neo4j:** If self-hosted on EKS, provide EBS-backed storage classes; if managed externally, secure access via PrivateLink or VPC peering.
- **Secrets:** AWS Secrets Manager/Parameter Store as source of truth; integrated with External Secrets Operator for Kubernetes consumption.

## Identity & Access Management
- **IAM Strategy:**
  - Separate roles for humans (SSO via IAM Identity Center) vs workloads (IRSA/role assumption).
  - Enforce least privilege; use permission boundaries and tagging for governance.
  - Enable Access Analyzer; schedule monthly review of policies and CloudTrail findings.
- **Federation:** GitHub OIDC roles for CI; short-lived credentials only.
- **Cognito:** Provision user pools/identity pools for auth flows; secure secrets in Secrets Manager; integrate with BFF per backend architecture.

## Networking Edge & Security Services
- **ALB/WAF:** Deploy ALB via AWS Load Balancer Controller; attach AWS WAF with managed + custom rules; enable logging to S3.
- **ACM:** Request/validate certificates for ALB hostnames; manage renewals automatically; track in Route53.
- **Route53:** Host public/private zones; manage records for app, ArgoCD, observability endpoints; enable DNSSEC if required.
- **CloudFront (optional):** Consider for CDN/caching needs; integrate with S3 and ALB as needed.

## Messaging & AI Services
- **SNS/SQS:** Provision topics/queues with DLQs; enforce encryption at rest (KMS) and access policies; allow VPC endpoints; integrate with KEDA.
- **Bedrock:** Configure access policies for approved models; monitor spend; restrict to necessary accounts.
- **LiteLLM:** Deploy inside VPC (EKS) with IAM access to provider APIs; log and monitor usage.

## Monitoring & Logging
- **CloudWatch:** Centralize VPC Flow Logs, NAT/ALB logs (if not solely in S3), RDS metrics, Lambda logs (if any); integrate with observability stack.
- **CloudTrail:** Enable organization and account trails; deliver to S3 with lifecycle; monitor via CloudWatch Events.
- **Config:** Optionally enable AWS Config for compliance tracking (drift, tagging, encryption). Automate remediation via SSM/Config rules.

## Backup & DR
- **Backups:**
  - RDS automated backups + snapshots; replicate to secondary region if required.
  - EBS snapshots for stateful workloads (Velero, AWS Backup).
  - S3 cross-region replication for critical buckets (media, observability data).
- **Disaster Recovery:** Document RTO/RPO; test failover scenarios (restore EKS state via IaC + Velero, restore DB snapshots, rehydrate observability storage).

## Governance & Cost Management
- **Tagging:** Enforce standard tags (`Project=MosaicPlatform`, `Env`, `Owner`, `Component`, `CostCenter`). Apply via IaC and service control policies.
- **Budgets & Alerts:** Configure AWS Budgets, Cost Explorer reports, anomaly detection. Export CUR to S3 for analytics.
- **Guardrails:** Use AWS Control Tower or SCPs where available (e.g., restrict regions, prevent public S3/EC2, enforce encryption).

## Validation Checklist
- [ ] CDK applications (and synthesized templates)/eksctl definitions stored in repo with CI validation (lint, drift detection).
- [ ] VPC subnets, routing, security groups aligned with EKS requirements and zero-trust principles.
- [ ] IAM roles mapped for humans, CI, and workloads; Access Analyzer clean.
- [ ] EKS cluster logging, CloudTrail, Config enabled and shipped to S3/CloudWatch per policy.
- [ ] RDS/Postgres configured with Multi-AZ, encryption, backups, monitoring.
- [ ] S3 buckets versioned/encrypted; lifecycle policies active; access logging enabled.
- [ ] Route53 records + ACM certificates issued for app, ArgoCD, observability endpoints.
- [ ] SNS/SQS topics/queues provisioned with DLQs and encryption; Bedrock access scoped.
- [ ] Backup/restore runbooks tested for RDS, EKS state (Velero), and S3 data.
- [ ] Cost reports and tagging compliance reviewed monthly.

---

## Reference Runbooks
- Account bootstrap & baseline guardrails.
- EKS cluster provisioning via eksctl (link to `/docs/KUBERNETES.md`).
- RDS failover/restore procedures.
- S3 bucket lifecycle and retention adjustments.
- IAM role rotation & incident response (privilege escalation, access key detection).
- CDK synthesis/deploy process and CloudFormation stack update/rollback handling.
