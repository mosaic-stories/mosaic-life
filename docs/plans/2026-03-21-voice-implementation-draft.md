# Mosaic Life — Voice AI Implementation Spec
# Dual-Mode: Direct Bedrock ↔ LiteLLM Proxy (Config-Switched)

## Overview

This spec defines a voice conversation system for Mosaic Life that supports two
backend modes, switchable via environment variable at deploy time:

- **Direct mode**: Pipecat → Bedrock Nova Sonic (lowest latency, usage tracked locally)
- **Proxy mode**: Pipecat → LiteLLM WebSocket → Bedrock Nova Sonic (unified cost attribution)

Both modes share the same FastAPI endpoints, Pipecat pipeline logic, React
frontend, pgvector RAG tools, and persona system. The only difference is how the
LLM service is instantiated.

---

## 1. Configuration

### Environment Variables

```bash
# ─── Voice Feature Flag ───────────────────────────────────────────
VOICE_ENABLED=true
VOICE_BACKEND_MODE=direct          # "direct" | "litellm_proxy"

# ─── Direct Mode (Bedrock) ────────────────────────────────────────
# Uses existing IAM role / IRSA on EKS — no explicit keys needed if
# the pod's service account has bedrock:InvokeModelWithBidirectionalStream
AWS_REGION=us-east-1
NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0

# ─── LiteLLM Proxy Mode ──────────────────────────────────────────
LITELLM_REALTIME_URL=ws://litellm-service.mosaic-life.svc.cluster.local:4000/v1/realtime
LITELLM_INTERNAL_KEY=sk-internal-voice-service  # service-level key for bootstrapping

# ─── Shared Voice Config ─────────────────────────────────────────
VOICE_DEFAULT_VOICE=matthew
VOICE_SESSION_MAX_MINUTES=30       # max session before forced disconnect
VOICE_ENDPOINTING_SENSITIVITY=MEDIUM  # LOW | MEDIUM | HIGH

# ─── Usage Tracking (Direct Mode) ────────────────────────────────
# When not using LiteLLM, report usage here
USAGE_TRACKING_ENABLED=true
USAGE_DB_TABLE=voice_usage          # table in your existing PostgreSQL
```

### LiteLLM Config Addition (litellm_config.yaml)

```yaml
model_list:
  # ... existing text models ...

  - model_name: "nova-sonic-voice"
    litellm_params:
      model: bedrock/amazon.nova-2-sonic-v1:0
      aws_region_name: us-east-1
    model_info:
      mode: realtime

general_settings:
  master_key: sk-mosaic-life-master    # your existing master key
```

### Helm Values (infra/helm/core-api/values.yaml)

```yaml
voice:
  enabled: true
  backendMode: "direct"   # Toggle in CI/CD or per-environment override
  litellm:
    realtimeUrl: "ws://litellm-service.mosaic-life.svc.cluster.local:4000/v1/realtime"
  novaSonic:
    modelId: "amazon.nova-2-sonic-v1:0"
    defaultVoice: "matthew"
    endpointingSensitivity: "MEDIUM"
  limits:
    maxSessionMinutes: 30
    maxConcurrentSessionsPerUser: 2
```

---

## 2. Backend Architecture

### File Structure (additions to services/core-api/)

```
services/core-api/
├── app/
│   ├── voice/
│   │   ├── __init__.py
│   │   ├── config.py              # VoiceConfig pydantic settings
│   │   ├── factory.py             # Creates LLM service based on mode
│   │   ├── router.py              # FastAPI WebSocket endpoint
│   │   ├── pipeline.py            # Pipecat pipeline assembly
│   │   ├── personas.py            # Persona prompt builders
│   │   ├── tools.py               # pgvector search, Neptune tools
│   │   ├── usage.py               # Direct-mode usage tracking
│   │   └── session.py             # Session lifecycle management
```

### config.py — Centralized Voice Configuration

