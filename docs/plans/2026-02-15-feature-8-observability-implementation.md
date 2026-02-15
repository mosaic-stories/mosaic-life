# Feature 8: Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Instrument the AI conversation path with OpenTelemetry tracing, Prometheus metrics, and structured log enrichment so every conversation turn produces a complete, correlated trace.

**Architecture:** Fix the TracerProvider foundation (Resource attributes, FastAPI auto-instrumentation), add missing spans in the storytelling agent and memory summarization orchestration layer, create Prometheus metrics for AI operations, and enrich structured logs with trace context. Exporter configuration is out of scope.

**Tech Stack:** OpenTelemetry SDK (already installed), opentelemetry-instrumentation-fastapi (already installed), prometheus-client (already installed), python-json-logger (already installed)

**Design doc:** `docs/plans/2026-02-15-feature-8-observability-design.md`

---

### Task 1: Prometheus Metrics Module

**Files:**
- Create: `services/core-api/app/observability/__init__.py`
- Create: `services/core-api/app/observability/metrics.py`
- Create: `services/core-api/tests/observability/__init__.py`
- Create: `services/core-api/tests/observability/test_metrics.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/observability/__init__.py` (empty file).

Create `services/core-api/tests/observability/test_metrics.py`:

```python
"""Tests for observability metrics definitions."""

from prometheus_client import CollectorRegistry, Counter, Histogram

from app.observability.metrics import (
    AI_EMBEDDING_DURATION,
    AI_GUARDRAIL_TRIGGERS,
    AI_LATENCY_BUCKETS,
    AI_REQUEST_DURATION,
    AI_RETRIEVAL_DURATION,
    AI_TOKENS,
    EMBEDDING_LATENCY_BUCKETS,
    RETRIEVAL_LATENCY_BUCKETS,
)


class TestMetricDefinitions:
    """Verify metric objects are properly defined."""

    def test_ai_request_duration_is_histogram(self) -> None:
        assert isinstance(AI_REQUEST_DURATION, Histogram)

    def test_ai_request_duration_labels(self) -> None:
        assert AI_REQUEST_DURATION._labelnames == (
            "provider",
            "model",
            "operation",
            "persona_id",
        )

    def test_ai_tokens_is_counter(self) -> None:
        assert isinstance(AI_TOKENS, Counter)

    def test_ai_tokens_labels(self) -> None:
        assert AI_TOKENS._labelnames == ("provider", "model", "direction")

    def test_ai_guardrail_triggers_is_counter(self) -> None:
        assert isinstance(AI_GUARDRAIL_TRIGGERS, Counter)

    def test_ai_guardrail_triggers_labels(self) -> None:
        assert AI_GUARDRAIL_TRIGGERS._labelnames == ("provider", "action")

    def test_ai_retrieval_duration_is_histogram(self) -> None:
        assert isinstance(AI_RETRIEVAL_DURATION, Histogram)

    def test_ai_retrieval_duration_labels(self) -> None:
        assert AI_RETRIEVAL_DURATION._labelnames == ("operation",)

    def test_ai_embedding_duration_is_histogram(self) -> None:
        assert isinstance(AI_EMBEDDING_DURATION, Histogram)

    def test_ai_embedding_duration_labels(self) -> None:
        assert AI_EMBEDDING_DURATION._labelnames == ("provider", "model")

    def test_bucket_configurations_exist(self) -> None:
        assert len(AI_LATENCY_BUCKETS) > 0
        assert len(RETRIEVAL_LATENCY_BUCKETS) > 0
        assert len(EMBEDDING_LATENCY_BUCKETS) > 0
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/observability/test_metrics.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.observability.metrics'`

**Step 3: Write the implementation**

Create `services/core-api/app/observability/__init__.py` (empty file).

Create `services/core-api/app/observability/metrics.py`:

```python
"""Prometheus metric definitions for AI observability."""

from prometheus_client import Counter, Histogram

# --- Bucket configurations ---

AI_LATENCY_BUCKETS = (0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0)
RETRIEVAL_LATENCY_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0)
EMBEDDING_LATENCY_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5)

# --- AI request metrics ---

AI_REQUEST_DURATION = Histogram(
    "core_api_ai_request_duration_seconds",
    "AI operation latency in seconds",
    ["provider", "model", "operation", "persona_id"],
    buckets=AI_LATENCY_BUCKETS,
)

AI_TOKENS = Counter(
    "core_api_ai_tokens_total",
    "AI token usage",
    ["provider", "model", "direction"],
)

AI_GUARDRAIL_TRIGGERS = Counter(
    "core_api_ai_guardrail_triggers_total",
    "Guardrail intervention count",
    ["provider", "action"],
)

# --- Retrieval metrics ---

AI_RETRIEVAL_DURATION = Histogram(
    "core_api_ai_retrieval_duration_seconds",
    "RAG retrieval latency in seconds",
    ["operation"],
    buckets=RETRIEVAL_LATENCY_BUCKETS,
)

# --- Embedding metrics ---

AI_EMBEDDING_DURATION = Histogram(
    "core_api_ai_embedding_duration_seconds",
    "Embedding generation latency in seconds",
    ["provider", "model"],
    buckets=EMBEDDING_LATENCY_BUCKETS,
)
```

