# Frontend Architecture

**Platform focus:** Web (desktop & mobile web first), future mobile app.
**Auth:** OIDC via Backend-for-Frontend (BFF) + httpOnly cookies.
**Extensibility:** Module Federation (runtime-loaded plugin remotes).
**Design system:** Token-driven, themeable, accessible.
**Deploy:** Kubernetes (Helm-only). CDN optional later.

> **⚠️ Architecture Evolution:** This document describes the **target architecture** for the Mosaic Life frontend. For MVP development, we are currently implementing a simplified version without Module Federation plugins and with basic auth integration. The current MVP focuses on core user flows and story management features.

---

## 1) Objectives & Principles

* **Modern, responsive, appealing** UI with fast, reliable interactions.
* **Extensible by plugins** without rebuilding the core app.
* **Secure-by-default:** strict CSP, sanitization, least-privilege APIs.
* **Stateless web tier** so UI instances can scale horizontally; sessions live in BFF.
* **Great DX:** typed contracts, storybook, hot reload, test harnesses.
* **Performance budgets** and observability from day one.

---

## 2) App Topology & Major Decisions

* **Framework:** React + TypeScript.
* **Build:** **Vite** for rapid iterations and Module Federation. If SEO for the public landing becomes critical later, spin up a separate **Next.js** marketing site; the app shell remains Vite.
* **Routing:** React Router; authenticated routes gated by BFF cookies.
* **State:** TanStack Query for server-cache + a light local store (Zustand) for UI state. Avoid global stores for everything.
* **Data contracts:** OpenAPI/JSON Schema → codegen TS types & clients (see API-DESIGN.md). One shared types package for cross-app primitives (IDs, enums, ACLs).
* **Streaming:** **SSE** first for incremental outputs; use WebSocket later for bidirectional chat/presence.
* **Ingress (SSE hints):** For NGINX Ingress, set `nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"`, `nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"`, and `nginx.ingress.kubernetes.io/proxy-buffering: "off"` on SSE endpoints.

---

## 3) AuthN/AuthZ UX (via BFF)

* **OIDC code + PKCE**: frontend redirects to IdP; BFF exchanges code, issues **httpOnly** cookies (SameSite=Lax).
* **Session refresh:** handled by BFF; UI reads auth state via a `/me` endpoint (see API-DESIGN.md for auth flow).
* **Route guards:** unauthenticated users see landing/marketing; authenticated get app shell.
* **CSRF protection:** Origin checks + double-submit token for unsafe methods.
* **Single-tenant context:** no tenant switcher; requests carry only user/session context. Keep internal APIs ready to accept a `tenant_id` later without breaking clients.

---

## 4) Extensibility: Module Federation (Pattern A)

### 4.1 Remote loading

* Core app dynamically registers MF remotes declared by backend/manifest: `remoteEntry.js` served from plugin service or CDN later.
* Only allow **pre-approved origins**; gate by manifest + capability review.

### 4.2 Contribution points

* **Routes/Pages** (e.g., `/plugins/<id>`)
* **Panels/Widgets** (mount/unmount lifecycle)
* **Commands/Context menus**
* **Settings tabs**

### 4.3 Plugin SDK (UI)

* Small API for: events bus (pub/sub), HTTP client (scoped), theme tokens, registration helpers.
* **Error Boundaries** wrap every plugin mount; slow or failing plugins degrade gracefully.

### 4.4 Isolation options

* Default MF in-process. For untrusted/extreme cases, load the plugin UI in **iframe sandbox** with postMessage bridge; same contract.

---

## 5) Design System, Theming, Accessibility

* **Tokens-first:** color, spacing, radius, shadow, typography as CSS variables.
* **Components:** Headless primitives + a thin component library (e.g., shadcn/ui).
* **Themes:** light/dark + high-contrast; user-selectable in preferences; persisted per user.
* **Typography & layout:** fluid type scale; 4/8px spacing grid; content width clamps.
* **A11y:** WCAG 2.1 AA; focus rings visible; keyboard-first navigation; ARIA roles; prefers-reduced-motion respected.
* **i18n/L10n:** message catalogs, RTL support, locale routing later.

---

## 6) Core Features & UX Patterns

### 6.1 Markdown stories

* **Editor:** TipTap (ProseMirror) with Markdown sync and a live preview toggle (off by default).
* **Sanitization:** DOMPurify/rehype-sanitize on render; allowlists for embeds.
* **Versioning:** show revision history and diffs; autosave drafts; offline buffer (IndexedDB) with conflict prompts.
* **Mentions & links:** `@person`, `#legacy`, `#context` with graph-backed suggestions.