```python
from enum import Enum
from pydantic_settings import BaseSettings

class VoiceBackendMode(str, Enum):
    DIRECT = "direct"
    LITELLM_PROXY = "litellm_proxy"

class VoiceConfig(BaseSettings):
    voice_enabled: bool = False
    voice_backend_mode: VoiceBackendMode = VoiceBackendMode.DIRECT

    # Direct mode
    aws_region: str = "us-east-1"
    nova_sonic_model_id: str = "amazon.nova-2-sonic-v1:0"

    # LiteLLM proxy mode
    litellm_realtime_url: str = "ws://litellm-service:4000/v1/realtime"
    litellm_internal_key: str = ""

    # Shared
    voice_default_voice: str = "matthew"
    voice_session_max_minutes: int = 30
    voice_endpointing_sensitivity: str = "MEDIUM"
    voice_max_concurrent_per_user: int = 2

    # Usage tracking (direct mode fallback)
    usage_tracking_enabled: bool = True

    class Config:
        env_prefix = ""
        case_sensitive = False

voice_config = VoiceConfig()
```

### factory.py — Dual-Mode LLM Service Factory

This is the core of the switching mechanism. Both paths produce a Pipecat-
compatible LLM service with identical interfaces — the pipeline doesn't know
or care which mode is active.

```python
"""
Factory for creating the voice LLM service based on backend mode.

Direct mode:  Pipecat AWSNovaSonicLLMService → Bedrock (SigV4/IRSA)
Proxy mode:   Pipecat OpenAI Realtime-compat  → LiteLLM WS → Bedrock
"""
import os
from app.voice.config import voice_config, VoiceBackendMode
from app.voice.tools import build_voice_tools, build_voice_tools_schema

# ── Direct mode imports (lazy to avoid import errors when not used) ──
def _create_direct_service(persona_prompt: str, tools_schema):
    from pipecat.services.aws.nova_sonic import AWSNovaSonicLLMService

    llm = AWSNovaSonicLLMService(
        # When using IRSA on EKS, omit explicit keys —
        # the SDK picks up the pod's IAM role automatically.
        # If not using IRSA, pass access_key_id / secret_access_key.
        region=voice_config.aws_region,
        settings=AWSNovaSonicLLMService.Settings(
            model=voice_config.nova_sonic_model_id,
            voice=voice_config.voice_default_voice,
            system_instruction=persona_prompt,
            endpointing_sensitivity=voice_config.voice_endpointing_sensitivity,
        ),
        tools=tools_schema,
    )
    return llm


def _create_proxy_service(persona_prompt: str, litellm_api_key: str, tools_schema):
    """
    Uses Pipecat's OpenAI Realtime-compatible service pointed at LiteLLM.

    LiteLLM translates the OpenAI Realtime wire protocol to Bedrock's
    bidirectional streaming API. The litellm_api_key is the per-user
    virtual key, so all usage is attributed to that user.
    """
    from pipecat.services.openai_realtime import OpenAIRealtimeLLMService

    llm = OpenAIRealtimeLLMService(
        api_key=litellm_api_key,
        base_url=voice_config.litellm_realtime_url,
        model="nova-sonic-voice",           # matches LiteLLM config model_name
        voice=voice_config.voice_default_voice,
        system_instruction=persona_prompt,
        tools=tools_schema,
    )
    return llm


def create_voice_llm(
    persona_prompt: str,
    litellm_user_key: str | None = None,
    tools_schema=None,
):
    """
    Create the appropriate LLM service based on VOICE_BACKEND_MODE.

    Args:
        persona_prompt: Full system prompt for this persona + legacy context
        litellm_user_key: Per-user LiteLLM virtual key (required in proxy mode)
        tools_schema: Pipecat ToolsSchema for pgvector search, etc.
    """
    mode = voice_config.voice_backend_mode

    if mode == VoiceBackendMode.LITELLM_PROXY:
        if not litellm_user_key:
            raise ValueError("litellm_user_key required in proxy mode")
        return _create_proxy_service(persona_prompt, litellm_user_key, tools_schema)

    elif mode == VoiceBackendMode.DIRECT:
        return _create_direct_service(persona_prompt, tools_schema)

    else:
        raise ValueError(f"Unknown voice backend mode: {mode}")
```

