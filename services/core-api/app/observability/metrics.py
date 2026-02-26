"""Prometheus metric definitions for AI observability."""

from prometheus_client import Counter, Gauge, Histogram

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

# --- Graph context metrics ---

GRAPH_LATENCY_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5)

GRAPH_CONTEXT_LATENCY = Histogram(
    "core_api_graph_context_latency_seconds",
    "Graph context assembly latency in seconds",
    ["phase"],
    buckets=GRAPH_LATENCY_BUCKETS,
)

GRAPH_CONTEXT_RESULTS = Counter(
    "core_api_graph_context_results_total",
    "Graph context results by source",
    ["source"],
)

GRAPH_CONTEXT_CIRCUIT_STATE = Gauge(
    "core_api_graph_context_circuit_state",
    "Graph context circuit breaker state (0=closed, 1=open, 2=half_open)",
    ["state"],
)

ENTITY_EXTRACTION_ENTITIES = Counter(
    "core_api_entity_extraction_entities_total",
    "Entities extracted by type",
    ["type"],
)

NEPTUNE_QUERY_LATENCY = Histogram(
    "core_api_neptune_query_latency_seconds",
    "Neptune graph query latency in seconds",
    ["query_type"],
    buckets=GRAPH_LATENCY_BUCKETS,
)