### 6.2 AI conversations

* Chat UI with streaming tokens; native copy/share; system/user/assistant roles.
* Model selection (if permitted) via central **LiteLLM registry** list; policy prompts displayed when required.
* Conversation state persisted server-side; local optimistic rendering for snappy feel.

### 6.3 Media integrations

* Upload via **presigned S3 URLs** with resumable uploads (tus/Multipart) for large files; progress bars & retries.
* **Capture:** audio via MediaRecorder; image/video via file input; fallbacks for Safari/iOS constraints.
* Post-upload enrichment pipeline status visible (scan, transcode, OCR).
* Inline players with adaptive quality (HLS/DASH where applicable).

### 6.4 Search & discovery

* Unified search box with **hybrid** (keyword + semantic) results; facets for type (story/media/person/legacy), time, tags.
* Result cards show ACL badges; deep links open correct panel/route.
* Saved searches and subscriptions (notifications) later.

### 6.5 Settings & preferences

* Profile, theme, notifications, default editor options, AI safety prefs.
* User-level overrides.

---

## 7) Performance & Reliability

* **Budgets:** first contentful paint < 2s on 3G fast; interactivity < 2.5s; JS < 250KB initial.
* **Code-splitting:** route-based and MF remote lazy-loading; prefetch on hover.
* **Images:** responsive `srcset`, lazy loading; `content-visibility` for heavy sections.
* **Caching:** HTTP cache + ETags; client-side query cache (TanStack Query) with smart invalidation on events.
* **Error handling:** global error boundary; retry with backoff; user-facing toasts.
* **Offline-friendly:** draft autosave & retry queues for writes.

---

## 8) Security & Privacy (Browser)

* **CSP:** default-src 'self'; script-src 'self' plus explicit plugin origins; object-src 'none'; frame-ancestors 'none'.
* **Trusted Types** (where supported) to prevent DOM XSS sinks.
* **Sanitize** all user content (Markdown/HTML); escape text by default.
* **Clickjacking:** X-Frame-Options/Same-origin policy; frame-busting not relied upon.
* **Sensitive data:** never store tokens in `localStorage`; rely on httpOnly cookies.

---

## 9) Observability & Analytics

* **OpenTelemetry Web:** propagate `traceparent`; link user actions to backend traces.
* **Error reporting:** Sentry (or OSS equivalent) with PII scrubbing; sourcemap upload in CI.
* **UX metrics:** Core Web Vitals; custom spans for editor/save/search flows.
* **Privacy:** minimal analytics; respect DNT; consent banner for marketing pages.

---

## 10) Collaboration with Backend & Plugins

* **Contracts:** API clients generated from OpenAPI (see API-DESIGN.md); strict type checks in CI.
* **Events:** browser subscribes to server-sent events (or WebSocket later) for live updates (e.g., media pipeline status).
* **Plugin UI registry:** core lists installed plugins and their contributions; users can enable/disable panels where allowed.
* **Permissions UI:** surfaces plugin capability requests clearly.

---

## 11) Scaling & Deploy

* **Stateless UI pods** behind a Service/Ingress; **no sticky sessions** required for standard flows.
* **Streaming:** SSE usually OK without stickiness; WebSockets (if used) may require LB affinity or a gateway (Socket.io adapter/Redis).
* **Assets:** built assets served from the same service initially; optional **CDN** later—ensure hashed filenames and deterministic builds.
* **Feature flags & remote config:** server-provided flags to enable canaries or kill switches (including disabling specific plugin panels at runtime).

---

## 12) Testing & Quality

* **Unit tests:** components, hooks; jest/vitest.
* **Integration/E2E:** Playwright; mock IdP locally; scripted auth flows.
* **Visual regression:** Storybook + Chromatic/Lo.snapshot; baseline themes (light/dark).
* **Accessibility tests:** axe-core CI checks; keyboard nav tests.
* **Contract tests:** against generated API clients and plugin UI contracts.

---

## 13) Dev Experience & Repo Layout

See **[Local Development Setup](/docs/developer/LOCAL.md)** for complete setup instructions including environment configuration, development servers, and testing setup.

* **Monorepo** (pnpm + Turbo/Nx) for: `app/`, `design-system/`, `@mosaiclife/plugin-sdk`, `shared-types/`.
* **CI:** type-check, lint, unit + E2E, bundle size check, sourcemap upload.
* **Storybook:** colocated with `design-system/` and app; plugins can add stories too.