### tools.py — pgvector RAG Tools (Shared Across Both Modes)

```python
"""
Voice conversation tools for story retrieval and entity lookup.
These are registered with whichever LLM service the factory creates.
"""
from pipecat.adapters.schemas.tools_schema import ToolsSchema

VOICE_TOOLS_DEFINITION = [
    {
        "type": "function",
        "function": {
            "name": "search_stories",
            "description": (
                "Search the legacy's stored stories and memories for context "
                "relevant to the current conversation topic. Use this when the "
                "user references past events, people, places, or experiences."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum stories to retrieve (default 5)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_legacy_context",
            "description": (
                "Retrieve summary information about the legacy — key life events, "
                "relationships, and facts. Use at conversation start or when the "
                "user asks broad questions about the person."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]


def build_voice_tools_schema() -> ToolsSchema:
    """Build Pipecat ToolsSchema from tool definitions."""
    return ToolsSchema.from_openai_tools(VOICE_TOOLS_DEFINITION)


async def handle_search_stories(
    function_name: str,
    tool_call_id: str,
    args: dict,
    llm,
    context,
    result_callback,
):
    """
    Execute pgvector similarity search against story embeddings.
    Uses the legacy_id and db pool from context.userdata.
    """
    from app.ai.embeddings import get_titan_embedding  # your existing embedding util

    query = args.get("query", "")
    max_results = args.get("max_results", 5)
    legacy_id = context.userdata["legacy_id"]
    db = context.userdata["db_pool"]

    embedding = await get_titan_embedding(query)
    rows = await db.fetch(
        """
        SELECT content, title, contributor_name, created_at
        FROM story_embeddings
        WHERE legacy_id = $1
        ORDER BY embedding <=> $2
        LIMIT $3
        """,
        legacy_id, embedding, max_results
    )

    stories = [
        {
            "title": r["title"],
            "content": r["content"],
            "shared_by": r["contributor_name"],
            "date": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]

    await result_callback({"stories": stories, "count": len(stories)})


async def handle_get_legacy_context(
    function_name: str,
    tool_call_id: str,
    args: dict,
    llm,
    context,
    result_callback,
):
    """Retrieve legacy summary from the database."""
    legacy_id = context.userdata["legacy_id"]
    db = context.userdata["db_pool"]

    legacy = await db.fetchrow(
        "SELECT name, bio, birth_date, passing_date FROM legacies WHERE id = $1",
        legacy_id
    )

    await result_callback({
        "name": legacy["name"],
        "bio": legacy["bio"],
        "birth_date": str(legacy["birth_date"]) if legacy["birth_date"] else None,
        "passing_date": str(legacy["passing_date"]) if legacy["passing_date"] else None,
    })


def register_tools(llm):
    """Register tool handlers on the LLM service instance."""
    llm.function("search_stories")(handle_search_stories)
    llm.function("get_legacy_context")(handle_get_legacy_context)
```

### usage.py — Direct-Mode Usage Tracking

