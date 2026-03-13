# Graph Explorer Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate AWS Graph Explorer into the Mosaic Life platform for visual Neptune graph exploration, running locally in Docker Compose and in cluster as a single standalone production ArgoCD-managed deployment via kubectl port-forward.

**Architecture:** Graph Explorer (public ECR image) connects directly to local Gremlin Server in development, and uses its built-in SigV4 proxy for IAM-authenticated Neptune access in cluster. A dedicated IRSA role in the observability namespace provides credentials. ArgoCD renders a standalone production chart from this repo with prod values from the GitOps repo. No Ingress — access via kubectl port-forward only.

**Tech Stack:** Docker Compose, Helm, AWS CDK (IAM/IRSA), External Secrets, ArgoCD

**Design doc:** `docs/plans/2026-03-13-graph-explorer-integration-design.md`

**Status:** In progress (2026-03-13). Local smoke test blocked by pre-existing neptune-local container issue (sed config file busy).

| Task | Status | Commit |
|------|--------|--------|
| 1. Docker Compose | Done | `d755099` |
| 2-7. Helm Chart | In progress | |
| 8. ArgoCD standalone app | In progress | |
| 9. GitOps values | In progress | |
| 10. CDK IRSA Role | Done | `9a5e7e3` |
| 11. Docs and helper commands | In progress | |
| 12. Final Validation | Pending | |

---

### Task 1: Docker Compose — Add Graph Explorer Service

**Files:**
- Modify: `infra/compose/docker-compose.yml`

**Step 1: Add the graph-explorer service to docker-compose.yml**

Add the following service block after the `prerender` service, before the `volumes:` section:

```yaml
  # Graph Explorer - Visual Neptune/Gremlin graph exploration UI
  graph-explorer:
    image: public.ecr.aws/neptune/graph-explorer:latest
    profiles: [tools]
    ports:
      - "18080:80"
    environment:
      HOST: localhost
      PROXY_SERVER_HTTPS_CONNECTION: "false"
      GRAPH_EXP_HTTPS_CONNECTION: "false"
      GRAPH_TYPE: gremlin
      PUBLIC_OR_PROXY_ENDPOINT: "http://localhost:18080"
      USING_PROXY_SERVER: "false"
      GRAPH_CONNECTION_URL: "http://neptune-local:8182"
    depends_on:
      neptune-local:
        condition: service_healthy
    restart: unless-stopped
```

**Step 2: Validate the compose file parses correctly**

Run: `docker compose -f infra/compose/docker-compose.yml config --quiet`
Expected: No output (success, no parse errors)

**Step 3: Commit**

```bash
git add infra/compose/docker-compose.yml
git commit -m "feat: add Graph Explorer to Docker Compose stack (profile: tools)"
```

---

### Task 2: Helm Chart — Create `_helpers.tpl`

**Files:**
- Create: `infra/helm/graph-explorer/templates/_helpers.tpl`

**Step 1: Create the helpers template**

Model after `infra/helm/litellm/templates/_helpers.tpl` but with `graph-explorer` naming:

```yaml
{{/*
Expand the name of the chart.
*/}}
{{- define "graph-explorer.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "graph-explorer.fullname" -}}
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
{{- define "graph-explorer.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "graph-explorer.labels" -}}
helm.sh/chart: {{ include "graph-explorer.chart" . }}
{{ include "graph-explorer.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "graph-explorer.selectorLabels" -}}
app.kubernetes.io/name: {{ include "graph-explorer.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: graph-explorer
{{- end }}
```

**Step 2: Commit**

```bash
git add infra/helm/graph-explorer/templates/_helpers.tpl
git commit -m "feat: add Graph Explorer Helm chart helpers template"
```

---

### Task 3: Helm Chart — Create `Chart.yaml` and `values.yaml`

**Files:**
- Create: `infra/helm/graph-explorer/Chart.yaml`
- Create: `infra/helm/graph-explorer/values.yaml`

**Step 1: Create Chart.yaml**

```yaml
apiVersion: v2
name: graph-explorer
description: AWS Graph Explorer - Visual graph database exploration UI for Neptune
type: application
version: 1.0.0
appVersion: "3.0.0"
keywords:
  - graph-explorer
  - neptune
  - gremlin
  - observability
home: https://github.com/mosaic-stories/mosaic-life
sources:
  - https://github.com/mosaic-stories/mosaic-life
  - https://github.com/aws/graph-explorer
maintainers:
  - name: Mosaic Life Team
    email: team@mosaiclife.me
```

**Step 2: Create values.yaml**

