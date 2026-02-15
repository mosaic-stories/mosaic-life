"""Tests for observability metrics definitions."""

from prometheus_client import Counter, Histogram

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