```python
"""
Usage tracking for direct Bedrock mode.

In LiteLLM proxy mode, LiteLLM handles all cost attribution via virtual keys.
In direct mode, we capture token usage from Pipecat events and persist it
ourselves, using the same schema so the data is compatible if you switch modes.
"""
import asyncio
from datetime import datetime, timezone
from dataclasses import dataclass, field

@dataclass
class VoiceUsageAccumulator:
    """Accumulates token usage across a voice session."""
    user_id: str
    legacy_id: str
    session_id: str
    persona_type: str
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    speech_input_tokens: int = 0
    speech_output_tokens: int = 0
    text_input_tokens: int = 0    # tool calls, system prompt
    text_output_tokens: int = 0

    @property
    def estimated_cost_usd(self) -> float:
        """
        Estimate cost based on Nova 2 Sonic published pricing.
        Speech: $0.0034/1K input, $0.0136/1K output
        Text:   $0.00006/1K input, $0.00024/1K output
        """
        return (
            (self.speech_input_tokens / 1000) * 0.0034
            + (self.speech_output_tokens / 1000) * 0.0136
            + (self.text_input_tokens / 1000) * 0.00006
            + (self.text_output_tokens / 1000) * 0.00024
        )

    def update_from_metrics(self, metrics: dict):
        """Update from Pipecat's metrics events."""
        self.speech_input_tokens += metrics.get("speech_input_tokens", 0)
        self.speech_output_tokens += metrics.get("speech_output_tokens", 0)
        self.text_input_tokens += metrics.get("text_input_tokens", 0)
        self.text_output_tokens += metrics.get("text_output_tokens", 0)


async def persist_usage(db_pool, usage: VoiceUsageAccumulator):
    """Write accumulated usage to PostgreSQL."""
    await db_pool.execute(
        """
        INSERT INTO voice_usage (
            user_id, legacy_id, session_id, persona_type,
            started_at, ended_at,
            speech_input_tokens, speech_output_tokens,
            text_input_tokens, text_output_tokens,
            estimated_cost_usd
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        """,
        usage.user_id, usage.legacy_id, usage.session_id, usage.persona_type,
        usage.started_at, datetime.now(timezone.utc),
        usage.speech_input_tokens, usage.speech_output_tokens,
        usage.text_input_tokens, usage.text_output_tokens,
        usage.estimated_cost_usd,
    )


async def check_user_budget(db_pool, user_id: str, monthly_limit_usd: float) -> bool:
    """Check if user is within their monthly voice budget."""
    row = await db_pool.fetchrow(
        """
        SELECT COALESCE(SUM(estimated_cost_usd), 0) as total_spend
        FROM voice_usage
        WHERE user_id = $1
          AND started_at >= date_trunc('month', now())
        """,
        user_id
    )
    return row["total_spend"] < monthly_limit_usd
```

### pipeline.py — Pipecat Pipeline Assembly

```python
"""
Assembles the full Pipecat voice pipeline.
Mode-agnostic — works identically with direct or proxied LLM service.
"""
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.transports.services.helpers.daily_rest import DailyRESTHelper
from pipecat.processors.aggregators.llm_context import LLMContext, LLMContextFrame
from pipecat.processors.aggregators.llm_response import (
    LLMAssistantContextAggregator,
    LLMUserContextAggregator,
)
from app.voice.config import voice_config, VoiceBackendMode
from app.voice.factory import create_voice_llm
from app.voice.tools import build_voice_tools_schema, register_tools
from app.voice.usage import VoiceUsageAccumulator


async def build_voice_pipeline(
    transport,
    user_id: str,
    legacy_id: str,
    persona_type: str,
    persona_prompt: str,
    litellm_user_key: str | None,
    db_pool,
):
    """
    Build a complete voice conversation pipeline.

    Returns (PipelineTask, VoiceUsageAccumulator or None).
    Usage accumulator is only returned in direct mode.
    """
    tools_schema = build_voice_tools_schema()

    # ── Create LLM service (mode-switched) ──
    llm = create_voice_llm(
        persona_prompt=persona_prompt,
        litellm_user_key=litellm_user_key,
        tools_schema=tools_schema,
    )

    # Register tool handlers (works identically in both modes)
    register_tools(llm)

    # ── Context aggregators ──
    context = LLMContext()
    user_aggregator = LLMUserContextAggregator(context)
    assistant_aggregator = LLMAssistantContextAggregator(context)

    # Store session data for tool handlers
    context.userdata = {
        "legacy_id": legacy_id,
        "user_id": user_id,
        "db_pool": db_pool,
    }

    # ── Usage tracking (direct mode only) ──
    usage_accumulator = None
    if voice_config.voice_backend_mode == VoiceBackendMode.DIRECT:
        usage_accumulator = VoiceUsageAccumulator(
            user_id=user_id,
            legacy_id=legacy_id,
            session_id=f"voice-{user_id}-{legacy_id}",
            persona_type=persona_type,
        )

    # ── Assemble pipeline ──
    pipeline = Pipeline([
        transport.input(),
        user_aggregator,
        llm,
        transport.output(),
        assistant_aggregator,
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            enable_tracing=True,     # OpenTelemetry → Grafana
        ),
    )

    return task, usage_accumulator
```

