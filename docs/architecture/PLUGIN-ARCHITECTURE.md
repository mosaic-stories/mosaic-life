# Plugin Architecture (Backend Microservice + Frontend UI)

**Primary target:** Kubernetes (Helm-only deployments).
**Local dev:** Docker Compose.
**Integration style:** Frontend Module Federation (Pattern A).
**Execution model:** Out‑of‑process backend plugin microservices (Python), decoupled UI bundles (TypeScript).

> **⚠️ Architecture Evolution:** This document describes the **target plugin architecture** for Mosaic Life. For MVP development, plugin functionality is currently integrated into the Core API service. The plugin contracts and SDK are being designed to enable future extraction into independent microservices.

---

## 1) Goals & Non‑Goals

### Goals

* Enable third parties to extend the product by shipping a **versioned unit** containing:

  1. a **backend microservice** (HTTP/gRPC) and 2) a **frontend UI** (Module Federation remote).
* Ensure **fault/dep isolation**, **independent scaling**, and **capability‑based security**.
* Keep core stable via a **narrow, versioned Plugin SDK** (Python + TypeScript).
* Provide a **repeatable, Helm‑only** deploy story—no custom operators initially.
* Provide first‑class **DX**: manifest, templates, contract tests, and a compose harness.

### Non‑Goals

* In‑process plugin execution (only narrow core micro‑hooks may exist in the future).
* Cluster‑level CRDs/operators (can be revisited once ecosystem matures).

---

## 2) Vocabulary & Concepts

* **Plugin**: A deployable bundle that contains one backend service and one UI remote. Shipped and versioned as a single unit (one SemVer).
* **Core**: The host application that loads UI remotes and talks to plugin services through a stable SDK/contract.
* **Plugin SDK**: Minimal, stable surfaces to interact with the core.

  * `mosaiclife-plugin-sdk` (Python) for backend.
  * `@mosaiclife/plugin-sdk` (TypeScript) for frontend.
* **Manifest (`plugin.yaml`)**: Machine‑readable description of capabilities, config schema, endpoints, and compatibility.
* **Capabilities**: Least‑privilege permissions a plugin requests (e.g., `http:outbound`, `events:publish`, `db:read`).

---

## 3) High‑Level Architecture

```
+------------------+               +---------------------------+
|      CORE        | <---HTTP--->  |  Plugin Backend Service   |
|  (API + WebApp)  |               |  (Python, container)      |
|                  |  (MF) load    |  - /healthz  /metrics     |
|  - Loads UI      |<--------------+  - /manifest /register    |
|    remotes       |   remoteEntry |  - Plugin APIs            |
|  - Calls plugin  |               +---------------------------+
|    APIs via SDK  |
+------------------+
```

* **UI**: Core dynamically loads `remoteEntry.js` at runtime (Module Federation).
* **Backend**: Core communicates with plugin over HTTP (JSON) or gRPC (optional), using a stable contract and capability scoping.
* **Discovery**: Helm install exposes the service; plugin **registers** itself with core on start (see §10).

---

## 4) Extension Points (Initial Set)

Back‑end:

* **Jobs**: background tasks & schedules (cron‑like), exposed via plugin API and registered with the core scheduler.
* **Webhooks/Integrations**: inbound endpoints the core can route to, outbound calls gated by capabilities.
* **Data Providers**: fetch/transform domain records for the core.

Front‑end:

* **Routes/Pages** (e.g., `/plugins/<id>`)
* **Panels/Widgets** (mount/unmount lifecycle)
* **Command Palette / Context Menus**

> Each contribution point has a typed contract and lifecycle (register → ready → dispose).

---

## 5) Versioning & Compatibility

* **One SemVer** for the plugin (covers backend image, UI build, Helm chart): `MAJOR.MINOR.PATCH`.
* Manifest declares **core compatibility**:

  ```yaml
  compat:
    core: ">=2.1 <3.0"   # semver range
    backend_sdk: ">=1.4 <2.0"
    frontend_sdk: ">=1.2 <2.0"
  ```
* Core performs a **compat check** at registration time; incompatible plugins are rejected with a precise reason.

---

## 6) Packaging & Distribution

* Each release publishes:

  1. **Backend image**: `registry.io/yourorg/<plugin-name>:<version>`
  2. **UI remote**: served by the plugin container *or* uploaded to a CDN and referenced by URL
  3. **Helm chart** (OCI‑pushed) that wires service, env, NetworkPolicy, probes
  4. **Manifest (`plugin.yaml`)**, SBOM, checksums; optional **cosign** signatures

Recommended repo layout (plugin author):

