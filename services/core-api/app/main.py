import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry import trace
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    generate_latest,
)

from .config import get_settings
from .logging import configure_logging
from .observability.tracing import configure_tracing
from .health import router as health_router
from .auth.router import router as auth_router
from .auth.middleware import SessionMiddleware
from .routes.ai import router as ai_router
from .routes.legacy import router as legacy_router
from .routes.story import router as story_router
from .routes.story_version import router as story_version_router
from .routes.media import router as media_router, local_router as media_local_router
from .routes.invitation import router as invitation_router
from .routes.notification import router as notification_router
from .routes.user import router as user_router
from .routes.settings import router as settings_router
from .routes.support import router as support_router
from .routes.seo import router as seo_router
from .routes.story_evolution import router as story_evolution_router

logger = logging.getLogger(__name__)


REQUESTS = Counter(
    "core_api_http_requests_total",
    "HTTP requests",
    ["method", "path", "status"],
)


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


app = FastAPI(lifespan=lifespan, title="Core API", version="0.1.0")

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.app_url],  # Allow frontend to make requests
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

# Session middleware for Google OAuth authentication
app.add_middleware(SessionMiddleware)


@app.middleware("http")
async def metrics_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response: Response = await call_next(request)
    try:
        REQUESTS.labels(
            request.method, request.url.path, str(response.status_code)
        ).inc()
    except Exception:
        logger.warning("Failed to update metrics", exc_info=True)
    return response


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


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


app.include_router(health_router)
app.include_router(auth_router, prefix="/api")
app.include_router(ai_router)
app.include_router(legacy_router)
app.include_router(story_router)
app.include_router(story_version_router)
app.include_router(media_router)
app.include_router(media_local_router)
app.include_router(invitation_router)
app.include_router(notification_router)
app.include_router(user_router)
app.include_router(settings_router)
app.include_router(support_router)
app.include_router(seo_router)
app.include_router(story_evolution_router)
