# Voice AI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time voice conversations to Mosaic Life using Pipecat + Bedrock Nova Sonic as a separate voice-api service.

**Architecture:** Separate `voice-api` service (FastAPI + Pipecat) communicates with `core-api` via signed JWT tokens and internal HTTP. Core-api owns auth, personas, and story creation. Voice-api owns real-time audio pipelines and usage tracking. Both share the same Aurora PostgreSQL instance.

**Tech Stack:** Pipecat (pipecat-ai[aws]), FastAPI, Bedrock Nova Sonic, asyncpg, PyJWT, httpx, OpenTelemetry

**Design doc:** `docs/plans/2026-03-22-voice-implementation-design.md`

---

## Task 1: Voice API Service Scaffold

Create the new `services/voice-api/` service with project structure, dependencies, and health checks.

**Files:**
- Create: `services/voice-api/pyproject.toml`
- Create: `services/voice-api/app/__init__.py`
- Create: `services/voice-api/app/main.py`
- Create: `services/voice-api/app/config.py`
- Create: `services/voice-api/Dockerfile`
- Create: `services/voice-api/tests/__init__.py`

**Step 1: Create pyproject.toml**

```toml
[project]
name = "voice-api"
version = "0.1.0"
description = "Voice conversation service for Mosaic Life"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.30.0",
  "pydantic>=2.8.0",
  "pydantic-settings>=2.5.0",
  "pipecat-ai[aws]>=0.0.60",
  "asyncpg>=0.29.0",
  "pgvector>=0.4.2",
  "pyjwt>=2.8.0",
  "httpx>=0.27.0",
  "opentelemetry-sdk>=1.25.0",
  "opentelemetry-instrumentation-fastapi>=0.46b0",
  "opentelemetry-exporter-otlp>=1.25.0",
  "prometheus-client>=0.20.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0.0",
  "pytest-asyncio>=0.23.0",
  "ruff>=0.5.0",
  "mypy>=1.19.0",
]

[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]

[tool.mypy]
python_version = "3.12"
strict = true
warn_unused_ignores = true
warn_return_any = true
disallow_untyped_defs = true
```

**Step 2: Create config.py**

```python
"""Voice API configuration."""

from pydantic_settings import BaseSettings


class VoiceConfig(BaseSettings):
    """Configuration loaded from environment variables."""

    env: str = "dev"
    port: int = 8081
    log_level: str = "info"

    # Bedrock Nova Sonic (direct mode)
    aws_region: str = "us-east-1"
    nova_sonic_model_id: str = "amazon.nova-2-sonic-v1:0"

    # Voice settings
    voice_default_voice: str = "matthew"
    voice_session_max_minutes: int = 30
    voice_endpointing_sensitivity: str = "MEDIUM"
    voice_max_concurrent_per_user: int = 2

    # JWT validation
    voice_jwt_secret: str = "dev-voice-jwt-secret"
    voice_jwt_algorithm: str = "HS256"

    # Core API (for draft story creation)
    core_api_internal_url: str = "http://localhost:8080"
    voice_service_key: str = "dev-voice-service-key"

    # Database (same Aurora instance as core-api)
    db_url: str = "postgresql://postgres:postgres@localhost:15432/mosaic"

    # Observability
    otel_exporter_otlp_endpoint: str | None = None

    # Usage tracking
    usage_tracking_enabled: bool = True

    model_config = {"env_prefix": "", "case_sensitive": False}
```

**Step 3: Create main.py with health checks**

```python
"""Voice API application entry point."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from .config import VoiceConfig

logger = logging.getLogger(__name__)
config = VoiceConfig()

# Module-level DB pool
_db_pool: asyncpg.Pool | None = None


async def get_db_pool() -> asyncpg.Pool:
    """Get the asyncpg connection pool."""
    if _db_pool is None:
        raise RuntimeError("Database pool not initialized")
    return _db_pool


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifecycle — DB pool startup/shutdown."""
    global _db_pool
    logger.info("voice-api.starting", extra={"env": config.env})

    _db_pool = await asyncpg.create_pool(
        dsn=config.db_url,
        min_size=2,
        max_size=10,
    )

    yield

    if _db_pool:
        await _db_pool.close()
    logger.info("voice-api.stopped")


app = FastAPI(lifespan=lifespan, title="Voice API", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.get("/readyz")
async def readyz() -> dict[str, bool]:
    pool = await get_db_pool()
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"ready": True}
    except Exception:
        return {"ready": False}


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=config.port, reload=True)
```

**Step 4: Create Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir .

EXPOSE 8081

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081"]
```

**Step 5: Create `__init__.py` files**

Empty files for `app/__init__.py` and `tests/__init__.py`.

**Step 6: Verify the service starts**

```bash
cd services/voice-api
uv sync
uv run python -m app.main
# Expected: Uvicorn running on http://0.0.0.0:8081
# Ctrl+C to stop
```

**Step 7: Commit**

```bash
git add services/voice-api/
git commit -m "feat(voice): scaffold voice-api service with health checks and config"
```

---

## Task 2: JWT Voice Token — Auth Module in Voice API

Create the JWT validation module that voice-api uses to authenticate WebSocket connections.

**Files:**
- Create: `services/voice-api/app/auth.py`
- Create: `services/voice-api/tests/test_auth.py`

**Step 1: Write the failing test**

```python
# services/voice-api/tests/test_auth.py
"""Tests for voice JWT token validation."""

import time
from uuid import uuid4

import jwt
import pytest

from app.auth import VoiceTokenPayload, validate_voice_token


def _make_token(payload: dict, secret: str = "test-secret") -> str:
    return jwt.encode(payload, secret, algorithm="HS256")


def test_valid_token():
    user_id = str(uuid4())
    legacy_id = str(uuid4())
    token = _make_token(
        {
            "user_id": user_id,
            "legacy_id": legacy_id,
            "persona_id": "biographer",
            "exp": int(time.time()) + 300,
        }
    )
    result = validate_voice_token(token, secret="test-secret")
    assert result is not None
    assert result.user_id == user_id
    assert result.legacy_id == legacy_id
    assert result.persona_id == "biographer"


def test_expired_token():
    token = _make_token(
        {
            "user_id": str(uuid4()),
            "legacy_id": str(uuid4()),
            "persona_id": "biographer",
            "exp": int(time.time()) - 10,
        }
    )
    result = validate_voice_token(token, secret="test-secret")
    assert result is None


def test_invalid_signature():
    token = _make_token(
        {
            "user_id": str(uuid4()),
            "legacy_id": str(uuid4()),
            "persona_id": "biographer",
            "exp": int(time.time()) + 300,
        },
        secret="wrong-secret",
    )
    result = validate_voice_token(token, secret="test-secret")
    assert result is None
```

**Step 2: Run test to verify it fails**

```bash
cd services/voice-api
uv run pytest tests/test_auth.py -v
# Expected: FAIL — ImportError (app.auth doesn't exist yet)
```

**Step 3: Write the implementation**

```python
# services/voice-api/app/auth.py
"""JWT voice token validation."""

import logging
from dataclasses import dataclass

import jwt