```
apps/
  web/                 # core web app (shell)
  marketing/           # optional Next.js site
packages/
  design-system/
  plugin-sdk/
  shared-types/
  api-clients/
```

---

## 14) Accessibility & Inclusive Design (expanded)

* Color contrast ≥ 4.5:1; prefers-contrast honored.
* Captions/transcripts for media; keyboard shortcuts with discoverability.
* Motion reduction: disable heavy animations when requested.
* Screen reader labels for all controls; landmark regions for navigation.

---

## 15) Search UX Details

* Debounced, async suggestions; keyboard-first navigation.
* Result grouping (stories, media, people, legacies) with facet chips.
* Advanced filters: time range, tags, authors, plugins.
* Explainability toggle (show matched terms) for keyword; confidence for semantic.

---

## 16) AI UX Details

* Streaming tokens with animated caret; retry/continue buttons.
* Model picker (if allowed), temperature/max tokens controls; saved presets.
* Attachment support: reference a story/media item; show citation chips.
* Safety: display policy notices; block disallowed uploads; redaction suggestions.

---

## 17) Mobile Readiness (Web-first now)

* **Responsive breakpoints** with container queries; touch-target sizes ≥ 44px.
* **PWA** optional: offline drafts, media capture, home-screen icon.
* Prepare component API for reuse in a future **React Native** app (design tokens + headless logic shared).

---

## 18) Security Posture (Plugins)

* Only load MF remotes from approved origins; require **integrity metadata** from manifest when possible.
* Disable `dangerouslySetInnerHTML` in plugins by default; provide a sanitized renderer.
* Rate-limit plugin HTTP calls via BFF proxy; expose capability prompts in UI.

---

## 19) Rollout Plan (No-CDN → CDN-ready)

1. **Phase 1 (no CDN):** single web service serves HTML + assets + MF remotes.
2. **Phase 2 (static split):** move assets (including plugin remotes if desired) to object storage + CDN; keep HTML at web service.
3. **Phase 3 (edge optimizations):** CDN for HTML (marketing), stale-while-revalidate; app shell stays authenticated behind BFF.

---

## 20) Checklists

### 20.1 Feature readiness

* [ ] Auth guards + `/me` wired
* [ ] Story editor with sanitization + autosave
* [ ] Media upload with resumable flows + progress
* [ ] Search page (hybrid) + facets
* [ ] AI chat with streaming + registry model selection
* [ ] Settings (theme, prefs)
* [ ] Plugin panels/routes loading + error boundaries

### 20.2 Operational readiness

* [ ] CSP in report-only then enforce
* [ ] OTel web traces + error reporting
* [ ] Bundle size budgets enforced in CI
* [ ] Accessibility checks pass
* [ ] Helm chart values for base URLs, plugin origins, CSP

---

## 21) Open Questions (to resolve before build)

* **Framework choice** for the shell (Next.js vs Vite). If Next.js, confirm Module Federation strategy (Next Federation or dedicated plugin).
* Which **Markdown editor** baseline (TipTap vs MDX).
* **SSE vs WebSocket** for AI streaming (start with SSE).
* **CDN timeline** and naming for plugin-remote origins to lock CSP early.

**Tenancy:** Single-tenant (no tenant UI); keep code paths compatible to add multi-tenancy later if needed.

---

## 22) AI Coding Assistant Guidance (Prompts & Conventions)

### 22.1 Global rules the agent must follow

* **Framework & build:** Use **React + TypeScript** with **Vite**. No Next.js in the app shell. Generate code with strict types and ESLint/Prettier compliance.
* **Auth wiring:** Assume BFF-managed httpOnly cookies. All API clients must send credentials automatically and handle 401 by redirecting to `/login` via a small `authGuard()` helper.
* **Extensibility:** Load plugin UIs via **Module Federation** using a `registerRemote({ id, url })` helper. Wrap every plugin mount in an Error Boundary. Never call plugin internals directly—use the provided SDK surface.
* **Editor:** Implement **TipTap** editor wrapper with Markdown sync, autosave, revision badges, and a preview toggle (off by default). Sanitize on render using a central sanitizer.
* **Streaming:** Use **SSE** for AI/chat streaming. Provide a reusable `useSSE(url, body)` hook that yields tokens, supports abort, and reconnects with backoff.
* **State & data:** Use **TanStack Query** for server cache and **Zustand** for local UI state. Do not build a global Redux store.
* **Design system:** Consume tokens from `@mosaiclife/design-system`. No hard-coded colors. Ensure WCAG 2.1 AA and keyboard navigation.
* **Security:** Never store tokens in localStorage/sessionStorage. Sanitize all user-rendered content. Avoid `dangerouslySetInnerHTML` outside the sanctioned renderer.
* **Observability:** Instrument important actions with OpenTelemetry web spans (`story.save`, `media.upload`, `search.query`, `ai.stream`).

