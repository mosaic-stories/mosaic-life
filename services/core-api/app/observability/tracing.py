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