### router.py — FastAPI WebSocket Endpoint

```python
"""
Voice conversation WebSocket endpoint.
Handles auth, budget checks, session lifecycle, and pipeline creation.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from pipecat.transports.services.fastapi_websocket import FastAPIWebsocketTransport
from pipecat.transports.services.fastapi_websocket import (
    FastAPIWebsocketParams,
)
from app.auth.dependencies import get_ws_current_user  # your existing WS auth
from app.voice.config import voice_config, VoiceBackendMode
from app.voice.pipeline import build_voice_pipeline
from app.voice.personas import build_persona_prompt
from app.voice.usage import persist_usage, check_user_budget
from app.voice.session import SessionManager
from app.db import get_db_pool

router = APIRouter(prefix="/voice", tags=["voice"])
session_manager = SessionManager()


@router.websocket("/{legacy_id}")
async def voice_conversation(
    ws: WebSocket,
    legacy_id: str,
    persona: str = Query(default="biographer"),
):
    if not voice_config.voice_enabled:
        await ws.close(code=4000, reason="Voice conversations are not enabled")
        return

    # ── Authenticate ──
    user = await get_ws_current_user(ws)
    if not user:
        await ws.close(code=4001, reason="Authentication required")
        return

    db_pool = await get_db_pool()

    # ── Budget check ──
    if voice_config.voice_backend_mode == VoiceBackendMode.DIRECT:
        within_budget = await check_user_budget(
            db_pool, user.id, monthly_limit_usd=5.00  # configurable per plan
        )
        if not within_budget:
            await ws.close(code=4002, reason="Monthly voice budget exceeded")
            return
    # In proxy mode, LiteLLM enforces budget via virtual key max_budget

    # ── Concurrent session check ──
    if not session_manager.can_start(user.id):
        await ws.close(
            code=4003,
            reason=f"Maximum {voice_config.voice_max_concurrent_per_user} "
                   f"concurrent voice sessions"
        )
        return

    # ── Build persona prompt ──
    persona_prompt = await build_persona_prompt(
        legacy_id=legacy_id,
        persona_type=persona,
        user=user,
        db_pool=db_pool,
    )

    # ── Resolve LiteLLM key (proxy mode) ──
    litellm_user_key = None
    if voice_config.voice_backend_mode == VoiceBackendMode.LITELLM_PROXY:
        litellm_user_key = await get_or_create_litellm_key(user.id, db_pool)

    # ── Create transport ──
    transport = FastAPIWebsocketTransport(
        websocket=ws,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=None,        # Nova Sonic handles VAD internally
            transcription_enabled=True,
        ),
    )

    # ── Build and run pipeline ──
    session_manager.register(user.id, legacy_id)

    try:
        task, usage_accumulator = await build_voice_pipeline(
            transport=transport,
            user_id=user.id,
            legacy_id=legacy_id,
            persona_type=persona,
            persona_prompt=persona_prompt,
            litellm_user_key=litellm_user_key,
            db_pool=db_pool,
        )

        await task.run()

    except WebSocketDisconnect:
        pass
    finally:
        session_manager.unregister(user.id, legacy_id)

        # Persist usage in direct mode
        if usage_accumulator:
            await persist_usage(db_pool, usage_accumulator)

        # Queue transcript extraction (async background task)
        # This runs through Claude Haiku to extract structured story data
        await queue_transcript_extraction(
            user_id=user.id,
            legacy_id=legacy_id,
            transcript=task.get_transcript() if hasattr(task, 'get_transcript') else None,
        )


async def get_or_create_litellm_key(user_id: str, db_pool) -> str:
    """
    Get existing or create new LiteLLM virtual key for this user.
    Keys are stored in the user profile and created via LiteLLM admin API.
    """
    row = await db_pool.fetchrow(
        "SELECT litellm_voice_key FROM user_profiles WHERE user_id = $1",
        user_id
    )
    if row and row["litellm_voice_key"]:
        return row["litellm_voice_key"]

    # Create via LiteLLM admin API
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "http://litellm-service:4000/key/generate",
            json={
                "user_id": user_id,
                "max_budget": 5.0,         # monthly budget in USD
                "budget_duration": "1mo",
                "models": ["nova-sonic-voice"],
                "metadata": {"source": "mosaic-life-voice", "user_id": user_id},
            },
            headers={"Authorization": f"Bearer {voice_config.litellm_internal_key}"}
        )
        key_data = resp.json()
        new_key = key_data["key"]

    await db_pool.execute(
        "UPDATE user_profiles SET litellm_voice_key = $1 WHERE user_id = $2",
        new_key, user_id
    )
    return new_key
```

