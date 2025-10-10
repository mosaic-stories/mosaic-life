import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    generate_latest,
)

from .config import get_settings
from .logging import configure_logging
from .observability.tracing import configure_tracing
from .health import router as health_router
from .auth.router import router as auth_router


REQUESTS = Counter(
    "core_api_http_requests_total",
    "HTTP requests",
    ["method", "path", "status"],
)
REGISTRY = CollectorRegistry()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    configure_tracing("core-api", settings.otel_exporter_otlp_endpoint)
    logging.getLogger(__name__).info("core-api.start", extra={"env": settings.env})
    yield
    logging.getLogger(__name__).info("core-api.stop")


app = FastAPI(lifespan=lifespan, title="Core API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # locked down; app relies on same-origin with cookies
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.middleware("http")
async def metrics_middleware(
    request: Request, call_next: callable
) -> Response:
    response: Response = await call_next(request)
    try:
        REQUESTS.labels(
            request.method, request.url.path, str(response.status_code)
        ).inc()
    except Exception:
        pass
    return response


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


app.include_router(health_router)
app.include_router(auth_router, prefix="/api")