```yaml
image:
  repository: public.ecr.aws/neptune/graph-explorer
  tag: "3.0.0"
  pullPolicy: IfNotPresent

replicaCount: 1

service:
  type: ClusterIP
  port: 80

serviceAccount:
  create: true
  name: graph-explorer
  annotations:
    eks.amazonaws.com/role-arn: "arn:aws:iam::033691785857:role/mosaic-shared-graph-explorer-role"

# Graph Explorer environment configuration
# See: https://github.com/aws/graph-explorer/blob/main/docs/references/default-connection.md
env:
  # Disable HTTPS — traffic stays inside the cluster, accessed via kubectl port-forward
  HOST: "localhost"
  PROXY_SERVER_HTTPS_CONNECTION: "false"
  GRAPH_EXP_HTTPS_CONNECTION: "false"

  # Graph connection settings
  GRAPH_TYPE: "gremlin"
  USING_PROXY_SERVER: "true"
  IAM: "true"
  AWS_REGION: "us-east-1"
  SERVICE_TYPE: "neptune-db"

  # PUBLIC_OR_PROXY_ENDPOINT is the URL users hit (via port-forward)
  PUBLIC_OR_PROXY_ENDPOINT: "http://localhost:18080"

  # Timeouts and limits
  GRAPH_EXP_FETCH_REQUEST_TIMEOUT: "240000"
  GRAPH_EXP_NODE_EXPANSION_LIMIT: "500"

# Neptune connection — GRAPH_CONNECTION_URL is built from the external secret
neptune:
  # Secrets Manager key containing Neptune connection metadata
  secretKey: "mosaic/prod/neptune/connection"

# External Secrets configuration
externalSecrets:
  enabled: true
  refreshInterval: "1h"
  secretStoreName: aws-secretsmanager
  secretStoreKind: ClusterSecretStore

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi

podSecurityContext:
  runAsNonRoot: false
  seccompProfile:
    type: RuntimeDefault

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
```

**Step 3: Commit**

```bash
git add infra/helm/graph-explorer/Chart.yaml infra/helm/graph-explorer/values.yaml
git commit -m "feat: add Graph Explorer Helm chart metadata and values"
```

---

### Task 4: Helm Chart — Create `serviceaccount.yaml`

**Files:**
- Create: `infra/helm/graph-explorer/templates/serviceaccount.yaml`

**Step 1: Create the service account template**

Model after `infra/helm/litellm/templates/serviceaccount.yaml`:

```yaml
{{- if .Values.serviceAccount.create }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.serviceAccount.name }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "graph-explorer.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
```

**Step 2: Commit**

```bash
git add infra/helm/graph-explorer/templates/serviceaccount.yaml
git commit -m "feat: add Graph Explorer service account template with IRSA"
```

---

### Task 5: Helm Chart — Create `external-secret.yaml`

**Files:**
- Create: `infra/helm/graph-explorer/templates/external-secret.yaml`

**Step 1: Create the external secret template**

This pulls Neptune host and port from Secrets Manager and constructs the `GRAPH_CONNECTION_URL`:

```yaml
{{- if .Values.externalSecrets.enabled }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: neptune-connection-graph-explorer
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "graph-explorer.labels" . | nindent 4 }}
spec:
  refreshInterval: {{ .Values.externalSecrets.refreshInterval }}
  secretStoreRef:
    name: {{ .Values.externalSecrets.secretStoreName }}
    kind: {{ .Values.externalSecrets.secretStoreKind }}
  target:
    name: neptune-connection-graph-explorer
    creationPolicy: Owner
    template:
      engineVersion: v2
      data:
        GRAPH_CONNECTION_URL: "https://{{ "{{ .host }}" }}:{{ "{{ .port }}" }}"
  data:
    - secretKey: host
      remoteRef:
        key: {{ .Values.neptune.secretKey }}
        property: host
    - secretKey: port
      remoteRef:
        key: {{ .Values.neptune.secretKey }}
        property: port
{{- end }}
```

**Step 2: Commit**

```bash
git add infra/helm/graph-explorer/templates/external-secret.yaml
git commit -m "feat: add Graph Explorer external secret for Neptune connection"
```

---

### Task 6: Helm Chart — Create `deployment.yaml`

**Files:**
- Create: `infra/helm/graph-explorer/templates/deployment.yaml`