**Step 4: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/observability/test_metrics.py -v
```

Expected: All PASS

**Step 5: Validate**

```bash
cd /apps/mosaic-life && just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/observability/__init__.py services/core-api/app/observability/metrics.py services/core-api/tests/observability/__init__.py services/core-api/tests/observability/test_metrics.py
git commit -m "feat(observability): add Prometheus metric definitions for AI path"
```

---

### Task 2: Structured Log Enrichment (OTelContextFilter)

**Files:**
- Modify: `services/core-api/app/logging.py`
- Create: `services/core-api/tests/observability/test_logging.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/observability/test_logging.py`:

```python
"""Tests for structured log enrichment with OTel context."""

import logging

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

from app.logging import OTelContextFilter


class TestOTelContextFilter:
    """Tests for OTel context log filter."""

    def test_filter_adds_service_field(self) -> None:
        f = OTelContextFilter(service_name="core-api")
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None,
        )
        result = f.filter(record)
        assert result is True
        assert record.service == "core-api"  # type: ignore[attr-defined]

    def test_filter_adds_empty_trace_id_without_span(self) -> None:
        f = OTelContextFilter(service_name="core-api")
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None,
        )
        f.filter(record)
        assert record.trace_id == ""  # type: ignore[attr-defined]
        assert record.span_id == ""  # type: ignore[attr-defined]

    def test_filter_adds_trace_id_with_active_span(self) -> None:
        provider = TracerProvider()
        tracer = provider.get_tracer("test")

        f = OTelContextFilter(service_name="core-api")
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None,
        )

        with tracer.start_as_current_span("test-span"):
            f.filter(record)

        assert record.trace_id != ""  # type: ignore[attr-defined]
        assert len(record.trace_id) == 32  # type: ignore[attr-defined]
        assert record.span_id != ""  # type: ignore[attr-defined]
        assert len(record.span_id) == 16  # type: ignore[attr-defined]

    def test_filter_always_returns_true(self) -> None:
        """Filter should never suppress log records."""
        f = OTelContextFilter(service_name="core-api")
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None,
        )
        assert f.filter(record) is True
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/observability/test_logging.py -v
```

Expected: FAIL — `ImportError: cannot import name 'OTelContextFilter' from 'app.logging'`

**Step 3: Write the implementation**

Modify `services/core-api/app/logging.py`. Add the `OTelContextFilter` class and attach it to the handler in `configure_logging()`:

The full file should become:

```python
import logging
import sys

from opentelemetry import trace

try:
    from pythonjsonlogger.json import JsonFormatter
except ImportError:
    from pythonjsonlogger import jsonlogger

    JsonFormatter = jsonlogger.JsonFormatter  # type: ignore[misc,attr-defined]


class OTelContextFilter(logging.Filter):
    """Inject OpenTelemetry trace context into log records."""

    def __init__(self, service_name: str = "core-api"):
        super().__init__()
        self.service_name = service_name

    def filter(self, record: logging.LogRecord) -> bool:
        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.trace_id:
            record.trace_id = format(ctx.trace_id, "032x")  # type: ignore[attr-defined]
            record.span_id = format(ctx.span_id, "016x")  # type: ignore[attr-defined]
        else:
            record.trace_id = ""  # type: ignore[attr-defined]
            record.span_id = ""  # type: ignore[attr-defined]
        record.service = self.service_name  # type: ignore[attr-defined]
        return True


def configure_logging(level: str = "info") -> None:
    lvl = getattr(logging, level.upper(), logging.INFO)
    logger = logging.getLogger()
    logger.setLevel(lvl)
    handler = logging.StreamHandler(sys.stdout)
    fmt = JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    handler.setFormatter(fmt)
    handler.addFilter(OTelContextFilter())
    logger.handlers = [handler]
```

**Step 4: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/observability/test_logging.py -v
```

Expected: All PASS

**Step 5: Validate**

```bash
cd /apps/mosaic-life && just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/logging.py services/core-api/tests/observability/test_logging.py
git commit -m "feat(observability): add OTelContextFilter for trace-correlated structured logs"
```

---

### Task 3: TracerProvider Foundation + FastAPI Auto-Instrumentation

**Files:**
- Modify: `services/core-api/app/observability/tracing.py`
- Modify: `services/core-api/app/config/settings.py`
- Modify: `services/core-api/app/main.py`
- Create: `services/core-api/tests/observability/test_tracing.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/observability/test_tracing.py`:

