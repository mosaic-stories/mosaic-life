# Voice AI Implementation Design

## Status: Approved

**Date:** 2026-03-22
**Scope:** Real-time voice conversations for Mosaic Life using Pipecat + Bedrock Nova Sonic

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend mode | Direct Bedrock only | LiteLLM realtime proxy is unproven; validate Pipecat + Nova Sonic first |
| Pipeline framework | All-in on Pipecat | Purpose-built for real-time voice; fighting it for adapter purity isn't worth it |
| Personas | Biographer + Friend | Proves persona flexibility without the complexity of digital twin |
| Transcript handling | Store transcript + auto-create draft story | Closes the core value loop: voice → preserved story |
| Usage tracking | Track and attribute, no enforcement | Need cost visibility from day one; hard limits add UX complexity for v2 |
| Deployment | Separate voice-api service | Voice sessions are long-lived, stateful, memory-intensive — isolate from core-api |
| Service communication | Signed voice token + internal HTTP | Clean boundary: core-api owns auth/personas/stories, voice-api owns real-time audio |

---

## 1. Service Architecture & Auth Flow

Two services with a clean boundary. Same Aurora PostgreSQL instance and database schema.

```
┌─────────────┐        ┌──────────────┐        ┌─────────────────┐
│   Web App   │──REST──│   Core API   │        │   Voice API     │
│  (React)    │        │  (FastAPI)   │◄─HTTP──│  (FastAPI +     │
│             │──WS────│              │        │   Pipecat)      │
└─────────────┘        └──────┬───────┘        └────────┬────────┘
                              │                         │
                        ┌─────┴─────────────────────────┴─────┐
                        │         Aurora PostgreSQL            │
                        │  (shared instance, shared schema)    │
                        └─────────────────────────────────────┘
```

### Auth flow — signed voice token

1. Frontend calls `POST /api/voice/token` on **core-api** (authenticated via existing session cookie)
2. Core-api validates the session, checks the user has access to the requested legacy
3. Core-api loads the persona via `get_persona(persona_id)` and calls `build_system_prompt()` with full context (legacy name, relationship context, known facts, graph suggestions)
4. Core-api returns `{ token, system_prompt, websocket_url }` — token is a short-lived signed JWT containing `{user_id, legacy_id, persona_id, exp}` (5-minute TTL)
5. Frontend opens WebSocket to **voice-api** at `wss://voice.mosaiclife.me/{legacy_id}?token={jwt}`
6. Voice-api validates the JWT signature (shared secret via External Secrets) — no DB lookup needed
7. On session end, voice-api calls `POST core-api/internal/stories/draft` with the extracted transcript (authenticated via a static service key)

---

## 2. Voice API Service Structure

New service at `services/voice-api/`:

```
services/voice-api/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app, lifespan, health checks
│   ├── config.py               # VoiceConfig (pydantic-settings)
│   ├── auth.py                 # JWT voice token validation
│   ├── router.py               # WebSocket endpoint + token info endpoint
│   ├── pipeline.py             # Pipecat pipeline assembly
│   ├── tools.py                # RAG tool definitions + handlers
│   ├── usage.py                # Usage tracking (write to voice_usage table)
│   ├── transcript.py           # Post-session transcript → draft story via core-api
│   └── session.py              # In-memory concurrent session tracking
├── alembic/                    # Migrations (voice_usage table only)
│   └── versions/
├── alembic.ini
├── pyproject.toml              # pipecat-ai[aws], fastapi, asyncpg, pyjwt, httpx
├── Dockerfile
└── tests/
```

### Key dependencies

- `pipecat-ai[aws]` — Nova Sonic + pipeline framework
- `fastapi` + `uvicorn` — WebSocket serving
- `asyncpg` — Direct DB access for RAG queries and usage writes
- `pyjwt` — Voice token validation
- `httpx` — Calls back to core-api for draft story creation
- `opentelemetry-sdk` — Traces to existing Grafana stack

### Database access (same Aurora instance, same schema)

- **Reads:** `story_chunks` (pgvector search), `legacies` (context for personas)
- **Writes:** `voice_usage` (new table, owned by voice-api migrations)

### Endpoints