**Step 1: Create the deployment template**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "graph-explorer.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "graph-explorer.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "graph-explorer.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "graph-explorer.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ .Values.serviceAccount.name }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: graph-explorer
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 80
              protocol: TCP
          env:
            {{- range $key, $value := .Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- if .Values.externalSecrets.enabled }}
            - name: GRAPH_CONNECTION_URL
              valueFrom:
                secretKeyRef:
                  name: neptune-connection-graph-explorer
                  key: GRAPH_CONNECTION_URL
            {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
```

**Step 2: Commit**

```bash
git add infra/helm/graph-explorer/templates/deployment.yaml
git commit -m "feat: add Graph Explorer deployment template"
```

---

### Task 7: Helm Chart — Create `service.yaml`

**Files:**
- Create: `infra/helm/graph-explorer/templates/service.yaml`

**Step 1: Create the service template**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "graph-explorer.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "graph-explorer.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: 80
      protocol: TCP
      name: http
  selector:
    {{- include "graph-explorer.selectorLabels" . | nindent 4 }}
```

**Step 2: Commit**

```bash
git add infra/helm/graph-explorer/templates/service.yaml
git commit -m "feat: add Graph Explorer service template"
```

---

### Task 8: Validate Helm Chart

**Files:**
- Read: `infra/helm/graph-explorer/` (all files)

**Step 1: Lint the Helm chart**

Run: `helm lint infra/helm/graph-explorer/`
Expected: `1 chart(s) linted, 0 chart(s) failed`

**Step 2: Template the chart to verify rendered output**

Run: `helm template graph-explorer infra/helm/graph-explorer/ --namespace observability`
Expected: Valid YAML output containing Deployment, Service, ServiceAccount, and ExternalSecret resources. Verify:
- Deployment env vars include all `.Values.env` entries plus `GRAPH_CONNECTION_URL` from secret
- ServiceAccount has IRSA annotation
- ExternalSecret references `mosaic/prod/neptune/connection`
- Service targets port 80

**Step 3: Commit any fixes if needed**

---

### Task 9: CDK — Add Graph Explorer IRSA Role

**Files:**
- Modify: `infra/cdk/lib/neptune-database-stack.ts`

**Step 1: Add the Graph Explorer IRSA role**

Add the following block after the `for (const environment of environments)` loop closes (after line 191, before the `// Shared Outputs` section):

```typescript
    // ============================================================
    // Graph Explorer IRSA Role (observability namespace)
    // ============================================================
    const graphExplorerRole = new iam.Role(this, 'GraphExplorerAccessRole', {
      roleName: 'mosaic-shared-graph-explorer-role',
      description: 'IAM role for Graph Explorer to access Neptune via IRSA',
      assumedBy: new iam.FederatedPrincipal(
        `arn:aws:iam::${this.account}:oidc-provider/oidc.eks.${this.region}.amazonaws.com/id/${clusterId}`,
        {
          StringEquals: {
            [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:sub`]:
              'system:serviceaccount:observability:graph-explorer',
            [`oidc.eks.${this.region}.amazonaws.com/id/${clusterId}:aud`]:
              'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    graphExplorerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['neptune-db:connect'],
      resources: [
        `arn:aws:neptune-db:${this.region}:${this.account}:${this.dbCluster.clusterResourceIdentifier}/*`,
      ],
    }));

    new cdk.CfnOutput(this, 'GraphExplorerRoleArn', {
      value: graphExplorerRole.roleArn,
      description: 'IAM role ARN for Graph Explorer Neptune access',
      exportName: 'mosaic-shared-graph-explorer-role-arn',
    });
```

**Step 2: Verify CDK synth succeeds**

Run: `cd infra/cdk && npx cdk synth --quiet 2>&1 | tail -5`
Expected: Successful synthesis with no errors.

Note: This may fail locally if AWS credentials or CDK context are not configured. If so, verify the TypeScript compiles:

Run: `cd infra/cdk && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add infra/cdk/lib/neptune-database-stack.ts
git commit -m "feat: add Graph Explorer IRSA role for Neptune access"
```

---

### Task 10: Update CLAUDE.md — Add Graph Explorer Port

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add Graph Explorer to the local environment ports section**

Find the `**Services and Ports:**` section in CLAUDE.md and add Graph Explorer:

```
- Graph Explorer: http://localhost:18080 (via docker compose --profile tools)
```

Add it after the Neptune entry.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Graph Explorer port to CLAUDE.md local environment section"
```

---

### Task 11: Local Smoke Test

**Files:**
- Read: `infra/compose/docker-compose.yml` (verify service definition)

**Step 1: Start the Graph Explorer locally**

Run: `docker compose -f infra/compose/docker-compose.yml --profile tools up -d graph-explorer`
Expected: `graph-explorer` container starts alongside `neptune-local`

**Step 2: Wait for services to be ready and verify Graph Explorer is accessible**

Run: `sleep 10 && curl -s -o /dev/null -w "%{http_code}" http://localhost:18080/explorer`
Expected: `200` (or `301`/`302` redirect to the explorer UI)

**Step 3: Verify connection to local Gremlin Server**

Open `http://localhost:18080/explorer` in a browser and confirm:
- The UI loads without SSL warnings (HTTPS disabled)
- You can add/see a connection to the local Gremlin Server

**Step 4: Tear down**

Run: `docker compose -f infra/compose/docker-compose.yml --profile tools down`
Expected: Containers stop cleanly.

---

### Task 12: Final Validation and Summary Commit

**Step 1: Verify all files are committed**

Run: `git status`
Expected: Clean working tree.

**Step 2: Review the full diff**

Run: `git log --oneline -10`
Expected: Commits for each task above.

**Step 3: Note for production deployment**

The following must happen after merging to `main`:
1. CDK deploy runs automatically via GitHub Actions (`cdk-deploy.yml`) — creates the IRSA role
2. ArgoCD Application for `graph-explorer` must be added to the GitOps repo (manual step, external to this repo)
3. Verify `ClusterSecretStore` named `aws-secretsmanager` is accessible from the `observability` namespace
4. Test with: `kubectl port-forward svc/graph-explorer 18080:80 -n observability` then open `http://localhost:18080/explorer`