```python
"""Tests for tracing configuration."""

from unittest.mock import MagicMock, patch

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

from app.observability.tracing import configure_tracing


class TestConfigureTracing:
    """Tests for configure_tracing setup."""

    def test_sets_tracer_provider(self) -> None:
        """Test that a TracerProvider is set globally."""
        app = MagicMock()
        configure_tracing(app=app, service_name="test-svc", environment="test")
        provider = trace.get_tracer_provider()
        # The provider should be a ProxyTracerProvider wrapping our TracerProvider
        # Just verify we can get a tracer from it
        tracer = provider.get_tracer("test")
        assert tracer is not None

    def test_instruments_fastapi_app(self) -> None:
        """Test that FastAPIInstrumentor is called with the app."""
        app = MagicMock()
        with patch(
            "app.observability.tracing.FastAPIInstrumentor"
        ) as mock_instrumentor:
            configure_tracing(app=app, service_name="test-svc", environment="test")
            mock_instrumentor.instrument_app.assert_called_once()
            call_kwargs = mock_instrumentor.instrument_app.call_args
            assert call_kwargs[1]["app"] is app

    def test_excludes_health_and_metrics_urls(self) -> None:
        """Test that health and metrics endpoints are excluded."""
        app = MagicMock()
        with patch(
            "app.observability.tracing.FastAPIInstrumentor"
        ) as mock_instrumentor:
            configure_tracing(app=app, service_name="test-svc", environment="test")
            call_kwargs = mock_instrumentor.instrument_app.call_args
            excluded = call_kwargs[1]["excluded_urls"]
            assert "healthz" in excluded
            assert "readyz" in excluded
            assert "metrics" in excluded

    def test_console_exporter_when_debug(self) -> None:
        """Test console exporter is added in debug mode."""
        app = MagicMock()
        with patch(
            "app.observability.tracing.ConsoleSpanExporter"
        ) as mock_console:
            configure_tracing(
                app=app, service_name="test-svc", environment="test", debug=True
            )
            mock_console.assert_called_once()

    def test_no_console_exporter_when_not_debug(self) -> None:
        """Test console exporter is NOT added without debug."""
        app = MagicMock()
        with patch(
            "app.observability.tracing.ConsoleSpanExporter"
        ) as mock_console:
            configure_tracing(
                app=app, service_name="test-svc", environment="test", debug=False
            )
            mock_console.assert_not_called()
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/observability/test_tracing.py -v
```

Expected: FAIL — `TypeError` because current `configure_tracing` doesn't accept `app` parameter

**Step 3: Write the implementation**

Replace `services/core-api/app/observability/tracing.py`:

```python
"""OpenTelemetry tracing configuration."""

from __future__ import annotations

from typing import TYPE_CHECKING

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
    SimpleSpanProcessor,
)

if TYPE_CHECKING:
    from fastapi import FastAPI


def configure_tracing(
    app: FastAPI,
    service_name: str = "core-api",
    environment: str = "dev",
    otlp_endpoint: str | None = None,
    debug: bool = False,
) -> None:
    """Configure OpenTelemetry tracing with Resource and FastAPI auto-instrumentation.

    Args:
        app: FastAPI application instance to instrument.
        service_name: Service name for Resource attributes.
        environment: Deployment environment (dev, staging, prod).
        otlp_endpoint: Optional OTLP HTTP endpoint for span export.
        debug: If True, add ConsoleSpanExporter for local visibility.
    """
    resource = Resource.create(
        {
            "service.name": service_name,
            "deployment.environment": environment,
        }
    )

    provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(provider)

    if otlp_endpoint:
        exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))

    if debug:
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))

    FastAPIInstrumentor.instrument_app(
        app=app,
        excluded_urls="healthz,readyz,metrics",
    )
```

**Step 4: Update settings and main.py**

Add `otel_debug` to `services/core-api/app/config/settings.py`. Add this line after the existing `otel_exporter_otlp_endpoint` line (line 89):

```python
    otel_debug: bool = _as_bool(os.getenv("OTEL_DEBUG"), False)
```

Update `services/core-api/app/main.py`:

1. Remove unused `CollectorRegistry` import
2. Remove `REGISTRY = CollectorRegistry()` line
3. Update `configure_tracing` call in `lifespan()` to pass `app` and new params
4. Fix `/metrics` endpoint to use default registry (already does since `generate_latest()` with no args uses default)
5. Add trace ID response header middleware

The `main.py` imports section changes:

```python
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    generate_latest,
)
```

Remove the `REGISTRY = CollectorRegistry()` line (line 39).

Update `lifespan()` to:

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    configure_tracing(
        app=app,
        service_name="core-api",
        environment=settings.env,
        otlp_endpoint=settings.otel_exporter_otlp_endpoint,
        debug=settings.otel_debug,
    )
    logging.getLogger(__name__).info("core-api.start", extra={"env": settings.env})
    yield
    logging.getLogger(__name__).info("core-api.stop")
