# LiteLLM Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy LiteLLM as a centralized AI model proxy in a dedicated `aiservices` namespace, accessible from both prod and staging environments.

**Architecture:** Custom Helm chart deployed via ArgoCD. Single LiteLLM instance backed by a dedicated database on the shared Aurora PostgreSQL cluster. IRSA for Bedrock access. ExternalSecrets for credential management. No Redis, no ingress.

**Tech Stack:** Helm 3, ArgoCD, LiteLLM (Docker image `ghcr.io/berriai/litellm-database`), AWS Bedrock, AWS Secrets Manager, External Secrets Operator, PostgreSQL, Docker Compose (local dev)

**Design doc:** `docs/plans/2026-03-07-litellm-integration-design.md`

## Execution Status

- [x] Task 1: Create Helm Chart Scaffold
- [x] Task 2: ServiceAccount & ExternalSecret Templates
- [x] Task 3: ConfigMap Template
- [x] Task 4: Deployment Template
- [x] Task 5: Service & NetworkPolicy Templates
- [x] Task 6: ArgoCD Application & Project Update
- [x] Task 7: Docker Compose Local Development
- [x] Task 8: Update Core-API LITELLM_BASE_URL References
- [x] Task 9: IAM Role Documentation
- [x] Task 10: Final Validation & Documentation Update

Execution note: implementing directly on the current `develop` branch without worktrees, per repository and user instructions.
Validation note: `helm lint infra/helm/litellm/`, full `helm template` render, `helm template` verification for `LITELLM_BASE_URL`, and `docker compose -f infra/compose/docker-compose.yml config --services` all succeeded on 2026-03-07.

---

## Task 1: Create Helm Chart Scaffold

**Files:**
- Create: `infra/helm/litellm/Chart.yaml`
- Create: `infra/helm/litellm/values.yaml`
- Create: `infra/helm/litellm/templates/_helpers.tpl`

**Step 1: Create Chart.yaml**

```yaml
# infra/helm/litellm/Chart.yaml
apiVersion: v2
name: litellm
description: LiteLLM Proxy - Centralized AI model gateway
type: application
version: 1.0.0
appVersion: "1.0.0"
keywords:
  - litellm
  - ai
  - proxy
home: https://github.com/mosaic-stories/mosaic-life
sources:
  - https://github.com/mosaic-stories/mosaic-life
maintainers:
  - name: Mosaic Life Team
    email: team@mosaiclife.me
```

**Step 2: Create values.yaml**

```yaml
# infra/helm/litellm/values.yaml
image:
  repository: ghcr.io/berriai/litellm-database
  tag: "main-stable"
  pullPolicy: IfNotPresent

replicaCount: 1

service:
  type: ClusterIP
  port: 4000

serviceAccount:
  create: true
  annotations:
    eks.amazonaws.com/role-arn: ""
  name: litellm

externalSecrets:
  enabled: true
  secretStoreName: aws-secretsmanager
  secretStoreKind: ClusterSecretStore
  credentialsSecretName: "mosaic/shared/litellm/credentials"
  refreshInterval: "1h"

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: 1
    memory: 1Gi

networkPolicy:
  enabled: true
  allowedNamespaces:
    - mosaic-prod
    - mosaic-staging
  vpcCidr: "10.20.0.0/16"

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: true
```

**Step 3: Create _helpers.tpl**

Follow pattern from `infra/helm/mosaic-life/templates/_helpers.tpl`.

```yaml
# infra/helm/litellm/templates/_helpers.tpl
{{/*
Expand the name of the chart.
*/}}
{{- define "litellm.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "litellm.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "litellm.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "litellm.labels" -}}
helm.sh/chart: {{ include "litellm.chart" . }}
{{ include "litellm.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "litellm.selectorLabels" -}}
app.kubernetes.io/name: {{ include "litellm.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: ai-proxy
{{- end }}
```

**Step 4: Verify chart structure**

Run: `ls -R infra/helm/litellm/`

Expected: Chart.yaml, values.yaml, templates/_helpers.tpl

**Step 5: Lint the chart**