### 22.2 File & folder conventions

```
apps/web/
  src/
    app/            # app shell, routes
    components/     # shared UI
    features/
      editor/       # TipTap wrapper, markdown sync
      ai-chat/      # chat UI + streaming hook
      media/        # uploaders, players
      search/       # search page & facets
      settings/     # user prefs & themes
    plugins/        # MF runtime registration
    lib/            # http client, authGuard, sanitizer, otel, event bus
    api/            # generated API clients (OpenAPI)
```

### 22.3 Example prompt patterns for the agent

* **UI component (atomic):**

  * *Goal:* “Build an accessible Button with loading state, using design tokens.”
  * *Acceptance:* Role=button, keyboard operable, spinner announced via `aria-live`, tests in Vitest, Storybook stories (light/dark).
* **Feature slice:**

  * *Goal:* “Create `features/ai-chat` with an input, stream display, and `useSSE` hook.”
  * *Acceptance:* Cancels on route change; backoff on network errors; emits `otel` span per message.
* **Plugin mount:**

  * *Goal:* “Register and mount a remote panel from `REMOTE_URL` exposing `./Panel`.”
  * *Acceptance:* Error boundary wraps mount; CSP origin validated; unmount cleans listeners.
* **Editor integration:**

  * *Goal:* “TipTap editor with Markdown sync, autosave (2s debounce), and preview toggle.”
  * *Acceptance:* Sanitized preview; Ctrl/Cmd+S triggers save; E2E test saves and restores draft on refresh.

### 22.4 Reusable code stubs the agent should use

* **HTTP client** (`lib/http.ts`): fetch wrapper with base URL, JSON, ETag support, and 401 redirect.
* **SSE hook** (`features/ai-chat/useSSE.ts`): returns `{ status, tokens[], error, abort() }`.
* **Sanitizer** (`lib/sanitize.ts`): DOMPurify/rehype-sanitize pipeline configuration.
* **Plugin loader** (`plugins/registry.ts`): `registerRemote`, `loadRemoteModule`, and contribution registration helpers.
* **Design tokens** (`design-system/tokens.css`): CSS variables loaded app-wide.

### 22.5 MVP vs Target Architecture

#### MVP Implementation (Current)
The MVP frontend focuses on core functionality with simplified architecture:

- **Single Application**: Monolithic React app without Module Federation
- **Basic Auth**: Simple session handling with Core API, basic user flows
- **Core Features**: Story creation, browsing, and basic AI chat functionality
- **Simple State**: Zustand for core state management, TanStack Query for server state
- **Foundation**: Design system foundation and accessibility basics

#### Target Architecture (Future)
The target architecture provides advanced extensibility and user experience:

- **Plugin System**: Module Federation for runtime-loaded plugin UIs
- **Advanced Auth**: Full BFF pattern with OIDC integration
- **Rich Interactions**: Advanced AI personas, complex story relationships
- **Performance**: Advanced caching, lazy loading, and optimization
- **Enterprise Features**: Multi-tenancy UI, advanced admin capabilities

#### Migration Path
1. **MVP Phase**: Core user flows and story management
2. **Auth Enhancement**: Implement full BFF and OIDC integration
3. **Plugin Foundation**: Add Module Federation infrastructure
4. **Advanced Features**: Rich AI interactions and plugin ecosystem
5. **Enterprise Ready**: Multi-tenancy and advanced administration

### 22.6 Acceptance checklist for PRs

* [ ] Type-safe, linted, formatted; bundle size within budget.
* [ ] Accessible (axe passes, keyboard nav); Storybook stories added.
* [ ] Uses TipTap wrapper & sanitizer; no raw HTML injection.
* [ ] SSE streaming tested (happy path + abort + retry).
* [ ] Module Federation remote loads with error boundary; CSP origin listed.
* [ ] OTel spans added for major actions; no PII in logs.
* [ ] Unit + E2E tests green in CI.