```

Add a trace ID response header middleware **after** the existing `metrics_middleware`:

```python
@app.middleware("http")
async def trace_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response: Response = await call_next(request)
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx and ctx.trace_id:
        response.headers["X-Trace-Id"] = format(ctx.trace_id, "032x")
    return response
```

Add `from opentelemetry import trace` to the imports in `main.py`.

**Step 5: Run tests to verify they pass**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/observability/test_tracing.py -v
```

Expected: All PASS

**Step 6: Run full test suite to check for regressions**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest -x -v
```

The `configure_tracing` signature changed, so `conftest.py` (which imports `app.main` → triggers `lifespan`) should still work because `lifespan` is only invoked during app startup, not at import time.

**Step 7: Validate**

```bash
cd /apps/mosaic-life && just validate-backend
```

**Step 8: Commit**

```bash
git add services/core-api/app/observability/tracing.py services/core-api/app/config/settings.py services/core-api/app/main.py services/core-api/tests/observability/test_tracing.py
git commit -m "feat(observability): configure TracerProvider with Resource, FastAPI auto-instrumentation, and trace ID middleware"
```

---

### Task 4: Storytelling Agent Span Enrichment

**Files:**
- Modify: `services/core-api/app/adapters/storytelling.py`
- Modify: `services/core-api/tests/adapters/test_storytelling_memory.py`

**Step 1: Write the failing test**

Add to `services/core-api/tests/adapters/test_storytelling_memory.py`:

```python
class TestPrepareTurnTracing:
    """Tests for tracing in prepare_turn."""

    @pytest.mark.asyncio
    async def test_prepare_turn_creates_span(self):
        """Test that prepare_turn creates a storytelling.prepare_turn span."""
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export.in_memory import InMemorySpanExporter

        exporter = InMemorySpanExporter()
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor

        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))

        mock_llm = MagicMock()
        mock_vector_store = AsyncMock()
        mock_vector_store.retrieve_context.return_value = []
        mock_memory = AsyncMock()
        mock_memory.get_context_messages.return_value = []
        mock_guardrail = MagicMock()
        mock_guardrail.get_bedrock_guardrail.return_value = (None, None)

        agent = DefaultStorytellingAgent(
            llm_provider=mock_llm,
            vector_store=mock_vector_store,
            memory=mock_memory,
            guardrail=mock_guardrail,
        )

        mock_db = AsyncMock()
        user_id = uuid4()
        legacy_id = uuid4()

        with patch(
            "app.adapters.storytelling.memory_service.get_facts_for_context",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "app.adapters.storytelling.trace.get_tracer",
            return_value=provider.get_tracer("test"),
        ):
            await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=user_id,
                user_query="Tell me about them",
                legacy_id=legacy_id,
                persona_id="biographer",
                legacy_name="John",
            )

        spans = exporter.get_finished_spans()
        span_names = [s.name for s in spans]
        assert "storytelling.prepare_turn" in span_names

        pt_span = next(s for s in spans if s.name == "storytelling.prepare_turn")
        attrs = dict(pt_span.attributes)
        assert attrs["user_id"] == str(user_id)
        assert attrs["legacy_id"] == str(legacy_id)
        assert attrs["persona_id"] == "biographer"
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_storytelling_memory.py::TestPrepareTurnTracing -v
```

Expected: FAIL — no span named `storytelling.prepare_turn` exists

**Step 3: Write the implementation**

Modify `services/core-api/app/adapters/storytelling.py`:

1. Add tracer import at the top of the file (after the existing imports):

```python
from opentelemetry import trace
```

2. Add tracer instantiation after the `logger` line:

```python
tracer = trace.get_tracer("core-api.storytelling")
```

3. Wrap the `prepare_turn` method body with a span. Change the method to:

```python
    async def prepare_turn(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        user_id: UUID,
        user_query: str,
        legacy_id: UUID,
        persona_id: str,
        legacy_name: str,
        top_k: int = 5,
    ) -> PreparedStoryTurn:
        with tracer.start_as_current_span("storytelling.prepare_turn") as span:
            span.set_attribute("user_id", str(user_id))
            span.set_attribute("legacy_id", str(legacy_id))
            span.set_attribute("persona_id", persona_id)

            chunks: list[ChunkResult] = []

            try:
                chunks = await self.vector_store.retrieve_context(
                    db=db,
                    query=user_query,
                    legacy_id=legacy_id,
                    user_id=user_id,
                    top_k=top_k,
                )
            except Exception as exc:
                logger.warning(
                    "ai.chat.rag_retrieval_failed",
                    extra={
                        "conversation_id": str(conversation_id),
                        "error": str(exc),
                    },
                )

            story_context = self.context_formatter(chunks)

            # Fetch legacy facts for system prompt injection
            facts = []
            try:
                facts = await memory_service.get_facts_for_context(
                    db=db, legacy_id=legacy_id, user_id=user_id
                )
            except Exception as exc:
                logger.warning(
                    "ai.chat.facts_retrieval_failed",
                    extra={
                        "conversation_id": str(conversation_id),
                        "error": str(exc),
                    },
                )

            span.set_attribute("chunks_retrieved", len(chunks))
            span.set_attribute("facts_retrieved", len(facts))

            system_prompt = build_system_prompt(
                persona_id, legacy_name, story_context, facts=facts
            )
            if not system_prompt:
                raise AIProviderError(
                    message="Failed to build system prompt",
                    retryable=False,
                    code="invalid_request",
                    provider="storytelling",
                    operation="prepare_turn",
                )

            context_messages = await self.memory.get_context_messages(
                db=db,
                conversation_id=conversation_id,
            )
            guardrail_id, guardrail_version = self.guardrail.get_bedrock_guardrail()

            return PreparedStoryTurn(
                context_messages=context_messages,
                system_prompt=system_prompt,
                chunks_count=len(chunks),
                guardrail_id=guardrail_id,
                guardrail_version=guardrail_version,
            )