---

## 3. Database Migrations

```sql
-- Voice usage tracking (used in direct mode; compatible with LiteLLM reporting)
CREATE TABLE voice_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    legacy_id       TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    persona_type    TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,

    speech_input_tokens   INTEGER DEFAULT 0,
    speech_output_tokens  INTEGER DEFAULT 0,
    text_input_tokens     INTEGER DEFAULT 0,
    text_output_tokens    INTEGER DEFAULT 0,
    estimated_cost_usd    NUMERIC(10,6) DEFAULT 0,

    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_voice_usage_user_month
    ON voice_usage (user_id, started_at);

-- LiteLLM virtual key storage (used in proxy mode)
ALTER TABLE user_profiles
    ADD COLUMN litellm_voice_key TEXT;
```

---

## 4. Frontend Integration (React)

### VoiceConversation component (apps/web)

```tsx
// apps/web/src/features/voice/VoiceConversation.tsx
import { useCallback, useState } from 'react';
import {
  RTVIClient,
  RTVIClientAudio,
  RTVIClientProvider,
} from '@pipecat-ai/client-react';
import { WebSocketTransport } from '@pipecat-ai/websocket-transport';

interface VoiceConversationProps {
  legacyId: string;
  persona: 'biographer' | 'friend' | 'digital_twin';
  onTranscriptUpdate?: (text: string, role: 'user' | 'assistant') => void;
  onSessionEnd?: () => void;
}

export function VoiceConversation({
  legacyId,
  persona,
  onTranscriptUpdate,
  onSessionEnd,
}: VoiceConversationProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const client = new RTVIClient({
    transport: new WebSocketTransport(),
    params: {
      baseUrl: `${import.meta.env.VITE_API_URL}/voice`,
      endpoints: {
        connect: `/${legacyId}?persona=${persona}`,
      },
      // Auth token is sent via cookie (your existing OAuth pattern)
      requestData: {
        credentials: 'include',
      },
    },
    enableMic: true,
    enableCam: false,
    callbacks: {
      onConnected: () => setIsConnected(true),
      onDisconnected: () => {
        setIsConnected(false);
        onSessionEnd?.();
      },
      onBotTranscript: (text: string) => {
        onTranscriptUpdate?.(text, 'assistant');
      },
      onUserTranscript: (text: string) => {
        onTranscriptUpdate?.(text, 'user');
      },
      onUserStartedSpeaking: () => setIsListening(true),
      onUserStoppedSpeaking: () => setIsListening(false),
    },
  });

  const handleStart = useCallback(async () => {
    try {
      await client.connect();
    } catch (err) {
      console.error('Voice connection failed:', err);
      // Handle budget exceeded (4002), auth errors (4001), etc.
    }
  }, [client]);

  const handleStop = useCallback(async () => {
    await client.disconnect();
  }, [client]);

  return (
    <RTVIClientProvider client={client}>
      <RTVIClientAudio />

      {/* Your UI — adapt to Mosaic Life's parchment aesthetic */}
      <div className="voice-conversation">
        {!isConnected ? (
          <button onClick={handleStart}>
            Start Voice Conversation
          </button>
        ) : (
          <>
            <div className={`mic-indicator ${isListening ? 'active' : ''}`} />
            <button onClick={handleStop}>End Conversation</button>
          </>
        )}
      </div>
    </RTVIClientProvider>
  );
}
```

