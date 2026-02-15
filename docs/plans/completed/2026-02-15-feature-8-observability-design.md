# Feature 8: Observability & Monitoring — Design

## Scope

Instrument the AI conversation path with OpenTelemetry tracing, Prometheus metrics, and structured log enrichment. Exporter/backend configuration (where spans, metrics, and logs are sent) is **out of scope** — a separate effort handles that.

### What's in scope

1. **TracerProvider foundation** — Resource attributes, FastAPI auto-instrumentation, W3C trace context propagation
2. **AI-path span enrichment** — Fill orchestration-layer gaps in the storytelling agent and memory summarization flow
3. **Prometheus metrics** — Fix the broken registry, add AI-path histograms and counters
4. **Structured log enrichment** — Automatic `trace_id`, `span_id`, `service` injection into all log output
5. **Request correlation** — Trace ID in response headers for client-side correlation

### What's out of scope

- Exporter/backend configuration (OTLP endpoint, Jaeger, Grafana pipeline)
- Database query instrumentation
- Non-AI route instrumentation (beyond what FastAPI auto-instrumentation provides)
- Adding `component` or `version` fields to logs
- New dependencies

---

## 1. TracerProvider & FastAPI Auto-Instrumentation

### Current state

`app/observability/tracing.py` creates a bare `TracerProvider` with no Resource attributes. `opentelemetry-instrumentation-fastapi` is installed but never enabled.

### Changes

Enhance `configure_tracing()` to:

- Attach `Resource` with `service.name="core-api"`, `deployment.environment` (from `settings.env`)
- Call `FastAPIInstrumentor.instrument_app(app)` with excluded URLs for `/healthz`, `/readyz`, `/metrics`
- Add optional `ConsoleSpanExporter` when `OTEL_DEBUG=true` for local development visibility
- Keep the existing conditional OTLP exporter logic unchanged

### Signature change

```python
def configure_tracing(
    app: FastAPI,
    service_name: str = "core-api",
    environment: str = "dev",
    otlp_endpoint: str | None = None,
    debug: bool = False,
) -> None:
```

The function now accepts the FastAPI `app` instance (needed for `FastAPIInstrumentor.instrument_app()`), the environment string, and a debug flag.

### Settings addition

Add `otel_debug: bool` to `Settings`, reading from `OTEL_DEBUG` env var (default `False`).

---

## 2. Request Correlation via Trace ID

### Approach

Use the trace ID from OpenTelemetry's span context as the universal correlation ID. No separate request ID generation needed — FastAPI auto-instrumentation creates a root span per request, and the trace ID is available from that span.

### Middleware

Add an `http` middleware in `app/main.py` that:

1. Reads the trace ID from the current span context (set by FastAPI auto-instrumentation)
2. Sets `X-Trace-Id` response header with the hex trace ID
3. Stores the trace ID on `request.state.trace_id` for use by route handlers

This middleware must run **after** FastAPI auto-instrumentation has created the root span.

---

## 3. Structured Log Enrichment

### Current state

`app/logging.py` configures `JsonFormatter` with `%(asctime)s %(levelname)s %(name)s %(message)s`. Logs have no trace correlation.

### Changes

Add an `OTelContextFilter` (a `logging.Filter` subclass) that injects into every log record:

- `trace_id` — hex trace ID from the current span context (or `""` if none)
- `span_id` — hex span ID from the current span context (or `""` if none)
- `service` — always `"core-api"`

The filter is attached to the root logger's handler in `configure_logging()`. All 142 existing log statements automatically gain these fields with zero code changes.

### Implementation

```python
class OTelContextFilter(logging.Filter):
    def __init__(self, service_name: str = "core-api"):
        super().__init__()
        self.service_name = service_name

    def filter(self, record: logging.LogRecord) -> bool:
        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.trace_id:
            record.trace_id = format(ctx.trace_id, "032x")  # noqa: E501
            record.span_id = format(ctx.span_id, "016x")
        else:
            record.trace_id = ""
            record.span_id = ""
        record.service = self.service_name
        return True
```

---

## 4. Prometheus Metrics Fix + AI-Path Metrics

### Current state

`app/main.py` creates a `Counter` and a `CollectorRegistry` but they're disconnected. The `/metrics` endpoint returns empty data.

### Fix

Remove the unused `CollectorRegistry`. The `Counter` already registers with the default global registry. Change the `/metrics` endpoint to call `generate_latest()` with no arguments (uses default registry).

### New metrics module: `app/observability/metrics.py`

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `core_api_ai_request_duration_seconds` | Histogram | `provider`, `model`, `operation`, `persona_id` | End-to-end AI operation latency |
| `core_api_ai_tokens_total` | Counter | `provider`, `model`, `direction` | Token usage (input/output) |
| `core_api_ai_guardrail_triggers_total` | Counter | `provider`, `action` | Guardrail intervention tracking |
| `core_api_ai_retrieval_duration_seconds` | Histogram | `operation` | RAG retrieval latency |
| `core_api_ai_embedding_duration_seconds` | Histogram | `provider`, `model` | Embedding generation latency |