```

4. Wrap the `stream_response` method body with a span:

```python
    async def stream_response(
        self,
        turn: PreparedStoryTurn,
        model_id: str,
        max_tokens: int,
    ) -> AsyncGenerator[str, None]:
        with tracer.start_as_current_span("storytelling.stream_response") as span:
            span.set_attribute("ai.model", model_id)
            async for chunk in self.llm_provider.stream_generate(
                messages=turn.context_messages,
                system_prompt=turn.system_prompt,
                model_id=model_id,
                max_tokens=max_tokens,
                guardrail_id=turn.guardrail_id,
                guardrail_version=turn.guardrail_version,
            ):
                yield chunk
```

**Step 4: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_storytelling_memory.py -v
```

Expected: All PASS

**Step 5: Validate**

```bash
cd /apps/mosaic-life && just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/adapters/storytelling.py services/core-api/tests/adapters/test_storytelling_memory.py
git commit -m "feat(observability): add tracing spans to storytelling agent prepare_turn and stream_response"
```

---

### Task 5: Memory Service Span Enrichment

**Files:**
- Modify: `services/core-api/app/services/memory.py`
- Modify: `services/core-api/tests/services/test_memory_summarization.py`

**Step 1: Read the existing summarization tests to understand patterns**

Read `services/core-api/tests/services/test_memory_summarization.py` before writing tests. The test should follow the same mock patterns.

**Step 2: Write the failing test**

Add to `services/core-api/tests/services/test_memory_summarization.py` a new test class:

```python
class TestSummarizationTracing:
    """Tests for tracing spans in summarization path."""

    @pytest.mark.asyncio
    async def test_summarize_llm_creates_span(self):
        """Test _call_summarize_llm creates a memory.summarize_llm span."""
        from unittest.mock import patch, AsyncMock
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor
        from opentelemetry.sdk.trace.export.in_memory import InMemorySpanExporter

        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))

        mock_llm = AsyncMock()

        async def mock_stream(*args, **kwargs):
            yield '{"summary": "test", "facts": []}'

        mock_llm.stream_generate = mock_stream

        mock_registry = MagicMock()
        mock_registry.get_llm_provider.return_value = mock_llm

        messages = [{"role": "user", "content": "hello"}]

        with patch(
            "app.services.memory.get_provider_registry",
            return_value=mock_registry,
        ), patch(
            "app.services.memory.tracer",
            provider.get_tracer("test"),
        ):
            from app.services.memory import _call_summarize_llm
            await _call_summarize_llm(messages, "John")

        spans = exporter.get_finished_spans()
        span_names = [s.name for s in spans]
        assert "memory.summarize_llm" in span_names

        llm_span = next(s for s in spans if s.name == "memory.summarize_llm")
        assert llm_span.attributes["input_message_count"] == 1

    @pytest.mark.asyncio
    async def test_embed_summary_creates_span(self):
        """Test _embed_text creates a memory.embed_summary span."""
        from unittest.mock import patch, AsyncMock
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor
        from opentelemetry.sdk.trace.export.in_memory import InMemorySpanExporter

        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))

        mock_embedding = AsyncMock()
        mock_embedding.embed_texts.return_value = [[0.1] * 1024]

        mock_registry = MagicMock()
        mock_registry.get_embedding_provider.return_value = mock_embedding

        with patch(
            "app.services.memory.get_provider_registry",
            return_value=mock_registry,
        ), patch(
            "app.services.memory.tracer",
            provider.get_tracer("test"),
        ):
            from app.services.memory import _embed_text
            result = await _embed_text("A test summary")

        spans = exporter.get_finished_spans()
        span_names = [s.name for s in spans]
        assert "memory.embed_summary" in span_names

        embed_span = next(s for s in spans if s.name == "memory.embed_summary")
        assert embed_span.attributes["text_length"] == len("A test summary")
```