logger = logging.getLogger(__name__)


@dataclass
class VoiceTokenPayload:
    """Validated voice token claims."""

    user_id: str
    legacy_id: str
    persona_id: str
    system_prompt: str | None = None


def validate_voice_token(
    token: str,
    secret: str,
    algorithm: str = "HS256",
) -> VoiceTokenPayload | None:
    """Validate a voice JWT token and extract claims.

    Args:
        token: The JWT token string.
        secret: The signing secret.
        algorithm: JWT algorithm (default HS256).

    Returns:
        VoiceTokenPayload if valid, None otherwise.
    """
    try:
        payload = jwt.decode(token, secret, algorithms=[algorithm])
        return VoiceTokenPayload(
            user_id=payload["user_id"],
            legacy_id=payload["legacy_id"],
            persona_id=payload["persona_id"],
            system_prompt=payload.get("system_prompt"),
        )
    except jwt.ExpiredSignatureError:
        logger.warning("voice.token.expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning("voice.token.invalid", extra={"error": str(e)})
        return None
    except KeyError as e:
        logger.warning("voice.token.missing_claim", extra={"claim": str(e)})
        return None
```

**Step 4: Run tests to verify they pass**

```bash
cd services/voice-api
uv run pytest tests/test_auth.py -v
# Expected: 3 passed
```

**Step 5: Commit**

```bash
git add services/voice-api/app/auth.py services/voice-api/tests/test_auth.py
git commit -m "feat(voice): add JWT voice token validation"
```

---

## Task 3: Voice Token Endpoint on Core API

Add `POST /api/voice/token` to core-api. This endpoint validates the user session, loads the persona, builds the system prompt, and returns a signed JWT + WebSocket URL.

**Files:**
- Create: `services/core-api/app/routes/voice.py`
- Create: `services/core-api/tests/test_voice_token.py`
- Modify: `services/core-api/app/main.py` (add router)
- Modify: `services/core-api/app/config/settings.py` (add voice settings)

**Step 1: Add voice settings to core-api Settings**

Add to `services/core-api/app/config/settings.py` inside the `Settings` class, after the existing `internal_api_token` field:

```python
    # Voice service
    voice_enabled: bool = _as_bool(os.getenv("VOICE_ENABLED"), False)
    voice_jwt_secret: str = os.getenv(
        "VOICE_JWT_SECRET", "dev-voice-jwt-secret"
    )
    voice_jwt_ttl_seconds: int = int(os.getenv("VOICE_JWT_TTL_SECONDS", "300"))
    voice_websocket_base_url: str = os.getenv(
        "VOICE_WEBSOCKET_BASE_URL", "ws://localhost:8081"
    )
```

**Step 2: Write the route**

```python
# services/core-api/app/routes/voice.py
"""Voice token endpoint — issues signed JWTs for voice-api WebSocket auth."""

import logging
import time

import jwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..config import get_settings
from ..config.personas import build_system_prompt, get_persona, load_personas
from ..database import get_db
from ..models.legacy import Legacy, LegacyMember
from fastapi import Depends

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

VOICE_PROMPT_WRAPPER = (
    "\n\n[Voice Conversation Mode]\n"
    "You are in a real-time voice conversation. "
    "Keep responses conversational and concise — aim for 1-3 sentences per turn. "
    "Do not use markdown formatting, bullet points, or numbered lists. "
    "Speak naturally as if in person. "
    "If the user pauses, wait — do not fill silence unprompted."
)


class VoiceTokenRequest(BaseModel):
    legacy_id: str
    persona_id: str = "biographer"


class VoiceTokenResponse(BaseModel):
    token: str
    websocket_url: str
    persona_id: str
    persona_name: str


@router.post("/token", response_model=VoiceTokenResponse)
async def create_voice_token(
    body: VoiceTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> VoiceTokenResponse:
    """Issue a signed JWT for voice-api WebSocket authentication.

    Validates user session, checks legacy access, builds persona prompt,
    and returns a short-lived token.
    """
    settings = get_settings()

    if not settings.voice_enabled:
        raise HTTPException(status_code=404, detail="Voice feature is not enabled")

    session = require_auth(request)

    # Validate persona exists
    persona = get_persona(body.persona_id)
    if not persona:
        available = [p.id for p in load_personas().values()]
        raise HTTPException(
            status_code=400,
            detail=f"Unknown persona '{body.persona_id}'. Available: {available}",
        )

    # Check user has access to the legacy
    result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == body.legacy_id,
            LegacyMember.user_id == session.user_id,
            LegacyMember.role != "pending",
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this legacy")

    # Get legacy name for prompt building
    legacy_result = await db.execute(
        select(Legacy.name).where(Legacy.id == body.legacy_id)
    )
    legacy_name = legacy_result.scalar_one_or_none()
    if not legacy_name:
        raise HTTPException(status_code=404, detail="Legacy not found")

    # Build system prompt using existing persona infrastructure
    system_prompt = build_system_prompt(
        persona_id=body.persona_id,
        legacy_name=legacy_name,
    )
    if not system_prompt:
        raise HTTPException(status_code=500, detail="Failed to build system prompt")

    # Append voice-specific wrapper
    system_prompt = system_prompt + VOICE_PROMPT_WRAPPER

    # Sign JWT
    now = int(time.time())
    token_payload = {
        "user_id": str(session.user_id),
        "legacy_id": body.legacy_id,
        "persona_id": body.persona_id,
        "system_prompt": system_prompt,
        "iat": now,
        "exp": now + settings.voice_jwt_ttl_seconds,
    }
    token = jwt.encode(
        token_payload,
        settings.voice_jwt_secret,
        algorithm="HS256",
    )

    websocket_url = f"{settings.voice_websocket_base_url}/{body.legacy_id}"

    logger.info(
        "voice.token.issued",
        extra={
            "user_id": str(session.user_id),
            "legacy_id": body.legacy_id,
            "persona_id": body.persona_id,
        },
    )

    return VoiceTokenResponse(
        token=token,
        websocket_url=websocket_url,
        persona_id=body.persona_id,
        persona_name=persona.name,
    )
```

**Step 3: Register the router in main.py**

Add to `services/core-api/app/main.py`:

```python
# After existing imports, add:
from .routes.voice import router as voice_router

# After existing router includes, add:
app.include_router(voice_router)
```

**Step 4: Add `pyjwt` dependency to core-api**

Add `"pyjwt>=2.8.0"` to the `dependencies` list in `services/core-api/pyproject.toml`.

**Step 5: Run `just validate-backend` to verify**

```bash
just validate-backend
# Expected: ruff and mypy pass
```

**Step 6: Commit**

```bash
git add services/core-api/app/routes/voice.py services/core-api/app/main.py \
       services/core-api/app/config/settings.py services/core-api/pyproject.toml
git commit -m "feat(voice): add POST /api/voice/token endpoint to core-api"
```

---

## Task 4: Voice Usage Tracking — Database Migration + Usage Module

Create the `voice_usage` table migration and the usage accumulator module in voice-api.

**Files:**
- Create: `services/voice-api/alembic.ini`
- Create: `services/voice-api/alembic/env.py`
- Create: `services/voice-api/alembic/versions/001_create_voice_usage_table.py`
- Create: `services/voice-api/app/usage.py`
- Create: `services/voice-api/tests/test_usage.py`

**Step 1: Set up Alembic for voice-api**

Create `services/voice-api/alembic.ini`:

```ini
[alembic]
script_location = alembic
sqlalchemy.url = postgresql://postgres:postgres@localhost:15432/mosaic

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

Create `services/voice-api/alembic/env.py` (minimal — no ORM models, just raw SQL migrations):

```python
"""Alembic environment for voice-api migrations."""

from alembic import context

target_metadata = None


def run_migrations_online() -> None:
    from sqlalchemy import create_engine

    connectable = create_engine(context.config.get_main_option("sqlalchemy.url", ""))

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
```

Create the directory structure:

```bash
mkdir -p services/voice-api/alembic/versions
touch services/voice-api/alembic/__init__.py
touch services/voice-api/alembic/versions/__init__.py
```

**Step 2: Write the migration**

Create `services/voice-api/alembic/versions/001_create_voice_usage_table.py`:

```python
"""Create voice_usage table.

Revision ID: 001
Create Date: 2026-03-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "voice_usage",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("legacy_id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", sa.Text, nullable=False),
        sa.Column("persona_id", sa.Text, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("speech_input_tokens", sa.Integer, server_default="0"),
        sa.Column("speech_output_tokens", sa.Integer, server_default="0"),
        sa.Column("text_input_tokens", sa.Integer, server_default="0"),
        sa.Column("text_output_tokens", sa.Integer, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Numeric(10, 6), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index(
        "idx_voice_usage_user_month",
        "voice_usage",
        ["user_id", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_voice_usage_user_month")
    op.drop_table("voice_usage")
```

**Step 3: Write the usage accumulator**

```python
# services/voice-api/app/usage.py
"""Voice usage tracking — accumulates token counts and persists to PostgreSQL."""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import asyncpg

logger = logging.getLogger(__name__)


@dataclass
class VoiceUsageAccumulator:
    """Accumulates token usage across a voice session."""

    user_id: str
    legacy_id: str
    session_id: str
    persona_id: str
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    speech_input_tokens: int = 0
    speech_output_tokens: int = 0
    text_input_tokens: int = 0
    text_output_tokens: int = 0

    @property
    def estimated_cost_usd(self) -> float:
        """Estimate cost based on Nova Sonic pricing.

        Speech: $0.0034/1K input, $0.0136/1K output
        Text:   $0.00006/1K input, $0.00024/1K output
        """
        return (
            (self.speech_input_tokens / 1000) * 0.0034
            + (self.speech_output_tokens / 1000) * 0.0136
            + (self.text_input_tokens / 1000) * 0.00006
            + (self.text_output_tokens / 1000) * 0.00024
        )

    def update_from_metrics(self, metrics: dict[str, int]) -> None:
        """Update from Pipecat metrics events."""
        self.speech_input_tokens += metrics.get("speech_input_tokens", 0)
        self.speech_output_tokens += metrics.get("speech_output_tokens", 0)
        self.text_input_tokens += metrics.get("text_input_tokens", 0)
        self.text_output_tokens += metrics.get("text_output_tokens", 0)


async def persist_usage(pool: asyncpg.Pool, usage: VoiceUsageAccumulator) -> None:
    """Write accumulated usage to PostgreSQL."""
    try:
        await pool.execute(
            """
            INSERT INTO voice_usage (
                user_id, legacy_id, session_id, persona_id,
                started_at, ended_at,
                speech_input_tokens, speech_output_tokens,
                text_input_tokens, text_output_tokens,
                estimated_cost_usd
            ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
            usage.user_id,
            usage.legacy_id,
            usage.session_id,
            usage.persona_id,
            usage.started_at,
            datetime.now(timezone.utc),
            usage.speech_input_tokens,
            usage.speech_output_tokens,
            usage.text_input_tokens,
            usage.text_output_tokens,
            usage.estimated_cost_usd,
        )
        logger.info(
            "voice.usage.persisted",
            extra={
                "session_id": usage.session_id,
                "cost_usd": f"{usage.estimated_cost_usd:.6f}",
            },
        )
    except Exception:
        logger.exception("voice.usage.persist_failed")
```

**Step 4: Write tests for usage accumulator**

```python
# services/voice-api/tests/test_usage.py
"""Tests for voice usage tracking."""

from app.usage import VoiceUsageAccumulator


def test_cost_estimation():
    usage = VoiceUsageAccumulator(
        user_id="user-1",
        legacy_id="legacy-1",
        session_id="session-1",
        persona_id="biographer",
    )
    usage.speech_input_tokens = 1000
    usage.speech_output_tokens = 1000
    # Expected: (1000/1000)*0.0034 + (1000/1000)*0.0136 = 0.017
    assert abs(usage.estimated_cost_usd - 0.017) < 0.0001


def test_update_from_metrics():
    usage = VoiceUsageAccumulator(
        user_id="user-1",
        legacy_id="legacy-1",
        session_id="session-1",
        persona_id="biographer",
    )
    usage.update_from_metrics({"speech_input_tokens": 500, "speech_output_tokens": 300})
    usage.update_from_metrics({"speech_input_tokens": 200, "text_input_tokens": 100})
    assert usage.speech_input_tokens == 700
    assert usage.speech_output_tokens == 300
    assert usage.text_input_tokens == 100
    assert usage.text_output_tokens == 0
```

**Step 5: Run tests**

```bash
cd services/voice-api
uv run pytest tests/test_usage.py -v
# Expected: 2 passed
```

**Step 6: Commit**

```bash
git add services/voice-api/alembic* services/voice-api/app/usage.py services/voice-api/tests/test_usage.py
git commit -m "feat(voice): add voice_usage migration and usage tracking module"
```

---

## Task 5: Session Manager

Create the in-memory concurrent session tracker.

**Files:**
- Create: `services/voice-api/app/session.py`
- Create: `services/voice-api/tests/test_session.py`

**Step 1: Write the failing test**

```python
# services/voice-api/tests/test_session.py
"""Tests for voice session management."""

from app.session import SessionManager


def test_can_start_within_limit():
    mgr = SessionManager(max_per_user=2)
    assert mgr.can_start("user-1") is True


def test_can_start_at_limit():
    mgr = SessionManager(max_per_user=2)
    mgr.register("user-1", "legacy-a")
    mgr.register("user-1", "legacy-b")
    assert mgr.can_start("user-1") is False


def test_unregister_frees_slot():
    mgr = SessionManager(max_per_user=1)
    mgr.register("user-1", "legacy-a")
    assert mgr.can_start("user-1") is False
    mgr.unregister("user-1", "legacy-a")
    assert mgr.can_start("user-1") is True


def test_users_are_independent():
    mgr = SessionManager(max_per_user=1)
    mgr.register("user-1", "legacy-a")
    assert mgr.can_start("user-2") is True


def test_active_sessions_count():
    mgr = SessionManager(max_per_user=3)
    mgr.register("user-1", "legacy-a")
    mgr.register("user-1", "legacy-b")
    assert mgr.active_count("user-1") == 2
    assert mgr.active_count("user-2") == 0
```

**Step 2: Run test to verify it fails**

```bash
cd services/voice-api
uv run pytest tests/test_session.py -v
# Expected: FAIL — ImportError
```

**Step 3: Write the implementation**

```python
# services/voice-api/app/session.py
"""In-memory concurrent voice session tracking."""

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class SessionManager:
    """Tracks active voice sessions per user.

    Thread-safe for single-process async usage (GIL protects dict ops).
    For multi-replica deployments, this means the limit is per-pod,
    not global. Acceptable for v1.
    """

    def __init__(self, max_per_user: int = 2) -> None:
        self.max_per_user = max_per_user
        self._sessions: dict[str, set[str]] = defaultdict(set)

    def can_start(self, user_id: str) -> bool:
        """Check if user can start a new voice session."""
        return len(self._sessions[user_id]) < self.max_per_user

    def register(self, user_id: str, legacy_id: str) -> None:
        """Register a new active session."""
        self._sessions[user_id].add(legacy_id)
        logger.info(
            "voice.session.registered",
            extra={
                "user_id": user_id,
                "legacy_id": legacy_id,
                "active": len(self._sessions[user_id]),
            },
        )

    def unregister(self, user_id: str, legacy_id: str) -> None:
        """Remove a session when it ends."""
        self._sessions[user_id].discard(legacy_id)
        if not self._sessions[user_id]:
            del self._sessions[user_id]
        logger.info(
            "voice.session.unregistered",
            extra={"user_id": user_id, "legacy_id": legacy_id},
        )

    def active_count(self, user_id: str) -> int:
        """Get number of active sessions for a user."""
        return len(self._sessions[user_id])
```

**Step 4: Run tests**

```bash
cd services/voice-api
uv run pytest tests/test_session.py -v
# Expected: 5 passed
```

**Step 5: Commit**

```bash
git add services/voice-api/app/session.py services/voice-api/tests/test_session.py
git commit -m "feat(voice): add concurrent session manager"
```

---

## Task 6: RAG Tools for Voice

Create pgvector search tools that Pipecat will call during voice conversations.

**Files:**
- Create: `services/voice-api/app/tools.py`
- Create: `services/voice-api/tests/test_tools.py`

**Step 1: Write the tools module**

This module defines the tool schemas and handlers. The handlers use asyncpg directly to query `story_chunks` and `legacies` tables.

```python
# services/voice-api/app/tools.py
"""Voice conversation RAG tools — pgvector search and legacy context."""

import logging
from typing import Any

import asyncpg

logger = logging.getLogger(__name__)

VOICE_TOOLS_DEFINITION: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_stories",
            "description": (
                "Search the legacy's stored stories and memories for context "
                "relevant to the current conversation topic. Use this when the "
                "user references past events, people, places, or experiences."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum stories to retrieve (default 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_legacy_context",
            "description": (
                "Retrieve summary information about the legacy — key life events, "
                "dates, and biography. Use at conversation start or when the "
                "user asks broad questions about the person."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


async def handle_search_stories(
    pool: asyncpg.Pool,
    legacy_id: str,
    args: dict[str, Any],
) -> dict[str, Any]:
    """Execute pgvector similarity search against story_chunks.

    Note: This does a text-based search using pg_trgm similarity
    for v1 since we don't have embedding generation in voice-api.
    Full vector search requires calling an embedding provider,
    which will be added when the spike validates the pipeline.
    """
    query = args.get("query", "")
    max_results = args.get("max_results", 5)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT content, story_id
            FROM story_chunks
            WHERE legacy_id = $1::uuid
              AND visibility IN ('public', 'private')
            ORDER BY content <-> $2
            LIMIT $3
            """,
            legacy_id,
            query,
            max_results,
        )

    stories = [
        {"content": row["content"], "story_id": str(row["story_id"])}
        for row in rows
    ]

    logger.info(
        "voice.tool.search_stories",
        extra={"legacy_id": legacy_id, "query_len": len(query), "results": len(stories)},
    )
    return {"stories": stories, "count": len(stories)}


async def handle_get_legacy_context(
    pool: asyncpg.Pool,
    legacy_id: str,
) -> dict[str, Any]:
    """Retrieve legacy summary from the legacies table."""
    async with pool.acquire() as conn:
        legacy = await conn.fetchrow(
            """
            SELECT name, biography, birth_date, death_date
            FROM legacies
            WHERE id = $1::uuid
            """,
            legacy_id,
        )

    if not legacy:
        return {"error": "Legacy not found"}

    return {
        "name": legacy["name"],
        "biography": legacy["biography"],
        "birth_date": str(legacy["birth_date"]) if legacy["birth_date"] else None,
        "death_date": str(legacy["death_date"]) if legacy["death_date"] else None,
    }
```

**Step 2: Write basic tests**

```python
# services/voice-api/tests/test_tools.py
"""Tests for voice RAG tool definitions."""

from app.tools import VOICE_TOOLS_DEFINITION


def test_tools_have_correct_structure():
    assert len(VOICE_TOOLS_DEFINITION) == 2
    names = {t["function"]["name"] for t in VOICE_TOOLS_DEFINITION}
    assert names == {"search_stories", "get_legacy_context"}


def test_search_stories_has_required_params():
    search_tool = next(
        t for t in VOICE_TOOLS_DEFINITION if t["function"]["name"] == "search_stories"
    )
    params = search_tool["function"]["parameters"]
    assert "query" in params["required"]
```

**Step 3: Run tests**

```bash
cd services/voice-api
uv run pytest tests/test_tools.py -v
# Expected: 2 passed
```

**Step 4: Commit**

```bash
git add services/voice-api/app/tools.py services/voice-api/tests/test_tools.py
git commit -m "feat(voice): add RAG tool definitions and handlers"
```

---

## Task 7: Transcript-to-Story Module

Create the module that sends voice transcripts to core-api for draft story creation.

**Files:**
- Create: `services/voice-api/app/transcript.py`
- Create: `services/core-api/app/routes/internal.py` (new internal endpoint)
- Modify: `services/core-api/app/main.py` (add internal router)

**Step 1: Write the voice-api transcript client**

```python
# services/voice-api/app/transcript.py
"""Post-session transcript extraction — sends to core-api for draft story creation."""

import logging

import httpx

from .config import VoiceConfig

logger = logging.getLogger(__name__)
config = VoiceConfig()


async def send_transcript_for_story_creation(
    user_id: str,
    legacy_id: str,
    persona_id: str,
    transcript: list[dict[str, str]],
) -> bool:
    """Send voice transcript to core-api for draft story creation.

    Args:
        user_id: The user who had the conversation.
        legacy_id: The legacy being discussed.
        persona_id: The persona used in the conversation.
        transcript: List of {"role": "user"|"assistant", "text": "..."} turns.

    Returns:
        True if the request was accepted, False otherwise.
    """
    if not transcript:
        logger.info("voice.transcript.empty", extra={"user_id": user_id})
        return False

    url = f"{config.core_api_internal_url}/internal/voice/draft-story"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                json={
                    "user_id": user_id,
                    "legacy_id": legacy_id,
                    "persona_id": persona_id,
                    "transcript": transcript,
                },
                headers={
                    "Authorization": f"Bearer {config.voice_service_key}",
                    "Content-Type": "application/json",
                },
            )

        if response.status_code == 202:
            logger.info(
                "voice.transcript.accepted",
                extra={
                    "user_id": user_id,
                    "legacy_id": legacy_id,
                    "turns": len(transcript),
                },
            )
            return True

        logger.warning(
            "voice.transcript.rejected",
            extra={
                "status": response.status_code,
                "body": response.text[:200],
            },
        )
        return False

    except httpx.HTTPError:
        logger.exception("voice.transcript.send_failed")
        return False
```

**Step 2: Create the internal endpoint on core-api**

```python
# services/core-api/app/routes/internal.py
"""Internal service-to-service endpoints (not exposed via public ingress)."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from ..config import get_settings
from ..database import get_db
from ..models.associations import StoryLegacy
from ..models.story import Story

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/voice", tags=["internal"])


class TranscriptTurn(BaseModel):
    role: str  # "user" or "assistant"
    text: str


class DraftStoryRequest(BaseModel):
    user_id: str
    legacy_id: str
    persona_id: str
    transcript: list[TranscriptTurn]


def _verify_service_key(authorization: str = Header(...)) -> None:
    """Verify the service-to-service key."""
    settings = get_settings()
    expected = f"Bearer {settings.voice_service_key}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid service key")


async def _create_draft_story(
    user_id: str,
    legacy_id: str,
    persona_id: str,
    transcript: list[TranscriptTurn],
) -> None:
    """Background task: extract story from transcript via LLM and create draft.

    This calls the existing LiteLLM adapter to process the transcript
    and creates a Story record with status='draft'.
    """
    from ..database import get_async_session_factory
    from ..providers.registry import get_provider_registry

    # Build transcript text for LLM
    transcript_text = "\n".join(
        f"{'User' if t.role == 'user' else 'Interviewer'}: {t.text}"
        for t in transcript
    )

    extraction_prompt = (
        "You are a skilled editor. The following is a transcript of a voice "
        "conversation where someone shared memories and stories about a loved one. "
        "Extract the key stories and memories into a well-written narrative. "
        "Write in a warm, personal tone. Organize by theme or chronology. "
        "Include a title.\n\n"
        "Format your response as:\n"
        "TITLE: <title>\n\n"
        "<story content>\n\n"
        f"Transcript:\n{transcript_text}"
    )

    try:
        llm_provider = get_provider_registry().get_llm_provider()
        response_text = ""
        async for chunk in llm_provider.stream_chat(
            messages=[{"role": "user", "content": extraction_prompt}],
            model_id="claude-haiku-4-5",
            max_tokens=2048,
        ):
            response_text += chunk

        # Parse title and content
        if response_text.startswith("TITLE:"):
            lines = response_text.split("\n", 1)
            title = lines[0].replace("TITLE:", "").strip()
            content = lines[1].strip() if len(lines) > 1 else ""
        else:
            title = "Voice Conversation Story"
            content = response_text

        # Create draft story
        session_factory = get_async_session_factory()
        async with session_factory() as db:
            story = Story(
                author_id=user_id,
                title=title,
                content=content,
                visibility="private",
                status="draft",
            )
            db.add(story)
            await db.flush()

            # Associate with legacy
            assoc = StoryLegacy(
                story_id=story.id,
                legacy_id=legacy_id,
                role="primary",
            )
            db.add(assoc)
            await db.commit()

            logger.info(
                "voice.draft_story.created",
                extra={
                    "story_id": str(story.id),
                    "user_id": user_id,
                    "legacy_id": legacy_id,
                    "title": title,
                },
            )

    except Exception:
        logger.exception(
            "voice.draft_story.creation_failed",
            extra={"user_id": user_id, "legacy_id": legacy_id},
        )


@router.post("/draft-story", status_code=202)
async def create_draft_story_from_transcript(
    body: DraftStoryRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
) -> dict[str, str]:
    """Accept a voice transcript and create a draft story in the background.

    This is an internal endpoint called by voice-api after a voice session ends.
    The actual story extraction happens asynchronously.
    """
    _verify_service_key(authorization)

    background_tasks.add_task(
        _create_draft_story,
        body.user_id,
        body.legacy_id,
        body.persona_id,
        body.transcript,
    )

    logger.info(
        "voice.draft_story.queued",
        extra={
            "user_id": body.user_id,
            "legacy_id": body.legacy_id,
            "transcript_turns": len(body.transcript),
        },
    )

    return {"status": "accepted"}
```

**Step 3: Add voice_service_key to core-api settings**

Add to `services/core-api/app/config/settings.py` Settings class, near the voice settings:

```python
    voice_service_key: str = os.getenv(
        "VOICE_SERVICE_KEY", "dev-voice-service-key"
    )
```

**Step 4: Register internal router in core-api main.py**

```python
from .routes.internal import router as internal_voice_router
# ...
app.include_router(internal_voice_router)
```

**Step 5: Run `just validate-backend`**

```bash
just validate-backend
# Expected: pass
```

**Step 6: Commit**

```bash
git add services/voice-api/app/transcript.py \
       services/core-api/app/routes/internal.py \
       services/core-api/app/config/settings.py \
       services/core-api/app/main.py
git commit -m "feat(voice): add transcript-to-draft-story flow"
```

---

## Task 8: Pipecat Pipeline Assembly

Create the core voice pipeline that assembles Pipecat components with Nova Sonic.

**Files:**
- Create: `services/voice-api/app/pipeline.py`

**Step 1: Write the pipeline module**

```python
# services/voice-api/app/pipeline.py
"""Pipecat voice pipeline assembly — connects WebSocket transport to Nova Sonic."""

import logging
from typing import Any

import asyncpg
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.services.aws.nova_sonic import AWSNovaSonicLLMService
from pipecat.transports.services.fastapi_websocket import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)

from .config import VoiceConfig
from .tools import VOICE_TOOLS_DEFINITION, handle_get_legacy_context, handle_search_stories
from .usage import VoiceUsageAccumulator

logger = logging.getLogger(__name__)
config = VoiceConfig()


async def build_voice_pipeline(
    websocket: Any,
    user_id: str,
    legacy_id: str,
    persona_id: str,
    system_prompt: str,
    db_pool: asyncpg.Pool,
) -> tuple[PipelineTask, VoiceUsageAccumulator]:
    """Build a complete Pipecat voice conversation pipeline.

    Args:
        websocket: FastAPI WebSocket connection.
        user_id: Authenticated user ID.
        legacy_id: Legacy being discussed.
        persona_id: Active persona.
        system_prompt: Fully-assembled system prompt from core-api.
        db_pool: asyncpg connection pool for tool queries.

    Returns:
        Tuple of (PipelineTask, VoiceUsageAccumulator).
    """
    # Create transport
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=None,  # Nova Sonic handles VAD internally
            transcription_enabled=True,
        ),
    )

    # Create Nova Sonic LLM service
    llm = AWSNovaSonicLLMService(
        region=config.aws_region,
        settings=AWSNovaSonicLLMService.Settings(
            model=config.nova_sonic_model_id,
            voice=config.voice_default_voice,
            system_instruction=system_prompt,
            endpointing_sensitivity=config.voice_endpointing_sensitivity,
        ),
        tools=VOICE_TOOLS_DEFINITION,
    )

    # Register tool handlers
    @llm.function("search_stories")
    async def _search_stories(
        function_name: str,
        tool_call_id: str,
        args: dict[str, Any],
        llm: Any,
        context: Any,
        result_callback: Any,
    ) -> None:
        result = await handle_search_stories(db_pool, legacy_id, args)
        await result_callback(result)

    @llm.function("get_legacy_context")
    async def _get_legacy_context(
        function_name: str,
        tool_call_id: str,
        args: dict[str, Any],
        llm: Any,
        context: Any,
        result_callback: Any,
    ) -> None:
        result = await handle_get_legacy_context(db_pool, legacy_id)
        await result_callback(result)

    # Usage accumulator
    usage = VoiceUsageAccumulator(
        user_id=user_id,
        legacy_id=legacy_id,
        session_id=f"voice-{user_id}-{legacy_id}",
        persona_id=persona_id,
    )

    # Assemble pipeline
    pipeline = Pipeline([
        transport.input(),
        llm,
        transport.output(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            enable_tracing=True,
        ),
    )

    return task, usage
```

**Step 2: Commit**

This module depends on Pipecat runtime and can't be unit-tested without mocking the entire framework. Testing happens in the integration spike (Task 10).

```bash
git add services/voice-api/app/pipeline.py
git commit -m "feat(voice): add Pipecat pipeline assembly with Nova Sonic"
```

---

## Task 9: WebSocket Router

Create the main WebSocket endpoint that ties everything together.

**Files:**
- Create: `services/voice-api/app/router.py`
- Modify: `services/voice-api/app/main.py` (add router)

**Step 1: Write the WebSocket router**

```python
# services/voice-api/app/router.py
"""Voice conversation WebSocket endpoint."""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .auth import validate_voice_token
from .config import VoiceConfig
from .main import get_db_pool
from .pipeline import build_voice_pipeline
from .session import SessionManager
from .transcript import send_transcript_for_story_creation
from .usage import persist_usage

logger = logging.getLogger(__name__)
config = VoiceConfig()

router = APIRouter()
session_manager = SessionManager(max_per_user=config.voice_max_concurrent_per_user)


@router.websocket("/{legacy_id}")
async def voice_conversation(
    ws: WebSocket,
    legacy_id: str,
    token: str = "",
) -> None:
    """WebSocket endpoint for real-time voice conversations.

    Auth: Pass voice JWT as ?token= query parameter.
    The token is issued by core-api POST /api/voice/token.
    """
    # Validate token
    payload = validate_voice_token(
        token,
        secret=config.voice_jwt_secret,
        algorithm=config.voice_jwt_algorithm,
    )
    if not payload:
        await ws.close(code=4001, reason="Invalid or expired voice token")
        return

    if payload.legacy_id != legacy_id:
        await ws.close(code=4001, reason="Token legacy_id mismatch")
        return

    # Check concurrent session limit
    if not session_manager.can_start(payload.user_id):
        await ws.close(
            code=4003,
            reason=f"Maximum {config.voice_max_concurrent_per_user} concurrent sessions",
        )
        return

    # Accept the WebSocket connection
    await ws.accept()

    db_pool = await get_db_pool()
    session_manager.register(payload.user_id, legacy_id)

    try:
        task, usage = await build_voice_pipeline(
            websocket=ws,
            user_id=payload.user_id,
            legacy_id=legacy_id,
            persona_id=payload.persona_id,
            system_prompt=payload.system_prompt or "",
            db_pool=db_pool,
        )

        # Run the pipeline until disconnect or timeout
        await task.run()

    except WebSocketDisconnect:
        logger.info(
            "voice.session.disconnected",
            extra={"user_id": payload.user_id, "legacy_id": legacy_id},
        )
    except Exception:
        logger.exception(
            "voice.session.error",
            extra={"user_id": payload.user_id, "legacy_id": legacy_id},
        )
    finally:
        session_manager.unregister(payload.user_id, legacy_id)

        # Persist usage
        if config.usage_tracking_enabled:
            await persist_usage(db_pool, usage)

        # Send transcript for draft story creation
        transcript = getattr(task, "transcript", None)
        if transcript:
            await send_transcript_for_story_creation(
                user_id=payload.user_id,
                legacy_id=legacy_id,
                persona_id=payload.persona_id,
                transcript=transcript,
            )
```

**Step 2: Register the router in main.py**

Add to `services/voice-api/app/main.py` after the app is created:

```python
from .router import router as voice_router
app.include_router(voice_router)
```

**Step 3: Commit**

```bash
git add services/voice-api/app/router.py services/voice-api/app/main.py
git commit -m "feat(voice): add WebSocket voice conversation endpoint"
```

---

## Task 10: Docker Compose Integration

Add voice-api to the local development docker-compose stack.

**Files:**
- Modify: `infra/compose/docker-compose.yml`

**Step 1: Add voice-api service**

Add the following service block after the `core-api` service in `infra/compose/docker-compose.yml`:

```yaml
  # Voice API (Pipecat + Nova Sonic)
  voice-api:
    build:
      context: ../../services/voice-api
      dockerfile: Dockerfile

    env_file:
      - .env

    environment:
      ENV: dev
      DB_URL: "postgresql://postgres:postgres@postgres:5432/mosaic"
      CORE_API_INTERNAL_URL: "http://core-api:8080"
      VOICE_JWT_SECRET: "dev-voice-jwt-secret"
      VOICE_SERVICE_KEY: "dev-voice-service-key"
      AWS_REGION: "us-east-1"

    ports:
      - "8081:8081"

    volumes:
      - ../../services/voice-api/app:/app/app:ro
      - ~/.aws:/root/.aws:ro

    depends_on:
      postgres:
        condition: service_healthy

    restart: unless-stopped

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

Also add voice settings to the core-api environment (or `.env`):

```
VOICE_ENABLED=true
VOICE_JWT_SECRET=dev-voice-jwt-secret
VOICE_SERVICE_KEY=dev-voice-service-key
VOICE_WEBSOCKET_BASE_URL=ws://localhost:8081
```

**Step 2: Verify compose starts**

```bash
docker compose -f infra/compose/docker-compose.yml up -d voice-api
docker compose -f infra/compose/docker-compose.yml logs voice-api
# Expected: voice-api starts and healthz returns ok
```

**Step 3: Commit**

```bash
git add infra/compose/docker-compose.yml
git commit -m "feat(voice): add voice-api to docker-compose stack"
```

---

## Task 11: Frontend — Voice API Client and Hooks

Create the API client and React hooks for voice token management and session lifecycle.

**Files:**
- Create: `apps/web/src/features/voice/api/voice.ts`
- Create: `apps/web/src/features/voice/hooks/useVoiceToken.ts`
- Create: `apps/web/src/features/voice/hooks/useVoiceSession.ts`
- Create: `apps/web/src/features/voice/index.ts`

**Step 1: Install Pipecat client dependencies**

```bash
cd apps/web
npm install @pipecat-ai/client-js @pipecat-ai/client-react
```

Note: Check if `@pipecat-ai/websocket-transport` is a separate package or bundled. Install separately if needed.

**Step 2: Create the API client**

```typescript
// apps/web/src/features/voice/api/voice.ts
import { apiClient } from '@/lib/api/client';

export interface VoiceTokenResponse {
  token: string;
  websocket_url: string;
  persona_id: string;
  persona_name: string;
}

export interface VoiceTokenRequest {
  legacy_id: string;
  persona_id?: string;
}

export async function fetchVoiceToken(
  request: VoiceTokenRequest,
): Promise<VoiceTokenResponse> {
  const response = await apiClient.post('/api/voice/token', {
    legacy_id: request.legacy_id,
    persona_id: request.persona_id ?? 'biographer',
  });
  return response.data;
}
```

**Step 3: Create the useVoiceToken hook**

```typescript
// apps/web/src/features/voice/hooks/useVoiceToken.ts
import { useMutation } from '@tanstack/react-query';
import { fetchVoiceToken, type VoiceTokenRequest } from '../api/voice';

export function useVoiceToken() {
  return useMutation({
    mutationFn: (request: VoiceTokenRequest) => fetchVoiceToken(request),
  });
}
```

**Step 4: Create the useVoiceSession hook**

```typescript
// apps/web/src/features/voice/hooks/useVoiceSession.ts
import { useCallback, useRef, useState } from 'react';
import type { VoiceTokenResponse } from '../api/voice';

export type VoiceSessionState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error';

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export function useVoiceSession() {
  const [state, setState] = useState<VoiceSessionState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(async (tokenResponse: VoiceTokenResponse) => {
    setState('connecting');
    setError(null);
    setTranscript([]);

    try {
      const url = `${tokenResponse.websocket_url}?token=${tokenResponse.token}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setState('connected');

      ws.onclose = (event) => {
        setState('idle');
        wsRef.current = null;
        if (event.code !== 1000) {
          setError(event.reason || `Connection closed (${event.code})`);
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection failed');
        setState('error');
      };

      ws.onmessage = (event) => {
        // Handle Pipecat RTVI protocol messages
        // Transcript updates will be parsed from protocol messages
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcript' && data.role && data.text) {
            setTranscript((prev) => [
              ...prev,
              { role: data.role, text: data.text, timestamp: Date.now() },
            ]);
          }
        } catch {
          // Binary audio data — handled by Pipecat client
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setState('error');
    }
  }, []);

  const disconnect = useCallback(() => {
    setState('disconnecting');
    wsRef.current?.close(1000, 'User ended conversation');
  }, []);

  return {
    state,
    transcript,
    error,
    connect,
    disconnect,
    isConnected: state === 'connected',
  };
}
```

**Step 5: Create index barrel export**

```typescript
// apps/web/src/features/voice/index.ts
export { useVoiceToken } from './hooks/useVoiceToken';
export { useVoiceSession } from './hooks/useVoiceSession';
export type { VoiceTokenResponse, VoiceTokenRequest } from './api/voice';
```

**Step 6: Commit**

```bash
git add apps/web/src/features/voice/ apps/web/package.json apps/web/package-lock.json
git commit -m "feat(voice): add voice API client, hooks, and session management"
```

---

## Task 12: Frontend — Voice Conversation Components

Create the UI components for the voice conversation experience.

**Files:**
- Create: `apps/web/src/features/voice/components/VoiceButton.tsx`
- Create: `apps/web/src/features/voice/components/VoiceConversation.tsx`
- Create: `apps/web/src/features/voice/components/VoiceIndicator.tsx`
- Create: `apps/web/src/features/voice/components/VoiceTranscript.tsx`

**Step 1: Create VoiceButton**

```tsx
// apps/web/src/features/voice/components/VoiceButton.tsx
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VoiceButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function VoiceButton({ onClick, disabled, loading }: VoiceButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled || loading}
    >
      <Mic className="mr-2 h-4 w-4" />
      {loading ? 'Connecting...' : 'Voice Conversation'}
    </Button>
  );
}
```

**Step 2: Create VoiceIndicator**

```tsx
// apps/web/src/features/voice/components/VoiceIndicator.tsx
interface VoiceIndicatorProps {
  isListening: boolean;
  isSpeaking: boolean;
}

export function VoiceIndicator({ isListening, isSpeaking }: VoiceIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div
        className={`h-3 w-3 rounded-full transition-colors ${
          isListening
            ? 'bg-red-500 animate-pulse'
            : isSpeaking
              ? 'bg-green-500 animate-pulse'
              : 'bg-gray-300'
        }`}
      />
      <span>
        {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready'}
      </span>
    </div>
  );
}
```

**Step 3: Create VoiceTranscript**

```tsx
// apps/web/src/features/voice/components/VoiceTranscript.tsx
import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TranscriptEntry } from '../hooks/useVoiceSession';

interface VoiceTranscriptProps {
  entries: TranscriptEntry[];
}

export function VoiceTranscript({ entries }: VoiceTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        Start speaking to begin the conversation...
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 p-4">
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`text-sm ${
              entry.role === 'user' ? 'text-right' : 'text-left'
            }`}
          >
            <span
              className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${
                entry.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {entry.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
```

**Step 4: Create VoiceConversation (main component)**

```tsx
// apps/web/src/features/voice/components/VoiceConversation.tsx
import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVoiceToken } from '../hooks/useVoiceToken';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { VoiceButton } from './VoiceButton';
import { VoiceIndicator } from './VoiceIndicator';
import { VoiceTranscript } from './VoiceTranscript';

interface VoiceConversationProps {
  legacyId: string;
  personaId?: string;
}

export function VoiceConversation({
  legacyId,
  personaId = 'biographer',
}: VoiceConversationProps) {
  const [isActive, setIsActive] = useState(false);
  const tokenMutation = useVoiceToken();
  const session = useVoiceSession();

  const handleStart = useCallback(async () => {
    try {
      const tokenResponse = await tokenMutation.mutateAsync({
        legacy_id: legacyId,
        persona_id: personaId,
      });
      await session.connect(tokenResponse);
      setIsActive(true);
    } catch (err) {
      // Token fetch or connection error — handled by mutation/session error state
    }
  }, [legacyId, personaId, tokenMutation, session]);

  const handleStop = useCallback(() => {
    session.disconnect();
    setIsActive(false);
  }, [session]);

  if (!isActive) {
    return (
      <VoiceButton
        onClick={handleStart}
        loading={tokenMutation.isPending}
        disabled={tokenMutation.isPending}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base">Voice Conversation</CardTitle>
        <div className="flex items-center gap-3">
          <VoiceIndicator
            isListening={false}
            isSpeaking={false}
          />
          <Button variant="ghost" size="icon" onClick={handleStop}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <VoiceTranscript entries={session.transcript} />
        {session.error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10">
            {session.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 5: Commit**

```bash
git add apps/web/src/features/voice/components/
git commit -m "feat(voice): add voice conversation UI components"
```

---

## Task 13: Helm Chart for Voice API

Create the Kubernetes deployment manifests for voice-api.

**Files:**
- Create: `infra/helm/voice-api/Chart.yaml`
- Create: `infra/helm/voice-api/values.yaml`
- Create: `infra/helm/voice-api/templates/_helpers.tpl`
- Create: `infra/helm/voice-api/templates/deployment.yaml`
- Create: `infra/helm/voice-api/templates/service.yaml`
- Create: `infra/helm/voice-api/templates/serviceaccount.yaml`

**Step 1: Create the chart**

Follow the exact same patterns as `infra/helm/core-api/` but with voice-api specific values: port 8081, higher resource limits (512Mi memory request, 1Gi limit), IRSA role with `bedrock:InvokeModelWithBidirectionalStream`, and voice-specific env vars.

Create `Chart.yaml`:

```yaml
apiVersion: v2
name: voice-api
description: Voice conversation service for Mosaic Life
version: 0.1.0
appVersion: "0.1.0"
```

Create `values.yaml`:

```yaml
image:
  repository: 033691785857.dkr.ecr.us-east-1.amazonaws.com/mosaic-life/voice-api
  tag: "0.1.0"
  pullPolicy: IfNotPresent

replicaCount: 1

service:
  type: ClusterIP
  port: 80

serviceAccount:
  create: true
  automount: true
  annotations:
    eks.amazonaws.com/role-arn: ""
  name: ""

env:
  ENV: dev
  LOG_LEVEL: info
  AWS_REGION: "us-east-1"
  NOVA_SONIC_MODEL_ID: "amazon.nova-2-sonic-v1:0"
  VOICE_DEFAULT_VOICE: "matthew"
  VOICE_SESSION_MAX_MINUTES: "30"
  VOICE_MAX_CONCURRENT_PER_USER: "2"
  CORE_API_INTERNAL_URL: "http://core-api.mosaic-prod.svc.cluster.local"

secrets:
  DB_URL: ""
  VOICE_JWT_SECRET: ""
  VOICE_SERVICE_KEY: ""

resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2
    memory: 1Gi
```

**Step 2: Create templates**

Mirror the template structure from `infra/helm/core-api/templates/` — deployment.yaml, service.yaml, serviceaccount.yaml, _helpers.tpl. Key differences:

- Container port: 8081
- Health checks: `/healthz` and `/readyz` on port 8081
- No migration job (voice-api runs its own Alembic on startup or via init container)

**Step 3: Commit**

```bash
git add infra/helm/voice-api/
git commit -m "feat(voice): add voice-api Helm chart"
```

---

## Task 14: ArgoCD Application Definition

Create the ArgoCD application for voice-api deployment.

**Files:**
- Create: `infra/argocd/applications/voice-api.yaml`

**Step 1: Create the ArgoCD application**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: voice-api
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/mosaic-stories/mosaic-life.git
    targetRevision: main
    path: infra/helm/voice-api
    helm:
      valueFiles:
        - values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: mosaic-prod
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

**Step 2: Commit**

```bash
git add infra/argocd/applications/voice-api.yaml
git commit -m "feat(voice): add ArgoCD application definition for voice-api"
```

---

## Task 15: Integration Spike — Validate Pipecat + Nova Sonic

Create a standalone spike script to validate that Pipecat + Nova Sonic + tool calling works before wiring everything together.

**Files:**
- Create: `services/voice-api/scripts/spike_nova_sonic.py`

**Step 1: Write the spike script**

```python
#!/usr/bin/env python3
"""Spike: validate Pipecat + Nova Sonic integration.

Run this script to verify that:
1. Pipecat can connect to Bedrock Nova Sonic
2. Audio transport works (WebSocket)
3. Tool calling functions correctly
4. Session lifecycle is stable

Usage:
    cd services/voice-api
    uv run python scripts/spike_nova_sonic.py
"""

import asyncio
import logging

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.services.aws.nova_sonic import AWSNovaSonicLLMService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Starting Pipecat + Nova Sonic spike...")

    # 1. Verify we can instantiate the service
    try:
        llm = AWSNovaSonicLLMService(
            region="us-east-1",
            settings=AWSNovaSonicLLMService.Settings(
                model="amazon.nova-2-sonic-v1:0",
                voice="matthew",
                system_instruction="You are a helpful assistant. Say hello.",
                endpointing_sensitivity="MEDIUM",
            ),
        )
        logger.info("AWSNovaSonicLLMService instantiated successfully")
    except Exception as e:
        logger.error(f"Failed to create Nova Sonic service: {e}")
        return

    # 2. Verify tool registration
    @llm.function("test_tool")
    async def _test_tool(
        function_name, tool_call_id, args, llm, context, result_callback
    ):
        await result_callback({"result": "tool works"})

    logger.info("Tool registration successful")

    # 3. Log what we'd need for a full pipeline test
    logger.info(
        "To test full pipeline, run voice-api with docker compose "
        "and connect via WebSocket from the frontend."
    )
    logger.info("Spike complete — Nova Sonic service is instantiable and tools register.")


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 2: Run the spike**

```bash
cd services/voice-api
uv run python scripts/spike_nova_sonic.py
# Expected: Service instantiates, tool registers, no errors
# (Requires AWS credentials with Bedrock access)
```

**Step 3: Commit**

```bash
git add services/voice-api/scripts/
git commit -m "feat(voice): add Nova Sonic integration spike script"
```

---

## Summary

| Task | Component | Effort |
|------|-----------|--------|
| 1 | Voice API scaffold | Small |
| 2 | JWT auth module | Small |
| 3 | Voice token endpoint (core-api) | Medium |
| 4 | Usage tracking + migration | Medium |
| 5 | Session manager | Small |
| 6 | RAG tools | Medium |
| 7 | Transcript-to-story flow | Medium |
| 8 | Pipecat pipeline | Medium |
| 9 | WebSocket router | Medium |
| 10 | Docker compose integration | Small |
| 11 | Frontend hooks + API client | Medium |
| 12 | Frontend UI components | Medium |
| 13 | Helm chart | Medium |
| 14 | ArgoCD application | Small |
| 15 | Integration spike | Small |

**Task dependencies:**
- Tasks 1-2 must come first (service scaffold + auth)
- Tasks 3, 4, 5, 6 can be parallelized
- Task 7 depends on 3 (internal endpoint on core-api)
- Tasks 8-9 depend on 2, 5, 6, 7
- Task 10 depends on 1
- Tasks 11-12 depend on 3
- Tasks 13-14 can be done anytime
- Task 15 should be done early to validate the Pipecat assumption

**Recommended order:** 1 → 2 → (3 + 4 + 5 + 6 in parallel) → 7 → 8 → 9 → 10 → 15 (spike) → (11 + 12 in parallel) → (13 + 14 in parallel)
