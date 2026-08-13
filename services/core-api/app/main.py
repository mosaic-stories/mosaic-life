import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
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
from .auth.middleware import SessionMiddleware, require_auth
from .routes.ai import router as ai_router
from .routes.legacy import router as legacy_router
from .routes.story import router as story_router
from .routes.story_version import router as story_version_router
from .routes.media import router as media_router, local_router as media_local_router
from .routes.invitation import router as invitation_router
from .routes.notification import router as notification_router
from .routes.user import router as user_router
from .routes.profile import router as profile_router
from .routes.settings import router as settings_router
from .routes.support import router as support_router
from .routes.seo import router as seo_router
from .routes.person import router as person_router
from .routes.story_evolution import router as story_evolution_router
from .routes.legacy_link import router as legacy_link_router
from .routes.rewrite import router as rewrite_router
from .routes.graph_context import router as graph_context_router
from .routes.story_context import router as story_context_router
from .routes.story_response import router as story_response_router
from .routes.story_reaction import router as story_reaction_router
from .routes.favorite import router as favorite_router
from .routes.activity import router as activity_router
from .routes.activity import internal_router as activity_internal_router
from .routes.connections import router as connections_router
from .routes.connection_request import router as connection_request_router
from .routes.prompts import router as prompts_router
from .routes.tag import router as tag_router
from .routes.legacy_access_request import router as legacy_access_request_router

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


settings = get_settings()

# Interactive docs (/docs, /openapi.json, /redoc) leak route/schema details
# (#104 finding 12f). SessionMiddleware only *records* whether a request is
# authenticated — it never rejects one itself, so removing these paths from
# its public-path allowlist outside dev doesn't by itself stop FastAPI's
# built-in doc routes from serving unauthenticated (they never call
# require_auth). Disable the built-ins outside dev and register protected
# replacements for /docs and /openapi.json below; /redoc has no protected
# replacement, so it stays disabled outside dev.
_docs_enabled = settings.env == "dev"
app = FastAPI(
    lifespan=lifespan,
    title="Core API",
    version="0.1.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

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


def register_protected_docs(target_app: FastAPI) -> None:
    """Register /docs and /openapi.json guarded by require_auth.

    Only called outside dev, where the built-in docs_url/openapi_url are
    disabled. SessionMiddleware alone doesn't reject unauthenticated
    requests to non-public paths — only routes that call require_auth() do
    — so this is the actual enforcement point for #104 finding 12f.
    """

    @target_app.get("/openapi.json", include_in_schema=False)
    def protected_openapi(request: Request) -> JSONResponse:
        require_auth(request)
        # app.openapi() caches the computed schema on app.openapi_schema —
        # reuse it instead of calling get_openapi() directly, which would
        # rebuild the schema on every request.
        return JSONResponse(target_app.openapi())

    @target_app.get("/docs", include_in_schema=False)
    def protected_docs(request: Request) -> HTMLResponse:
        require_auth(request)
        return get_swagger_ui_html(
            openapi_url="/openapi.json", title=f"{target_app.title} - Docs"
        )


if not _docs_enabled:
    register_protected_docs(app)


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
app.include_router(profile_router)
app.include_router(support_router)
app.include_router(person_router)
app.include_router(seo_router)
app.include_router(story_evolution_router)
app.include_router(legacy_link_router)
app.include_router(rewrite_router)
app.include_router(graph_context_router)
app.include_router(story_context_router)
app.include_router(story_response_router)
app.include_router(story_reaction_router)
app.include_router(favorite_router)
app.include_router(activity_router)
app.include_router(activity_internal_router)
app.include_router(connections_router)
app.include_router(connection_request_router)
app.include_router(prompts_router)
app.include_router(tag_router)
app.include_router(legacy_access_request_router)