**Step 2b: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_memory_summarization.py::TestSummarizationTracing -v
```

Expected: FAIL — no span named `memory.summarize_llm` exists

**Step 3: Write the implementation**

Modify `services/core-api/app/services/memory.py`. Wrap the `_call_summarize_llm` and `_embed_text` functions with spans:

Replace `_call_summarize_llm` (lines 210-229):

```python
async def _call_summarize_llm(messages: list[dict[str, str]], legacy_name: str) -> str:
    """Call the LLM to summarize messages and extract facts.

    This is a thin wrapper to make mocking straightforward in tests.
    """
    from ..providers.registry import get_provider_registry

    with tracer.start_as_current_span("memory.summarize_llm") as span:
        span.set_attribute("input_message_count", len(messages))

        llm = get_provider_registry().get_llm_provider()
        prompt = SUMMARIZE_AND_EXTRACT_PROMPT.format(legacy_name=legacy_name)

        full_response = ""
        async for chunk in llm.stream_generate(
            messages=messages,
            system_prompt=prompt,
            model_id="",  # Use provider default
            max_tokens=1024,
        ):
            full_response += chunk

        return full_response
```

Replace `_embed_text` (lines 232-238):

```python
async def _embed_text(text: str) -> list[float]:
    """Embed a single text string. Thin wrapper for testability."""
    from ..providers.registry import get_provider_registry

    with tracer.start_as_current_span("memory.embed_summary") as span:
        span.set_attribute("text_length", len(text))

        embedding_provider = get_provider_registry().get_embedding_provider()
        [embedding] = await embedding_provider.embed_texts([text])
        return embedding
```

**Step 4: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_memory_summarization.py -v
```

Expected: All PASS

**Step 5: Validate**

```bash
cd /apps/mosaic-life && just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/services/memory.py services/core-api/tests/services/test_memory_summarization.py
git commit -m "feat(observability): add tracing spans for memory summarization LLM and embedding calls"
```

---

### Task 6: Bedrock Adapter Metrics Recording

**Files:**
- Modify: `services/core-api/app/adapters/bedrock.py`
- Modify: `services/core-api/tests/adapters/test_bedrock.py`

**Step 1: Write the failing test**

Add to `services/core-api/tests/adapters/test_bedrock.py`:

```python
class TestBedrockMetricsRecording:
    """Tests for Prometheus metrics recording in Bedrock adapter."""

    @pytest.fixture
    def adapter(self) -> BedrockAdapter:
        return BedrockAdapter(region="us-east-1")

    @pytest.mark.asyncio
    async def test_stream_generate_records_duration_metric(
        self, adapter: BedrockAdapter
    ) -> None:
        """Test that stream_generate records AI request duration metric."""

        async def mock_stream_iterator():
            events = [
                {"contentBlockDelta": {"delta": {"text": "OK"}}},
                {"messageStop": {"stopReason": "end_turn"}},
                {"metadata": {"usage": {"outputTokens": 5}}},
            ]
            for event in events:
                yield event

        mock_response = {"stream": mock_stream_iterator()}

        with (
            patch.object(adapter, "_get_client") as mock_get_client,
            patch("app.adapters.bedrock.AI_REQUEST_DURATION") as mock_hist,
            patch("app.adapters.bedrock.AI_TOKENS") as mock_tokens,
        ):
            mock_client = AsyncMock()
            mock_client.converse_stream = AsyncMock(return_value=mock_response)
            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_client)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_get_client.return_value = mock_context

            async for _ in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            ):
                pass

            mock_hist.labels.assert_called_once_with(
                provider="bedrock",
                model="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                operation="stream_generate",
                persona_id="",
            )
            mock_hist.labels.return_value.observe.assert_called_once()

    @pytest.mark.asyncio
    async def test_embed_texts_records_embedding_duration(
        self, adapter: BedrockAdapter
    ) -> None:
        """Test that embed_texts records embedding duration metric."""
        import json as json_mod

        mock_body = AsyncMock()
        mock_body.read.return_value = json_mod.dumps(
            {"embedding": [0.1] * 1024}
        ).encode()
        mock_response = {"body": mock_body}
        mock_client = AsyncMock()
        mock_client.invoke_model = AsyncMock(return_value=mock_response)

        with (
            patch.object(adapter, "_get_client") as mock_get_client,
            patch("app.adapters.bedrock.AI_EMBEDDING_DURATION") as mock_hist,
        ):
            mock_cm = AsyncMock()
            mock_cm.__aenter__.return_value = mock_client
            mock_cm.__aexit__.return_value = None
            mock_get_client.return_value = mock_cm

            await adapter.embed_texts(["Hello"])

            mock_hist.labels.assert_called_once_with(
                provider="bedrock",
                model="amazon.titan-embed-text-v2:0",
            )
            mock_hist.labels.return_value.observe.assert_called_once()
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_bedrock.py::TestBedrockMetricsRecording -v
```