Run: `helm lint infra/helm/litellm/`

Expected: WARNING about missing templates (no deployable templates yet), no errors on the files we created.

**Step 6: Commit**

```bash
git add infra/helm/litellm/
git commit -m "feat(litellm): scaffold Helm chart with Chart.yaml, values, helpers"
```

---

## Task 2: ServiceAccount & ExternalSecret Templates

**Files:**
- Create: `infra/helm/litellm/templates/serviceaccount.yaml`
- Create: `infra/helm/litellm/templates/external-secret.yaml`

**Reference:** `infra/helm/mosaic-life/templates/core-api-serviceaccount.yaml` and `infra/helm/mosaic-life/templates/external-secrets.yaml`

**Step 1: Create serviceaccount.yaml**

```yaml
# infra/helm/litellm/templates/serviceaccount.yaml
{{- if .Values.serviceAccount.create }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.serviceAccount.name }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "litellm.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
```

**Step 2: Create external-secret.yaml**

```yaml
# infra/helm/litellm/templates/external-secret.yaml
{{- if .Values.externalSecrets.enabled }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: litellm-credentials
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "litellm.labels" . | nindent 4 }}
spec:
  refreshInterval: {{ .Values.externalSecrets.refreshInterval }}
  secretStoreRef:
    name: {{ .Values.externalSecrets.secretStoreName }}
    kind: {{ .Values.externalSecrets.secretStoreKind }}
  target:
    name: litellm-credentials
    creationPolicy: Owner
    template:
      engineVersion: v2
      data:
        LITELLM_MASTER_KEY: "{{ "{{ .master_key }}" }}"
        LITELLM_SALT_KEY: "{{ "{{ .salt_key }}" }}"
        DATABASE_URL: "postgresql://{{ "{{ .db_username }}" }}:{{ "{{ .db_password }}" }}@{{ "{{ .db_host }}" }}:{{ "{{ .db_port }}" }}/{{ "{{ .db_name }}" }}?sslmode=require"
  dataFrom:
    - extract:
        key: {{ .Values.externalSecrets.credentialsSecretName }}
{{- end }}
```

**Step 3: Lint the chart**

Run: `helm lint infra/helm/litellm/`