```
plugin-<name>/
  backend/                # Python service
  ui/                     # TypeScript MF remote
  chart/                  # Helm chart
  plugin.yaml             # Manifest (source of truth for compat, capabilities)
  Makefile / justfile
```

---

## 7) Frontend Integration: Module Federation (Pattern A)

### 7.1 Remote exposure (plugin side)

* Build the UI as a MF remote exposing components/pages:

  ```js
  // ui/webpack.config.js (conceptual)
  new ModuleFederationPlugin({
    name: "plugin_<name>",
    filename: "remoteEntry.js",
    exposes: {
      "./Panel": "./src/panel.tsx",
      "./Routes": "./src/routes.tsx"
    },
    shared: { react: { singleton: true }, "react-dom": { singleton: true } }
  })
  ```
* Serve `remoteEntry.js` from the plugin container (e.g., `/mf/remoteEntry.js`).

### 7.2 Dynamic loading (core side)

* Core loads and registers the remote at runtime (example):

  ```ts
  // core/runtime-register.ts
  import { registerRemote } from "@mosaiclife/plugin-sdk";

  await registerRemote({
    id: "analytics",
    url: "https://plugin-analytics.svc.cluster.local/mf/remoteEntry.js",
    contributions: ["panel", "routes"],
    integrity: undefined // optional SRI hash if using CDN
  });
  ```

### 7.3 UI contracts

* **Panels**: `{ id, title, mount(el, ctx), unmount() }`
* **Routes**: `{ path, element: React.ComponentType }`
* **Error boundaries**: Core wraps each contribution in an error boundary.
* **CSP**: Only allow MF URLs declared via manifest/Helm; disallow `eval`.

---

## 8) Backend Microservice Shape

### 8.1 Transport

* Default **HTTP+JSON**. gRPC is optional for advanced plugins.
* **Timeouts**: Core sets client timeouts; plugin must complete within SLA or return 504‑style errors.

### 8.2 Required endpoints

```
GET  /healthz          # liveness (200 OK)
GET  /readyz           # readiness: checks deps, UI bundle availability
GET  /metrics          # Prometheus metrics
GET  /manifest         # returns plugin.yaml as JSON (normalized schema)
POST /register         # optional: self‑registration with core (token‑gated)
```

### 8.3 Example plugin API (custom)

```
POST /v1/jobs/run            # trigger a job
GET  /v1/data/items          # list provider items
POST /v1/webhooks/ingest     # optional inbound webhook
```

### 8.4 Auth

* **Bearer token** issued by core and mounted as a K8s secret; plugin calls core with it during `/register`.
* Optional **mTLS** via mesh or ingress‑gateway policy.

### 8.5 Logging & Tracing

* JSON logs with fields: `timestamp, level, plugin.name, plugin.version, trace_id, span_id, msg`.
* **OpenTelemetry** HTTP propagation (W3C tracecontext). Expose `/metrics` for Prometheus.

---

## 9) Manifest (`plugin.yaml`)

### 9.1 Example

```yaml
name: analytics
version: 1.4.2
compat:
  core: ">=2.1 <3.0"
  backend_sdk: ">=1.4 <2.0"
  frontend_sdk: ">=1.2 <2.0"
capabilities:
  - http:outbound
  - events:publish
ui:
  mode: ModuleFederation
  remotePath: "/mf/remoteEntry.js"   # path served by backend service
  contributions:
    panels:
      - id: analytics.panel
        title: Analytics
    routes:
      - path: "/analytics"
        component: "Routes#AnalyticsPage"
endpoints:
  basePath: "/v1"
health:
  livenessPath: "/healthz"
  readinessPath: "/readyz"
configSchema:
  type: object
  additionalProperties: false
  properties:
    LOG_LEVEL: { type: string, enum: ["debug","info","warn","error"], default: "info" }
    API_TIMEOUT_MS: { type: integer, minimum: 100, default: 5000 }
secrets:
  - ANALYTICS_API_KEY
permissions:
  network:
    egressAllow:
      - "core.svc.cluster.local:80"
      - "core.svc.cluster.local:443"
```

### 9.2 Validation

* The core and CI both validate manifest against a **JSON Schema** (kept in the SDK repos). Builds fail on mismatch.

---

## 10) Registration Handshake (Helm‑only environment)

1. **Deploy via Helm** (plugin chart). Service becomes reachable inside the cluster.
2. Plugin **waits for core** (`CORE_BASE_URL` env) and performs a `POST /api/plugins/register` with:

   * its **normalized manifest JSON** (from `/manifest`),
   * **UI remote URL** the core should load (e.g., `http(s)://<svc>/mf/remoteEntry.js`),
   * **auth token** from Secret.