Expected: FAIL — `AI_REQUEST_DURATION` not importable from `app.adapters.bedrock`

**Step 3: Write the implementation**

Modify `services/core-api/app/adapters/bedrock.py`:

1. Add metrics imports after the existing telemetry imports:

```python
from ..observability.metrics import (
    AI_EMBEDDING_DURATION,
    AI_GUARDRAIL_TRIGGERS,
    AI_REQUEST_DURATION,
    AI_TOKENS,
)
```

2. In the `stream_generate` method, add metrics recording in the `finally` block (after the existing `AI_LATENCY_MS` attribute, around line 350-353). Add these lines right before the closing of the `finally` block:

```python
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(
                    AI_LATENCY_MS,
                    int(elapsed * 1000),
                )
                AI_REQUEST_DURATION.labels(
                    provider="bedrock",
                    model=model_id,
                    operation="stream_generate",
                    persona_id="",
                ).observe(elapsed)
```

3. Also in `stream_generate`, after `span.set_attribute("output_tokens", total_tokens)` (around line 280), add token counter:

```python
                    span.set_attribute("output_tokens", total_tokens)
                    if total_tokens:
                        AI_TOKENS.labels(
                            provider="bedrock",
                            model=model_id,
                            direction="output",
                        ).inc(total_tokens)
```

4. In the guardrail intervention block (around line 245-246), after `span.set_attribute("guardrail_intervened", True)`, add:

```python
                                AI_GUARDRAIL_TRIGGERS.labels(
                                    provider="bedrock", action="blocked"
                                ).inc()
```

5. In the `embed_texts` method, add metrics recording in the `finally` block (around line 453-457):

```python
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(
                    AI_LATENCY_MS,
                    int(elapsed * 1000),
                )
                AI_EMBEDDING_DURATION.labels(
                    provider="bedrock",
                    model=model_id,
                ).observe(elapsed)
```

**Step 4: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_bedrock.py -v
```

Expected: All PASS

**Step 5: Validate**

```bash
cd /apps/mosaic-life && just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/adapters/bedrock.py services/core-api/tests/adapters/test_bedrock.py
git commit -m "feat(observability): add Prometheus metrics recording to Bedrock adapter"
```

---

### Task 7: OpenAI Adapter Metrics Recording

**Files:**
- Modify: `services/core-api/app/adapters/openai.py`
- Modify: `services/core-api/tests/adapters/test_openai.py`

**Step 1: Write the failing test**

Add to `services/core-api/tests/adapters/test_openai.py` (follow same pattern as Bedrock):

```python
class TestOpenAIMetricsRecording:
    """Tests for Prometheus metrics recording in OpenAI adapter."""

    @pytest.fixture
    def provider(self) -> OpenAIProvider:
        return OpenAIProvider(api_key="test-key")

    @pytest.mark.asyncio
    async def test_stream_generate_records_duration_metric(
        self, provider: OpenAIProvider
    ) -> None:
        """Test that stream_generate records AI request duration metric."""

        async def mock_stream_response(method, url, **kwargs):
            class MockResponse:
                status_code = 200
                async def aiter_lines(self):
                    yield 'data: {"choices":[{"delta":{"content":"Hi"}}]}'
                    yield "data: [DONE]"
                async def __aenter__(self):
                    return self
                async def __aexit__(self, *args):
                    pass

            return MockResponse()

        with (
            patch.object(provider, "_client") as mock_client_cm,
            patch("app.adapters.openai.AI_REQUEST_DURATION") as mock_hist,
        ):
            mock_client = AsyncMock()
            mock_client.stream = mock_stream_response
            mock_client_cm.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_cm.return_value.__aexit__ = AsyncMock(return_value=None)

            async for _ in provider.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="gpt-4o-mini",
            ):
                pass

            mock_hist.labels.assert_called_once_with(
                provider="openai",
                model="gpt-4o-mini",
                operation="stream_generate",
                persona_id="",
            )
            mock_hist.labels.return_value.observe.assert_called_once()

    @pytest.mark.asyncio
    async def test_embed_texts_records_embedding_duration(
        self, provider: OpenAIProvider
    ) -> None:
        """Test that embed_texts records embedding duration metric."""

        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"embedding": [0.1] * 1024}]
        }

        with (
            patch.object(provider, "_client") as mock_client_cm,
            patch("app.adapters.openai.AI_EMBEDDING_DURATION") as mock_hist,
        ):
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_cm.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_cm.return_value.__aexit__ = AsyncMock(return_value=None)

            await provider.embed_texts(["Hello"])

            mock_hist.labels.assert_called_once_with(
                provider="openai",
                model="text-embedding-3-small",
            )
            mock_hist.labels.return_value.observe.assert_called_once()
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_openai.py::TestOpenAIMetricsRecording -v
```

Expected: FAIL — `AI_REQUEST_DURATION` not importable from `app.adapters.openai`

**Step 3: Write the implementation**

Modify `services/core-api/app/adapters/openai.py`:

1. Add metrics imports after existing telemetry imports:

```python
from ..observability.metrics import (
    AI_EMBEDDING_DURATION,
    AI_REQUEST_DURATION,
)
```

2. In the `stream_generate` method `finally` block (lines 208-212), add metrics recording:

```python
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(
                    AI_LATENCY_MS,
                    int(elapsed * 1000),
                )
                AI_REQUEST_DURATION.labels(
                    provider="openai",
                    model=resolved_model,
                    operation="stream_generate",
                    persona_id="",
                ).observe(elapsed)