Expected: Passes (may warn about missing deployment/service, that's fine).

**Step 4: Template dry-run to verify output**

Run: `helm template test infra/helm/litellm/ --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::033691785857:role/mosaic-shared-litellm-role`

Expected: ServiceAccount with IRSA annotation, ExternalSecret targeting `mosaic/shared/litellm/credentials`.

**Step 5: Commit**

```bash
git add infra/helm/litellm/templates/serviceaccount.yaml infra/helm/litellm/templates/external-secret.yaml
git commit -m "feat(litellm): add ServiceAccount and ExternalSecret templates"
```

---

## Task 3: ConfigMap Template

**Files:**
- Create: `infra/helm/litellm/templates/configmap.yaml`

The ConfigMap embeds the full LiteLLM `config.yaml` inline. Secrets (master_key, database_url) are referenced via `os.environ/` so they come from the ExternalSecret, not the ConfigMap.

**Step 1: Create configmap.yaml**

```yaml
# infra/helm/litellm/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: litellm-config
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "litellm.labels" . | nindent 4 }}
data:
  config.yaml: |
    model_list:
      # Anthropic Claude models via Bedrock
      - model_name: claude-sonnet-4-6
        litellm_params:
          model: bedrock/anthropic.claude-sonnet-4-6-20250514
      - model_name: claude-opus-4-6
        litellm_params:
          model: bedrock/anthropic.claude-opus-4-6-20250514
      - model_name: claude-haiku-4-5
        litellm_params:
          model: bedrock/anthropic.claude-haiku-4-5-20251001

      # Qwen via Bedrock
      - model_name: qwen3-next-80b
        litellm_params:
          model: bedrock/qwen.qwen3-next-80b-a3b-v1:0

      # Kimi via Bedrock
      - model_name: kimi-k2.5
        litellm_params:
          model: bedrock/moonshotai.kimi-k2-5-v1:0

      # Mistral models via Bedrock
      - model_name: voxtral-small-24b
        litellm_params:
          model: bedrock/mistral.voxtral-small-24b-2507-v1:0
      - model_name: voxtral-mini-3b
        litellm_params:
          model: bedrock/mistral.voxtral-mini-3b-2507-v1:0
      - model_name: magistral-small
        litellm_params:
          model: bedrock/mistral.magistral-small-2509-v1:0
      - model_name: mistral-large-3
        litellm_params:
          model: bedrock/mistral.mistral-large-2-v1:0

      # Amazon models via Bedrock
      - model_name: nova-multimodal-embeddings
        litellm_params:
          model: bedrock/amazon.nova-multimodal-embeddings-v1:0

      # Whisper via Bedrock
      - model_name: whisper-large-v3-turbo
        litellm_params:
          model: bedrock/openai.whisper-large-v3-turbo-v2:0

      # Meta Llama via Bedrock
      - model_name: llama4-maverick-17b
        litellm_params:
          model: bedrock/meta.llama4-maverick-17b-instruct-v1:0

    general_settings:
      master_key: os.environ/LITELLM_MASTER_KEY
      database_url: os.environ/DATABASE_URL
      store_model_in_db: false
      disable_spend_logs: false
      proxy_batch_write_at: 10

    litellm_settings:
      drop_params: true
      request_timeout: 600
      num_retries: 2
```

**Step 2: Template dry-run to verify**

Run: `helm template test infra/helm/litellm/ | grep -A 5 "kind: ConfigMap"`

Expected: ConfigMap named `litellm-config` with `config.yaml` data key containing the model list.

**Step 3: Commit**

```bash
git add infra/helm/litellm/templates/configmap.yaml
git commit -m "feat(litellm): add ConfigMap with model configuration"
```

---

## Task 4: Deployment Template

**Files:**
- Create: `infra/helm/litellm/templates/deployment.yaml`

**Reference:** `infra/helm/mosaic-life/templates/core-api-deployment.yaml` for security context and structure patterns.

**Step 1: Create deployment.yaml**

```yaml
# infra/helm/litellm/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "litellm.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "litellm.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "litellm.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
      labels:
        {{- include "litellm.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ .Values.serviceAccount.name }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
      - name: litellm
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        args:
          - "--config"
          - "/app/config.yaml"
          - "--port"
          - "4000"
        ports:
        - name: http
          containerPort: 4000
          protocol: TCP
        env:
        - name: LITELLM_MASTER_KEY
          valueFrom:
            secretKeyRef:
              name: litellm-credentials
              key: LITELLM_MASTER_KEY
        - name: LITELLM_SALT_KEY
          valueFrom:
            secretKeyRef:
              name: litellm-credentials
              key: LITELLM_SALT_KEY
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: litellm-credentials
              key: DATABASE_URL
        livenessProbe:
          httpGet:
            path: /health/liveliness
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 15
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health/readiness
            port: 4000
          initialDelaySeconds: 15
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        securityContext:
          {{- toYaml .Values.securityContext | nindent 10 }}
        volumeMounts:
        - name: config
          mountPath: /app/config.yaml
          subPath: config.yaml
          readOnly: true
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: config
        configMap:
          name: litellm-config
      - name: tmp
        emptyDir: {}
```

**Step 2: Template dry-run to verify**

Run: `helm template test infra/helm/litellm/`

Expected: Full Deployment manifest with correct container args, env from secret, config volume mount, health probes, security context.

**Step 3: Commit**

```bash
git add infra/helm/litellm/templates/deployment.yaml
git commit -m "feat(litellm): add Deployment template with health probes and security context"
```

---

## Task 5: Service & NetworkPolicy Templates

**Files:**
- Create: `infra/helm/litellm/templates/service.yaml`
- Create: `infra/helm/litellm/templates/networkpolicy.yaml`

**Step 1: Create service.yaml**

```yaml
# infra/helm/litellm/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "litellm.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "litellm.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
  - port: {{ .Values.service.port }}
    targetPort: 4000
    protocol: TCP
    name: http
  selector:
    {{- include "litellm.selectorLabels" . | nindent 4 }}
```

**Step 2: Create networkpolicy.yaml**

```yaml
# infra/helm/litellm/templates/networkpolicy.yaml
{{- if .Values.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "litellm.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "litellm.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "litellm.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        {{- range .Values.networkPolicy.allowedNamespaces }}
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: {{ . }}
        {{- end }}
      ports:
        - protocol: TCP
          port: 4000
  egress:
    # DNS
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 53
        - protocol: UDP
          port: 53
    # AWS APIs (Bedrock, STS, Secrets Manager)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 443
    # Aurora PostgreSQL (within VPC)
    - to:
        - ipBlock:
            cidr: {{ .Values.networkPolicy.vpcCidr }}
      ports:
        - protocol: TCP
          port: 5432
{{- end }}
```

**Step 3: Full template dry-run**

Run: `helm template test infra/helm/litellm/`

Expected: All 6 resources render — ServiceAccount, ExternalSecret, ConfigMap, Deployment, Service, NetworkPolicy.

**Step 4: Full lint**

Run: `helm lint infra/helm/litellm/`

Expected: No errors, no warnings.

**Step 5: Commit**

```bash
git add infra/helm/litellm/templates/service.yaml infra/helm/litellm/templates/networkpolicy.yaml
git commit -m "feat(litellm): add Service and NetworkPolicy templates"
```

---

## Task 6: ArgoCD Application & Project Update

**Files:**
- Create: `infra/argocd/applications/litellm.yaml`
- Modify: `infra/argocd/projects/mosaic-life.yaml` (add `aiservices` namespace to destinations)

**Step 1: Create ArgoCD Application**

```yaml
# infra/argocd/applications/litellm.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: litellm
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: mosaic-life

  source:
    repoURL: https://github.com/mosaic-stories/mosaic-life
    targetRevision: main
    path: infra/helm/litellm
    helm:
      values: |
        serviceAccount:
          annotations:
            eks.amazonaws.com/role-arn: arn:aws:iam::033691785857:role/mosaic-shared-litellm-role

  destination:
    server: https://kubernetes.default.svc
    namespace: aiservices

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m

  revisionHistoryLimit: 10
```

**Step 2: Update ArgoCD project to allow `aiservices` namespace**

In `infra/argocd/projects/mosaic-life.yaml`, add `aiservices` to the destinations list.
Find the `destinations:` block (around line 18-22) and add:

```yaml
    - namespace: 'aiservices'
      server: https://kubernetes.default.svc
```

So it becomes:

```yaml
  destinations:
    - namespace: 'mosaic-*'
      server: https://kubernetes.default.svc
    - namespace: 'preview-*'
      server: https://kubernetes.default.svc
    - namespace: 'aiservices'
      server: https://kubernetes.default.svc
    - namespace: argocd
      server: https://kubernetes.default.svc
```

**Step 3: Commit**

```bash
git add infra/argocd/applications/litellm.yaml infra/argocd/projects/mosaic-life.yaml
git commit -m "feat(litellm): add ArgoCD Application and update project destinations"
```

---

## Task 7: Docker Compose Local Development

**Files:**
- Create: `infra/compose/litellm-config.yaml`
- Create: `infra/compose/init-litellm-db.sql`
- Modify: `infra/compose/docker-compose.yml` (add litellm service, add postgres init script volume)
- Modify: `infra/compose/.env.example` (add LITELLM_BASE_URL)

**Step 1: Create local LiteLLM config**

```yaml
# infra/compose/litellm-config.yaml
# Local development LiteLLM configuration
# Uses Bedrock via host AWS credentials (mounted from ~/.aws)
# For local-only testing without Bedrock, comment out models and add mock responses

model_list:
  - model_name: claude-sonnet-4-6
    litellm_params:
      model: bedrock/anthropic.claude-sonnet-4-6-20250514
  - model_name: claude-opus-4-6
    litellm_params:
      model: bedrock/anthropic.claude-opus-4-6-20250514
  - model_name: claude-haiku-4-5
    litellm_params:
      model: bedrock/anthropic.claude-haiku-4-5-20251001
  - model_name: qwen3-next-80b
    litellm_params:
      model: bedrock/qwen.qwen3-next-80b-a3b-v1:0
  - model_name: kimi-k2.5
    litellm_params:
      model: bedrock/moonshotai.kimi-k2-5-v1:0
  - model_name: voxtral-small-24b
    litellm_params:
      model: bedrock/mistral.voxtral-small-24b-2507-v1:0
  - model_name: voxtral-mini-3b
    litellm_params:
      model: bedrock/mistral.voxtral-mini-3b-2507-v1:0
  - model_name: magistral-small
    litellm_params:
      model: bedrock/mistral.magistral-small-2509-v1:0
  - model_name: mistral-large-3
    litellm_params:
      model: bedrock/mistral.mistral-large-2-v1:0
  - model_name: nova-multimodal-embeddings
    litellm_params:
      model: bedrock/amazon.nova-multimodal-embeddings-v1:0
  - model_name: whisper-large-v3-turbo
    litellm_params:
      model: bedrock/openai.whisper-large-v3-turbo-v2:0
  - model_name: llama4-maverick-17b
    litellm_params:
      model: bedrock/meta.llama4-maverick-17b-instruct-v1:0

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
  store_model_in_db: false
  disable_spend_logs: false
  proxy_batch_write_at: 10

litellm_settings:
  drop_params: true
  request_timeout: 600
  num_retries: 2
```

**Step 2: Create postgres init script**

```sql
-- infra/compose/init-litellm-db.sql
-- Creates the litellm database for local development
-- This runs automatically on first postgres container startup

SELECT 'CREATE DATABASE litellm'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'litellm')\gexec
```

**Step 3: Add litellm service to docker-compose.yml**

Add the following service block after the `neptune-local` service (before the `docs` service) in `infra/compose/docker-compose.yml`:

```yaml
  # LiteLLM AI Proxy
  litellm:
    image: ghcr.io/berriai/litellm-database:main-stable

  Execution note: the originally planned tag `main-v1.72.0` was not present in GHCR at deployment time. The implemented configuration uses `ghcr.io/berriai/litellm-database:main-stable`, which was verified to exist.
    ports:
      - "14000:4000"
    environment:
      LITELLM_MASTER_KEY: "sk-local-dev-key-1234"
      LITELLM_SALT_KEY: "sk-local-salt-key-1234"
      DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/litellm"
    volumes:
      - ./litellm-config.yaml:/app/config.yaml:ro
      # Mount AWS credentials for Bedrock access (uses host's STS credentials)
      - ~/.aws:/root/.aws:ro
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health/liveliness"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    restart: unless-stopped
```

Also add an init script volume mount to the `postgres` service to create the litellm database.
In the postgres service's `volumes:` section, add:

```yaml
      - ./init-litellm-db.sql:/docker-entrypoint-initdb.d/02-init-litellm.sql:ro
```

**Step 4: Add LITELLM_BASE_URL to .env.example**

Add the following section at the end of `infra/compose/.env.example`:

```
# ============================================================================
# LiteLLM Configuration
# ============================================================================
# LiteLLM proxy URL (for AI model routing)
LITELLM_BASE_URL=http://litellm:4000
```

**Step 5: Verify docker-compose syntax**

Run: `docker compose -f infra/compose/docker-compose.yml config --services`

Expected: Output includes `litellm` in the service list alongside core-api, web, postgres, neptune-local, docs, prerender.

**Step 6: Commit**

```bash
git add infra/compose/litellm-config.yaml infra/compose/init-litellm-db.sql infra/compose/docker-compose.yml infra/compose/.env.example
git commit -m "feat(litellm): add Docker Compose service for local development"
```

---

## Task 8: Update Core-API LITELLM_BASE_URL References

**Files:**
- Modify: `infra/helm/core-api/values.yaml:44` (update standalone chart reference)
- Modify: `infra/helm/mosaic-life/values.yaml` (add LITELLM_BASE_URL to coreApi.env)

**Step 1: Update standalone core-api chart**

In `infra/helm/core-api/values.yaml`, change line 44 from:
```yaml
  LITELLM_BASE_URL: "http://litellm:4000"
```
to:
```yaml
  LITELLM_BASE_URL: "http://litellm.aiservices.svc.cluster.local:4000"
```

**Step 2: Add LITELLM_BASE_URL to umbrella chart**

In `infra/helm/mosaic-life/values.yaml`, add a new env entry to the `coreApi.env` list (after the Neptune env vars, before the closing of the env list):

```yaml
    # LiteLLM AI Proxy
    - name: LITELLM_BASE_URL
      value: "http://litellm.aiservices.svc.cluster.local:4000"
```

**Step 3: Verify template renders correctly**

Run: `helm template test infra/helm/mosaic-life/ | grep -A 1 LITELLM`

Expected: Shows `LITELLM_BASE_URL` with value `http://litellm.aiservices.svc.cluster.local:4000`.

**Step 4: Commit**

```bash
git add infra/helm/core-api/values.yaml infra/helm/mosaic-life/values.yaml
git commit -m "feat(litellm): update core-api LITELLM_BASE_URL for cross-namespace access"
```

---

## Task 9: IAM Role Documentation (CDK in This Repo)

This task documents the IAM resources needed. These are created by the CDK app in this repository under `infra/cdk/`, not in the infrastructure repo. This task creates a runbook for the one-time setup.

**Files:**
- Create: `docs/ops/litellm-setup-runbook.md`

**Step 1: Create the setup runbook**

```markdown
# LiteLLM One-Time Setup Runbook

## Prerequisites

- AWS CLI configured with admin access
- kubectl configured for EKS cluster
- Access to Aurora PostgreSQL (via kubectl port-forward or bastion)

## 1. Create Aurora Database and User

Connect to Aurora PostgreSQL:

    kubectl run -n mosaic-prod psql-client --rm -it --image=postgres:16 -- \
      psql "postgresql://<admin-user>:<password>@<aurora-endpoint>:5432/mosaic"

Run:

    CREATE DATABASE litellm;
    CREATE USER litellm WITH PASSWORD '<generated-password>';
    GRANT ALL PRIVILEGES ON DATABASE litellm TO litellm;
    \c litellm
    GRANT ALL ON SCHEMA public TO litellm;

## 2. Create AWS Secrets Manager Secret

    aws secretsmanager create-secret \
      --name mosaic/shared/litellm/credentials \
      --region us-east-1 \
      --secret-string '{
        "master_key": "sk-litellm-<generate-with-openssl-rand-hex-32>",
        "salt_key": "sk-salt-<generate-with-openssl-rand-hex-32>",
        "db_username": "litellm",
        "db_password": "<same-password-as-step-1>",
        "db_host": "<aurora-cluster-endpoint>",
        "db_port": "5432",
        "db_name": "litellm"
      }'

## 3. Create IRSA Role

Create in the infrastructure repo (`/apps/mosaic-life-infrastructure`).

### Trust Policy

    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Federated": "arn:aws:iam::033691785857:oidc-provider/<EKS_OIDC_PROVIDER>"
          },
          "Action": "sts:AssumeRoleWithWebIdentity",
          "Condition": {
            "StringEquals": {
              "<EKS_OIDC_PROVIDER>:sub": "system:serviceaccount:aiservices:litellm",
              "<EKS_OIDC_PROVIDER>:aud": "sts.amazonaws.com"
            }
          }
        }
      ]
    }

### Permissions Policy

    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "BedrockInvoke",
          "Effect": "Allow",
          "Action": [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream"
          ],
          "Resource": "arn:aws:bedrock:us-east-1::foundation-model/*"
        },
        {
          "Sid": "BedrockGuardrails",
          "Effect": "Allow",
          "Action": [
            "bedrock:ApplyGuardrail",
            "bedrock:GetGuardrail"
          ],
          "Resource": "arn:aws:bedrock:us-east-1:033691785857:guardrail/*"
        },
        {
          "Sid": "SecretsManagerRead",
          "Effect": "Allow",
          "Action": [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret"
          ],
          "Resource": "arn:aws:secretsmanager:us-east-1:033691785857:secret:mosaic/shared/litellm/*"
        }
      ]
    }

### Create Role

    aws iam create-role \
      --role-name mosaic-shared-litellm-role \
      --assume-role-policy-document file://trust-policy.json

    aws iam put-role-policy \
      --role-name mosaic-shared-litellm-role \
      --policy-name litellm-permissions \
      --policy-document file://permissions-policy.json

## 4. Update Helm Values with Role ARN

After creating the role, update `infra/argocd/applications/litellm.yaml` with the actual role ARN:

    serviceAccount:
      annotations:
        eks.amazonaws.com/role-arn: arn:aws:iam::033691785857:role/mosaic-shared-litellm-role

## 5. Deploy

Push changes to `main` branch. ArgoCD will automatically:
1. Create the `aiservices` namespace
2. Deploy ServiceAccount, ExternalSecret, ConfigMap, Deployment, Service, NetworkPolicy
3. LiteLLM will auto-migrate its database schema on first startup

## 6. Verify

    # Check pod is running
    kubectl get pods -n aiservices

    # Check logs
    kubectl logs -n aiservices -l app.kubernetes.io/name=litellm

    # Port-forward to test
    kubectl port-forward -n aiservices svc/litellm 4000:4000

    # Test health
    curl http://localhost:4000/health/liveliness

    # Test model list (requires master key)
    curl -H "Authorization: Bearer sk-litellm-..." http://localhost:4000/v1/models
```

**Step 2: Commit**

```bash
git add docs/ops/litellm-setup-runbook.md
git commit -m "docs(litellm): add one-time setup runbook for Aurora, Secrets Manager, and IRSA"
```

---

## Task 10: Final Validation & Documentation Update

**Files:**
- Modify: `CLAUDE.md` (update LiteLLM references from "deferred" to "deployed")

**Step 1: Full Helm lint**

Run: `helm lint infra/helm/litellm/`

Expected: No errors, no warnings.

**Step 2: Full template render**

Run: `helm template litellm infra/helm/litellm/ --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::033691785857:role/mosaic-shared-litellm-role --namespace aiservices > /tmp/litellm-rendered.yaml`

Review the output file to verify all 6 resources render correctly.

**Step 3: Docker compose validation**

Run: `docker compose -f infra/compose/docker-compose.yml config --services`

Expected: Includes `litellm` service.

**Step 4: Update CLAUDE.md**

In `CLAUDE.md`, find the line (around line 30):
```
- ❌ LiteLLM proxy (direct OpenAI/Anthropic calls in Phase 3)
```

Replace with:
```
- ✅ LiteLLM proxy (deployed in `aiservices` namespace, Bedrock models configured)
```

Also in `CLAUDE.md`, in the "Local Environment" section (around the services/ports list), add:
```
- LiteLLM Proxy: http://localhost:14000
```

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect LiteLLM deployment status"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Helm chart scaffold | Chart.yaml, values.yaml, _helpers.tpl |
| 2 | ServiceAccount & ExternalSecret | serviceaccount.yaml, external-secret.yaml |
| 3 | ConfigMap with model config | configmap.yaml |
| 4 | Deployment template | deployment.yaml |
| 5 | Service & NetworkPolicy | service.yaml, networkpolicy.yaml |
| 6 | ArgoCD Application & project update | litellm.yaml, mosaic-life.yaml |
| 7 | Docker Compose local dev | litellm-config.yaml, init-litellm-db.sql, docker-compose.yml |
| 8 | Core-API URL updates | core-api values.yaml, mosaic-life values.yaml |
| 9 | Setup runbook | litellm-setup-runbook.md |
| 10 | Final validation & docs | CLAUDE.md |

**Pre-requisites (done manually before first deploy):** Aurora database, Secrets Manager secret, IRSA role (see Task 9 runbook).