- `GET /healthz` + `GET /readyz` — Standard k8s probes
- `GET /metrics` — Prometheus scrape endpoint
- `WebSocket /{legacy_id}` — Voice conversation (authenticated via voice token query param)

---

## 3. Voice Conversation Pipeline & Personas

### Pipecat pipeline (direct Bedrock mode)

```
WebSocket Transport (audio in/out)
    → User Context Aggregator
    → AWSNovaSonicLLMService (Bedrock bidirectional streaming)
    → Assistant Context Aggregator
    → WebSocket Transport (audio out)
```

Nova Sonic handles VAD, STT, TTS, and LLM inference in a single bidirectional stream. Pipecat orchestrates pipeline lifecycle, interruption handling, and tool call dispatch.

### Persona reuse — single source of truth

Personas are defined in `services/core-api/app/config/personas.yaml` and loaded via `get_persona()` / `build_system_prompt()` in `services/core-api/app/config/personas.py`. The voice service does **not** duplicate persona definitions.

The fully-assembled system prompt is constructed by core-api at token-generation time and passed to voice-api. Voice-api receives an opaque system prompt string and adds only a thin voice-specific wrapper:

> "You are in a real-time voice conversation. Keep responses conversational and concise. Do not use markdown formatting."

When persona definitions evolve in `personas.yaml`, voice conversations pick up the changes on the next session — no voice-api changes needed.

### Tool calling

Two tools registered on the LLM service:

1. **`search_stories`** — pgvector cosine similarity search against the `story_chunks` table. Queries 1024-dim Titan v2 embeddings via HNSW index. Filters by `legacy_id` and respects `visibility` column.

2. **`get_legacy_context`** — Fetches legacy summary from the `legacies` table (name, bio, dates). Used at conversation start or for broad context questions.

Both tools use `asyncpg` directly (not SQLAlchemy).

### Session lifecycle

1. WebSocket connects → validate JWT → check concurrent session limit (in-memory counter, max 2 per user)
2. Receive system prompt from JWT/token response → append voice-specific wrapper → create Pipecat pipeline
3. Pipeline runs until disconnect or `VOICE_SESSION_MAX_MINUTES` timeout (30 min default)
4. On end: persist usage record, extract transcript, call core-api to create draft story

---

## 4. Usage Tracking & Transcript-to-Story Flow

### Usage tracking (attribution only, no enforcement)

New `voice_usage` table (migration owned by voice-api):

```sql
CREATE TABLE voice_usage (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id),
    legacy_id             UUID NOT NULL REFERENCES legacies(id),
    session_id            TEXT NOT NULL,
    persona_id            TEXT NOT NULL,
    started_at            TIMESTAMPTZ NOT NULL,
    ended_at              TIMESTAMPTZ,
    speech_input_tokens   INTEGER DEFAULT 0,
    speech_output_tokens  INTEGER DEFAULT 0,
    text_input_tokens     INTEGER DEFAULT 0,
    text_output_tokens    INTEGER DEFAULT 0,
    estimated_cost_usd    NUMERIC(10,6) DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_voice_usage_user_month ON voice_usage (user_id, started_at);
```

Voice-api accumulates token counts from Pipecat metrics events during the session and writes a single row on disconnect.

### Transcript → draft story flow

```
Voice session ends
    → Pipecat provides transcript (list of turns with role + text)
    → Voice-api calls POST /internal/stories/draft on core-api
        Body: { user_id, legacy_id, persona_id, transcript }
        Auth: static service-to-service key (VOICE_SERVICE_KEY)
    → Core-api calls LLM (Claude via LiteLLM) to:
        1. Extract a narrative story from the conversation
        2. Generate a title
        3. Identify tags/themes
    → Core-api creates a Story record with status="draft"
    → Existing ingestion pipeline chunks, embeds, and extracts graph entities
    → User sees the draft in their story list, can edit in TipTap editor
```

The `/internal/stories/draft` endpoint is a new internal route on core-api, not exposed via the public ingress. Network policy restricts it to traffic from voice-api pods only.

---

## 5. Frontend Integration

### New feature module

