# LiteLLM IRSA CDK Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the LiteLLM IRSA role definition into this repository's CDK so workload IAM ownership matches the rest of the application infrastructure.

**Architecture:** Add a dedicated shared CDK stack that creates a single `mosaic-shared-litellm-role` for the `aiservices/litellm` service account. Keep the Helm chart responsible for the ServiceAccount annotation, but realign values and ArgoCD so they reference the role managed here instead of implying an externally managed role.

**Tech Stack:** AWS CDK v2, IAM IRSA, Helm 3, ArgoCD, Markdown docs

---

## Task 1: Add Dedicated LiteLLM Shared CDK Stack

**Files:**
- Create: `infra/cdk/lib/litellm-shared-stack.ts`
- Modify: `infra/cdk/bin/mosaic-life.ts`

**Steps:**
1. Create a CDK stack that defines `mosaic-shared-litellm-role`.
2. Scope trust to `system:serviceaccount:aiservices:litellm` using the same EKS OIDC provider pattern used by the existing IRSA roles.
3. Add policies for Bedrock invoke/stream, Bedrock guardrails, and read access to `mosaic/shared/litellm/*` in Secrets Manager.
4. Export the role ARN as a stack output.
5. Register the stack in `infra/cdk/bin/mosaic-life.ts`.

## Task 2: Realign Helm and ArgoCD

**Files:**
- Modify: `infra/helm/litellm/values.yaml`
- Modify: `infra/argocd/applications/litellm.yaml`

**Steps:**
1. Replace the empty IRSA annotation placeholder in the LiteLLM chart values with the CDK-managed role ARN.
2. Remove the redundant inline Helm values override from the ArgoCD application.
3. Keep the ServiceAccount template unchanged apart from consuming the realigned values.

## Task 3: Update LiteLLM Documentation

**Files:**
- Modify: `docs/ops/litellm-setup-runbook.md`
- Modify: `docs/plans/2026-03-07-litellm-integration-design.md`
- Modify: `docs/plans/2026-03-07-litellm-implementation-plan.md`

**Steps:**
1. Update the runbook so Step 3 points to this repo's CDK stack instead of the infrastructure repo.
2. Add the CDK build/synth and deployment flow needed before Helm/Argo deployment.
3. Update the design and implementation docs to reflect that LiteLLM IRSA is application-owned CDK infrastructure in this repo.

## Task 4: Verify End-to-End Configuration

**Files:**
- Verify only

**Steps:**
1. Run `cd infra/cdk && npm run build`.
2. Run `cd infra/cdk && npm run synth`.
3. Run `helm lint infra/helm/litellm/`.
4. Run `helm template litellm infra/helm/litellm/ --namespace aiservices` and verify the ServiceAccount annotation resolves to `mosaic-shared-litellm-role`.

## Execution Status

- [x] Task 1: Add Dedicated LiteLLM Shared CDK Stack
- [x] Task 2: Realign Helm and ArgoCD
- [x] Task 3: Update LiteLLM Documentation
- [x] Task 4: Verify End-to-End Configuration

Validation note: `cd infra/cdk && npm run build`, `cd infra/cdk && npx cdk synth MosaicLiteLLMSharedStack`, `helm lint infra/helm/litellm/`, and `helm template litellm infra/helm/litellm/ --namespace aiservices | grep -A 3 "eks.amazonaws.com/role-arn"` all succeeded on 2026-03-07.