3. **Core validates** compatibility & capabilities; if approved, it stores the plugin record and loads the UI remote.
4. **Health gating**: Routing/UI exposure is activated only after plugin `/readyz` is green and `remoteEntry.js` responds.

> If self‑registration isn’t desired, the core can accept a **static plugins config** (Helm values) with the same fields.

---

## 11) Kubernetes (Helm‑Only) Deployment

### 11.1 Chart Requirements

* **Deployment** (labels include `plugin.name`, `plugin.version`)
* **Service** (ClusterIP; exposes app port and MF path)
* **ServiceAccount + Role/RoleBinding** (least privilege; usually none beyond read config)
* **NetworkPolicy** (default deny egress; allow to core + approved external hosts)
* **ConfigMap** (non‑secret config) & **Secret** (token, API keys)
* **Probes** (`/healthz`, `/readyz`)
* **Optional**: HPA, Ingress (if MF served via public CDN, ingress not required)

### 11.2 Minimal Helm values (example)

```yaml
image:
  repo: registry.io/yourorg/analytics
  tag: 1.4.2
service:
  port: 7001
ui:
  remotePath: /mf/remoteEntry.js
core:
  baseURL: https://core.svc.cluster.local
  registrationSecretName: plugin-reg-token-analytics
resources:
  requests: { cpu: 100m, memory: 256Mi }
  limits:   { cpu: 1,    memory: 1Gi }
autoscaling:
  enabled: false
networkPolicy:
  enabled: true
  egressAllow:
    - core.svc.cluster.local:443
```

### 11.3 Snippets

**Deployment excerpt**

```yaml
containers:
  - name: backend
    image: "{{ .Values.image.repo }}:{{ .Values.image.tag }}"
    ports: [{ containerPort: {{ .Values.service.port }} }]
    env:
      - name: CORE_BASE_URL
        value: "{{ .Values.core.baseURL }}"
      - name: UI_REMOTE_PATH
        value: "{{ .Values.ui.remotePath }}"
      - name: REG_TOKEN
        valueFrom:
          secretKeyRef:
            name: {{ .Values.core.registrationSecretName }}
            key: token
    readinessProbe:
      httpGet: { path: "/readyz", port: {{ .Values.service.port }} }
    livenessProbe:
      httpGet: { path: "/healthz", port: {{ .Values.service.port }} }
```

**NetworkPolicy (default‑deny + allow core)**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "plugin.fullname" . }}
spec:
  podSelector: { matchLabels: { app: {{ include "plugin.fullname" . }} } }
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector: { matchLabels: { name: core } }
          podSelector: { matchLabels: { app: core-api } }
      ports: [{ protocol: TCP, port: 443 }]
```

**Service (exposes MF path via same port)**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "plugin.fullname" . }}
spec:
  selector: { app: {{ include "plugin.fullname" . }} }
  ports:
    - name: http
      port: 80
      targetPort: {{ .Values.service.port }}
```

---

## 12) Local Development (Docker Compose)

* Provide `docker-compose.plugin.yml` that runs: core, plugin backend, and UI dev server.
* Core loads the remote from `http://ui:7002/remoteEntry.js` (hot reload).

```yaml
services:
  core:
    image: yourorg/core:dev
    environment:
      - PLUGIN_REMOTE_URL=http://ui:7002/remoteEntry.js
      - PLUGIN_BACKEND_URL=http://plugin:7001
    ports: ["8080:8080"]
    depends_on: [plugin, ui]
  plugin:
    build: ./backend
    environment:
      - CORE_BASE_URL=http://core:8080
    ports: ["7001:7001"]
    volumes:
      - ./backend:/app
  ui:
    working_dir: /app
    build: ./ui
    command: ["pnpm","run","start"]
    ports: ["7002:7002"]
    volumes:
      - ./ui:/app
```

---

## 13) Security Model

* **Capabilities**: Grant only what’s requested in `plugin.yaml`. Map capabilities to SDK surfaces (e.g., `http:outbound` → allowlisted egress via core proxy, rate‑limited).
* **Secrets**: Managed via K8s Secrets/External Secrets; never baked into images.
* **Image trust**: Optionally enforce cosign verification policy on cluster.
* **CSP**: Allow only declared MF origins; forbid inline scripts/eval.
* **AuthZ**: Backend endpoints behind core‑issued Bearer token; per‑tenant scoping added by core when calling plugin.

---

## 14) Observability & SLOs