```
apps/web/src/features/voice/
├── components/
│   ├── VoiceConversation.tsx    # Main component (Pipecat RTVI client)
│   ├── VoiceButton.tsx          # "Start voice conversation" trigger
│   ├── VoiceIndicator.tsx       # Mic active / AI speaking visual feedback
│   └── VoiceTranscript.tsx      # Live scrolling transcript sidebar
├── hooks/
│   ├── useVoiceToken.ts         # Calls POST /api/voice/token on core-api
│   └── useVoiceSession.ts       # Manages connect/disconnect lifecycle
├── api/
│   └── voice.ts                 # API client (token fetch, typed responses)
└── index.ts
```

### New dependencies

- `@pipecat-ai/client-react` — RTVI React bindings
- `@pipecat-ai/websocket-transport` — WebSocket transport for Pipecat

### User flow

1. User is on a legacy detail page → sees a "Voice Conversation" button (alongside existing AI chat)
2. Click → `useVoiceToken` calls `POST /api/voice/token` with `legacy_id` and selected `persona_id`
3. Core-api returns `{ token, system_prompt, websocket_url }`
4. `useVoiceSession` opens WebSocket to voice-api with the token, initializes Pipecat RTVI client
5. Browser prompts for microphone permission
6. Real-time conversation: audio streams bidirectionally, live transcript updates in sidebar
7. User clicks "End Conversation" → WebSocket closes → voice-api persists usage and sends transcript to core-api
8. User sees a toast notification: "A draft story has been created from your conversation" with a link to the editor

### Not in v1

- No voice-specific settings page (uses existing persona selector)
- No conversation history for voice sessions (only the resulting draft story is persisted)
- No recording playback — transcript only
- No mobile-specific audio handling (standard browser WebRTC APIs)

---

## 6. Infrastructure & Deployment

### New Helm chart: `infra/helm/voice-api/`

Same patterns as existing core-api chart:
- Deployment with health/readiness probes (`/healthz`, `/readyz`)
- IRSA service account with `bedrock:InvokeModelWithBidirectionalStream`
- External Secrets for `VOICE_SERVICE_KEY` and JWT signing secret
- Network policy: inbound from ALB ingress, outbound to Aurora and core-api
- HPA based on CPU/memory
- Non-root security context

### Resource profile (initial, tune after real usage)

| Resource | core-api (existing) | voice-api (new) |
|---|---|---|
| CPU request | 250m | 500m |
| Memory request | 256Mi | 512Mi |
| CPU limit | 1000m | 2000m |
| Memory limit | 512Mi | 1Gi |
| Min replicas | 2 | 1 |
| Max replicas | 5 | 3 |

### Ingress

| Environment | URL |
|---|---|
| Production | `voice.mosaiclife.me` |
| Staging | `voice-staging.mosaiclife.me` |

Both need ALB annotations for WebSocket support — `idle_timeout` set to 1800s (matching `VOICE_SESSION_MAX_MINUTES`).

### Docker compose

New `voice-api` service on port 8081, depends on `postgres`. Same database, with `CORE_API_INTERNAL_URL=http://core-api:8080` for the draft story callback.

### ArgoCD

New application definition at `infra/argocd/applications/voice-api.yaml`, auto-sync from `main` branch.

### New secrets (AWS Secrets Manager → External Secrets)

- `voice-jwt-signing-key` — Shared between core-api (signs) and voice-api (verifies)
- `voice-service-key` — Static key for voice-api → core-api internal calls

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Pipecat + Nova Sonic tool calling is immature | Spike/prototype before full build; keep tool set minimal (2 tools) |
| Nova Sonic pricing unclear at scale | Usage tracking from day one provides real cost data |
| WebSocket sessions consume ALB connections | Session timeout (30 min) + concurrent limit (2/user) bounds resource usage |
| Transcript extraction quality | Use Claude via existing LiteLLM proxy; iterate on extraction prompts |
| Voice-api reads from core-api's tables | Read-only access to stable tables (story_chunks, legacies); voice_usage is owned by voice-api |

---

## What's Deferred to v2+

- LiteLLM proxy mode (unified cost attribution, BYOK support)
- Digital twin persona
- Budget enforcement (per-user monthly limits)
- Voice conversation history / session replay
- Recording playback
- Mobile-specific audio optimizations
- Separate voice-api database (if schema coupling becomes an issue)