```

3. In the `embed_texts` method `finally` block (lines 285-289), add metrics recording:

```python
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(
                    AI_LATENCY_MS,
                    int(elapsed * 1000),
                )
                AI_EMBEDDING_DURATION.labels(
                    provider="openai",
                    model=resolved_model,
                ).observe(elapsed)
```

**Step 4: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/adapters/test_openai.py -v
```

Expected: All PASS

**Step 5: Validate**

```bash
cd /apps/mosaic-life && just validate-backend
```

**Step 6: Commit**

```bash
git add services/core-api/app/adapters/openai.py services/core-api/tests/adapters/test_openai.py
git commit -m "feat(observability): add Prometheus metrics recording to OpenAI adapter"
```

---

### Task 8: Retrieval Service Metrics Recording

**Files:**
- Modify: `services/core-api/app/services/retrieval.py`

This is a small additive change — add `AI_RETRIEVAL_DURATION` recording to the three existing spans. No new tests needed since the spans already exist and are tested; we're just adding metric `.observe()` calls alongside existing `span.set_attribute()` calls.

**Step 1: Add metrics import and recording**

Modify `services/core-api/app/services/retrieval.py`:

1. Add import at top:

```python
import time

from ..observability.metrics import AI_RETRIEVAL_DURATION
```

2. In `resolve_visibility_filter`, add timing around the span (this is a DB call, not critical for metrics). **Skip this one** — visibility resolution is a DB query, not worth a histogram.

3. In `store_chunks` (line 114), add timing:

```python
    started = time.perf_counter()
    with tracer.start_as_current_span("retrieval.store_chunks") as span:
        # ... existing code ...
        # At end, before return:
        AI_RETRIEVAL_DURATION.labels(operation="store_chunks").observe(
            time.perf_counter() - started
        )
        return len(chunks)
```

4. In `delete_chunks_for_story` (line 153), add timing:

```python
    started = time.perf_counter()
    with tracer.start_as_current_span("retrieval.delete_chunks") as span:
        # ... existing code ...
        # At end, before return:
        AI_RETRIEVAL_DURATION.labels(operation="delete_chunks").observe(
            time.perf_counter() - started
        )
        return deleted
```

5. In `retrieve_context` (line 209), add timing:

```python
    started = time.perf_counter()
    with tracer.start_as_current_span("retrieval.retrieve_context") as span:
        # ... existing code ...
        # At end, before return:
        AI_RETRIEVAL_DURATION.labels(operation="retrieve_context").observe(
            time.perf_counter() - started
        )
        return chunks
```

**Step 2: Run existing tests to verify no regressions**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest tests/services/test_retrieval.py -v
```

Expected: All PASS

**Step 3: Validate**

```bash
cd /apps/mosaic-life && just validate-backend
```

**Step 4: Commit**

```bash
git add services/core-api/app/services/retrieval.py
git commit -m "feat(observability): add retrieval duration metrics to vector store operations"
```

---

### Task 9: Full Regression Test + Final Validation

**Files:** None (validation only)

**Step 1: Run full test suite**

```bash
cd /apps/mosaic-life/services/core-api && uv run pytest -v
```

Expected: All tests PASS

**Step 2: Run full validation**

```bash
cd /apps/mosaic-life && just validate-backend
```

Expected: Clean (no ruff errors, no mypy errors)

**Step 3: Review all changes**

```bash
cd /apps/mosaic-life && git diff develop --stat
```

Verify the file list matches what we planned:
- `app/observability/__init__.py` (new)
- `app/observability/metrics.py` (new)
- `app/observability/tracing.py` (modified)
- `app/logging.py` (modified)
- `app/main.py` (modified)
- `app/config/settings.py` (modified)
- `app/adapters/storytelling.py` (modified)
- `app/adapters/bedrock.py` (modified)
- `app/adapters/openai.py` (modified)
- `app/services/memory.py` (modified)
- `app/services/retrieval.py` (modified)
- Test files (new/modified)
