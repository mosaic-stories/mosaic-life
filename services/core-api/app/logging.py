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