---

## 5. Deployment & Switching

### Switching modes via ArgoCD

In your GitOps workflow, override the Helm value per environment:

```yaml
# infra/helm/environments/production.yaml
voice:
  backendMode: "direct"    # Start here for MVP

# infra/helm/environments/staging.yaml
voice:
  backendMode: "litellm_proxy"   # Test proxy mode in staging
```

Changing `backendMode` triggers ArgoCD to redeploy the core-api pods with the
updated environment variable. No code changes, no new image build — the factory
pattern in `factory.py` handles the rest.

### Comparing modes

Run both staging environments simultaneously:

| Metric                    | How to measure                          |
|--------------------------|-----------------------------------------|
| Voice-to-first-audio     | Pipecat OTEL traces → Grafana           |
| Per-session cost          | voice_usage table (direct) vs LiteLLM /spend API (proxy) |
| Tool call latency         | Pipecat metrics per tool invocation     |
| Barge-in reliability      | Manual QA + session recordings (S3)     |
| Budget enforcement        | Test with low-budget user keys          |

---

## 6. Observability Integration

Both modes emit OpenTelemetry traces via Pipecat's built-in tracing. These
flow into your existing Grafana Loki/Tempo stack on EKS:

```python
# In pipeline.py — already configured above
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

exporter = OTLPSpanExporter(
    endpoint="http://grafana-alloy.mosaic-life-observability:4318/v1/traces"
)
# ... setup_tracing(service_name="mosaic-voice", exporter=exporter)
```

Key spans to monitor:
- `conversation` — full session duration, token totals
- `turn` — individual user→assistant exchange
- `tts` / `stt` — per-service TTFB (time-to-first-byte)
- `tool:search_stories` — pgvector retrieval latency

---

## 7. Key Decisions & Trade-offs

| Decision | Direct Mode | LiteLLM Proxy Mode |
|----------|------------|-------------------|
| Latency | Lower (~0-5ms saved) | +5-15ms (WS hop on cluster) |
| Cost tracking | Custom `voice_usage` table | LiteLLM unified dashboard |
| Budget enforcement | Custom `check_user_budget()` | LiteLLM `max_budget` per key |
| Multi-provider routing | N/A (Bedrock only) | Swap model in LiteLLM config |
| BYOK support | Requires custom routing | Natural fit (keys per user) |
| Operational complexity | Simpler (fewer moving parts) | Depends on LiteLLM reliability |
| Async tool calling | Tested, first-class Pipecat support | Needs validation through proxy |

**Recommendation**: Start with `direct` mode for the fastest, most reliable MVP.
Deploy `litellm_proxy` mode in staging concurrently. Once validated — especially
async tool calling behavior — switch production to proxy mode before implementing
BYOK. The flag makes this a zero-downtime, config-only change.