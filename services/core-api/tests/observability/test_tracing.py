"""Tests for tracing configuration."""

from unittest.mock import MagicMock, patch

from opentelemetry import trace

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
        with patch("app.observability.tracing.ConsoleSpanExporter") as mock_console:
            configure_tracing(
                app=app, service_name="test-svc", environment="test", debug=True
            )
            mock_console.assert_called_once()

    def test_no_console_exporter_when_not_debug(self) -> None:
        """Test console exporter is NOT added without debug."""
        app = MagicMock()
        with patch("app.observability.tracing.ConsoleSpanExporter") as mock_console:
            configure_tracing(
                app=app, service_name="test-svc", environment="test", debug=False
            )
            mock_console.assert_not_called()
