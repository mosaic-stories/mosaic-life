"""Tests for structured log enrichment with OTel context."""

import logging

from opentelemetry.sdk.trace import TracerProvider

from app.logging import OTelContextFilter


class TestOTelContextFilter:
    """Tests for OTel context log filter."""

    def test_filter_adds_service_field(self) -> None:
        f = OTelContextFilter(service_name="core-api")
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )
        result = f.filter(record)
        assert result is True
        assert record.service == "core-api"  # type: ignore[attr-defined]

    def test_filter_adds_empty_trace_id_without_span(self) -> None:
        f = OTelContextFilter(service_name="core-api")
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )
        f.filter(record)
        assert record.trace_id == ""  # type: ignore[attr-defined]
        assert record.span_id == ""  # type: ignore[attr-defined]

    def test_filter_adds_trace_id_with_active_span(self) -> None:
        provider = TracerProvider()
        tracer = provider.get_tracer("test")

        f = OTelContextFilter(service_name="core-api")
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
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
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )
        assert f.filter(record) is True