* **Metrics**: Prometheus (/metrics). Required counters/histograms: request count/duration, error count, queue depth, memory, CPU.
* **Tracing**: Propagate tracecontext; emit spans for each incoming request and outbound call.
* **Logs**: JSON lines, structured (see §8.5). Sample at high volume.
* **Dashboards**: Provide a default Grafana dashboard JSON with the chart.
* **SLOs** (defaults):

  * Availability: 99.5% monthly
  * p95 latency for control endpoints: < 200ms intra‑cluster

---

## 15) SDK Surfaces (Contracts)

### 15.1 Backend (Python) — `yourapp-plugin-sdk`

```python
class CoreClient:
    def __init__(self, base_url: str, token: str): ...
    def publish_event(self, topic: str, payload: dict) -> None: ...
    def register_job(self, spec: dict) -> None: ...
    def fetch_secret(self, name: str) -> str: ...

class PluginApp:
    name: str
    version: str
    def on_start(self, core: CoreClient) -> None: ...
    def on_stop(self) -> None: ...
```

### 15.2 Frontend (TypeScript) — `@mosaiclife/plugin-sdk`

```ts
export type Panel = {
  id: string;
  title: string;
  mount: (el: HTMLElement, ctx: { sdk: SDK; tenantId: string }) => void;
  unmount: () => void;
};

export interface SDK {
  events: { subscribe(topic: string, handler: (msg: any) => void): () => void };
  http: { get<T>(path: string): Promise<T> };
  ui: { registerPanel(p: Panel): void; registerRoute(r: { path: string; element: any }): void };
}
```

---

## 16) Lifecycle & Health

* **States**: `Installed → Registering → Ready → Degraded → Disabled`.
* **Probes**:

  * `/healthz` = process liveness only.
  * `/readyz` = deps + MF remote reachable.
* **Kill switch**: Core can disable a plugin; UI removed and traffic blocked; Helm left intact or scaled to 0 by admin.

---

## 17) Upgrades & Rollback

* **Helm upgrade** with a single version (backend + UI). Post‑deploy check pulls `remoteEntry.js` and pings `/readyz`.
* Rollback by Helm; core unloads prior to rollback and reloads after health is green.
* For cautious rollouts, use namespace‑scoped **canary** values (two releases) controlled manually (still Helm‑only).

---

## 18) Testing & CI/CD

* **Contract tests**: Validate `/manifest`, `/readyz`, metrics shape, and UI contributions load in a headless core harness.
* **Security tests**: Lint NetworkPolicy/RBAC; dependency scans (pip/npm).
* **Release pipeline**:

  1. Build backend image (multi‑arch) + SBOM
  2. Build UI remote (content‑addressed)
  3. Template Helm chart with exact version + MF URL
  4. Validate manifest schema
  5. Spin up ephemeral k8s (kind) → run contract tests
  6. Push images/chart (OCI) and **sign**

---

## 19) Author Checklist (Summary)

* [ ] One SemVer for backend+UI+chart
* [ ] `plugin.yaml` complete and schema‑valid
* [ ] `/healthz`, `/readyz`, `/metrics`, `/manifest` implemented
* [ ] UI remote exposes required contributions; loads via MF
* [ ] Helm chart includes NetworkPolicy, probes, labels, resources
* [ ] Secrets externalized
* [ ] Logs/metrics/traces compliant
* [ ] Contract tests green in CI

---

## 20) Future Extensions (Not in v1)

* **Operator + CRD**: Move Helm logic into a `Plugin` controller for richer policy and automated rollouts.
* **gRPC standardization**: Shared protobufs for higher performance control planes.
* **Sandboxing**: Strong isolation for untrusted UI via iframes with strict CSP; WASM for compute.

---

### Appendix A — Minimal `plugin.yaml` JSON Schema (excerpt)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["name", "version", "compat", "ui", "endpoints", "health"],
  "properties": {
    "name": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "version": { "type": ["string", "number"] },
    "compat": {
      "type": "object",
      "properties": {
        "core": { "type": "string" },
        "backend_sdk": { "type": "string" },
        "frontend_sdk": { "type": "string" }
      },
      "required": ["core"]
    },
    "capabilities": { "type": "array", "items": { "type": "string" } },
    "ui": {
      "type": "object",
      "properties": {
        "mode": { "const": "ModuleFederation" },
        "remotePath": { "type": "string" },
        "contributions": { "type": "object" }
      },
      "required": ["mode", "remotePath"]
    },
    "endpoints": {
      "type": "object",
      "properties": { "basePath": { "type": "string" } },
      "required": ["basePath"]
    },
    "health": {
      "type": "object",
      "properties": {
        "livenessPath": { "type": "string" },
        "readinessPath": { "type": "string" }
      },
      "required": ["livenessPath", "readinessPath"]
    }
  }
}
```