### Bucket configuration

```python
AI_LATENCY_BUCKETS = (0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0)
RETRIEVAL_LATENCY_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0)
EMBEDDING_LATENCY_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5)
```

### Recording pattern

Metrics are recorded alongside existing `span.set_attribute()` calls in provider adapters and service layer. No separate timing code — reuse existing `time.perf_counter()` calculations.

---

## 5. AI-Path Span Enrichment

### Current span inventory (conversation turn flow)

```
[auto] HTTP request span              ← FastAPI auto-instrumentation (NEW)
└─ ai.chat.request                     ← existing (routes/ai.py)
   ├─ [MISSING] orchestration span
   │  ├─ retrieval.retrieve_context    ← existing
   │  │  └─ retrieval.resolve_visibility ← existing
   │  ├─ ai.*.embed (query)           ← existing
   │  ├─ memory.get_facts_for_context  ← existing
   │  └─ [prompt assembly — no span, trivial]
   ├─ ai.chat.context_load            ← existing
   ├─ [MISSING] streaming span
   │  └─ ai.*.stream                  ← existing
   └─ memory.maybe_summarize          ← existing
      ├─ [MISSING] LLM call span
      │  └─ ai.*.stream              ← existing
      └─ [MISSING] embedding span
         └─ ai.*.embed              ← existing
```

### New spans

| Span name | File | Attributes |
|-----------|------|------------|
| `storytelling.prepare_turn` | `app/adapters/storytelling.py` | `legacy_id`, `user_id`, `persona_id`, `chunks_retrieved`, `facts_retrieved` |
| `storytelling.stream_response` | `app/adapters/storytelling.py` | `legacy_id`, `persona_id`, `ai.model` |
| `memory.summarize_llm` | `app/services/memory.py` | `conversation_id`, `input_message_count` |
| `memory.embed_summary` | `app/services/memory.py` | `conversation_id`, `text_length` |

### Resulting trace

```
[auto] POST /api/conversations/{id}/messages
└─ ai.chat.request
   ├─ storytelling.prepare_turn           ← NEW
   │  ├─ retrieval.retrieve_context
   │  │  └─ retrieval.resolve_visibility
   │  ├─ ai.*.embed (query)
   │  ├─ memory.get_facts_for_context
   │  └─ [prompt assembly — no span]
   ├─ ai.chat.context_load
   ├─ storytelling.stream_response        ← NEW
   │  └─ ai.*.stream
   └─ memory.maybe_summarize
      ├─ memory.summarize_llm             ← NEW
      │  └─ ai.*.stream
      └─ memory.embed_summary             ← NEW
         └─ ai.*.embed
```

---

## 6. File Change Summary

### Modified files (7)

| File | Changes |
|------|---------|
| `app/observability/tracing.py` | Add Resource, FastAPIInstrumentor, optional ConsoleSpanExporter |
| `app/logging.py` | Add `OTelContextFilter` for trace_id/span_id/service injection |
| `app/main.py` | Fix Prometheus registry, add trace ID response header middleware |
| `app/config/settings.py` | Add `otel_debug` setting |
| `app/adapters/storytelling.py` | Add `storytelling.prepare_turn` and `storytelling.stream_response` spans |
| `app/services/memory.py` | Add `memory.summarize_llm` and `memory.embed_summary` spans |
| `app/adapters/bedrock.py` | Add Prometheus metric recording alongside existing spans |
| `app/adapters/openai.py` | Add Prometheus metric recording alongside existing spans |

### New files (1)

| File | Purpose |
|------|---------|
| `app/observability/metrics.py` | Prometheus metric definitions |

### No changes to

- Existing span names or attributes (additive only)
- Route handlers or business logic
- Dependencies (`pyproject.toml` already has everything needed)
- Any test files

---

## 7. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Use OTel trace ID as correlation ID | One ID for both traces and logs; no UUID generation overhead |
| FastAPI auto-instrumentation for HTTP spans | Free W3C propagation, consistent HTTP metrics, zero manual effort |
| Exclude health/metrics from auto-instrumentation | Reduce noise from liveness probes |
| Default Prometheus registry | Simpler than managing a custom registry; standard pattern |
| Metrics in separate module | Clean separation; importable from any adapter/service |
| `ConsoleSpanExporter` gated by `OTEL_DEBUG` | Local dev visibility without requiring Jaeger/OTLP backend |
| No spans for prompt assembly or CRUD operations | Too trivial; would add noise without actionable insight |
