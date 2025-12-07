# Bedrock AI Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement AWS Bedrock-powered AI chat with Biographer and Friend personas, SSE streaming, and conversation persistence.

**Architecture:** FastAPI backend with BedrockAdapter for streaming LLM calls, PostgreSQL for conversation/message storage, React frontend with Zustand store and custom hooks for SSE consumption.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x, boto3 (Bedrock), React 18, TypeScript, Zustand, TanStack Query

---

## Task 1: Database Migration

**Files:**
- Create: `services/core-api/alembic/versions/xxxx_add_ai_tables.py`

**Step 1: Generate migration file**

```bash
cd /apps/mosaic-life/services/core-api
uv run alembic revision -m "add ai conversations and messages tables"
```

**Step 2: Write the migration**

Edit the generated file to contain:

```python
"""add ai conversations and messages tables

Revision ID: <generated>
Revises: <previous>
Create Date: <generated>

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "<generated>"
down_revision = "<previous>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ai_conversations table
    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("legacy_id", sa.UUID(), nullable=False),
        sa.Column("persona_id", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_id"], ["legacies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_conversations_user_legacy_persona",
        "ai_conversations",
        ["user_id", "legacy_id", "persona_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_conversations_user_id"),
        "ai_conversations",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_conversations_legacy_id"),
        "ai_conversations",
        ["legacy_id"],
        unique=False,
    )

    # Create ai_messages table
    op.create_table(
        "ai_messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_messages_conversation_created",
        "ai_messages",
        ["conversation_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ai_messages_conversation_created", table_name="ai_messages")
    op.drop_table("ai_messages")
    op.drop_index(op.f("ix_ai_conversations_legacy_id"), table_name="ai_conversations")
    op.drop_index(op.f("ix_ai_conversations_user_id"), table_name="ai_conversations")
    op.drop_index(
        "ix_ai_conversations_user_legacy_persona", table_name="ai_conversations"
    )
    op.drop_table("ai_conversations")
```

**Step 3: Run migration**

```bash
cd /apps/mosaic-life/services/core-api
uv run alembic upgrade head
```

Expected: Migration applies successfully, tables created.

**Step 4: Verify tables exist**

```bash
docker compose -f /apps/mosaic-life/infra/compose/docker-compose.yml exec postgres psql -U postgres -d core -c "\dt ai_*"
```

Expected: Shows `ai_conversations` and `ai_messages` tables.

**Step 5: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat(db): add ai_conversations and ai_messages tables"
```

---

## Task 2: SQLAlchemy Models

**Files:**
- Create: `services/core-api/app/models/ai.py`
- Modify: `services/core-api/app/models/__init__.py`

**Step 1: Write the failing test**

Create `services/core-api/tests/models/test_ai_models.py`:

```python
"""Tests for AI models."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.legacy import Legacy
from app.models.user import User


class TestAIConversation:
    """Tests for AIConversation model."""

    @pytest.mark.asyncio
    async def test_create_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating an AI conversation."""
        conversation = AIConversation(
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            persona_id="biographer",
            title="Test Conversation",
        )
        db_session.add(conversation)
        await db_session.commit()
        await db_session.refresh(conversation)

        assert conversation.id is not None
        assert conversation.user_id == test_user.id
        assert conversation.legacy_id == test_legacy.id
        assert conversation.persona_id == "biographer"
        assert conversation.created_at is not None


class TestAIMessage:
    """Tests for AIMessage model."""

    @pytest.mark.asyncio
    async def test_create_message(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating an AI message."""
        conversation = AIConversation(
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            persona_id="biographer",
        )
        db_session.add(conversation)
        await db_session.flush()

        message = AIMessage(
            conversation_id=conversation.id,
            role="user",
            content="Tell me about their childhood.",
            token_count=10,
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        assert message.id is not None
        assert message.conversation_id == conversation.id
        assert message.role == "user"
        assert message.content == "Tell me about their childhood."
        assert message.token_count == 10


    @pytest.mark.asyncio
    async def test_conversation_messages_relationship(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test conversation has messages relationship."""
        conversation = AIConversation(
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            persona_id="friend",
        )
        db_session.add(conversation)
        await db_session.flush()

        msg1 = AIMessage(conversation_id=conversation.id, role="user", content="Hello")
        msg2 = AIMessage(conversation_id=conversation.id, role="assistant", content="Hi there!")
        db_session.add_all([msg1, msg2])
        await db_session.commit()

        await db_session.refresh(conversation)
        assert len(conversation.messages) == 2
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/models/test_ai_models.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.ai'`

**Step 3: Write minimal implementation**

Create `services/core-api/app/models/ai.py`:

```python
"""AI conversation and message models."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base


class AIConversation(Base):
    """AI conversation model for tracking chat sessions."""

    __tablename__ = "ai_conversations"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    persona_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    title: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    messages: Mapped[list["AIMessage"]] = relationship(
        "AIMessage",
        back_populates="conversation",
        order_by="AIMessage.created_at",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<AIConversation(id={self.id}, persona={self.persona_id})>"


class AIMessage(Base):
    """AI message model for storing conversation messages."""

    __tablename__ = "ai_messages"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    conversation_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    token_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    conversation: Mapped["AIConversation"] = relationship(
        "AIConversation",
        back_populates="messages",
    )

    def __repr__(self) -> str:
        return f"<AIMessage(id={self.id}, role={self.role})>"
```

**Step 4: Update models __init__.py**

Add to `services/core-api/app/models/__init__.py`:

```python
from .ai import AIConversation, AIMessage
```

**Step 5: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/models/test_ai_models.py -v
```

Expected: All tests PASS

**Step 6: Run validation**

```bash
cd /apps/mosaic-life
just validate-backend
```

Expected: ruff and mypy pass

**Step 7: Commit**

```bash
git add services/core-api/app/models/ai.py services/core-api/app/models/__init__.py services/core-api/tests/models/test_ai_models.py
git commit -m "feat(models): add AIConversation and AIMessage models"
```

---

## Task 3: Pydantic Schemas

**Files:**
- Create: `services/core-api/app/schemas/ai.py`

**Step 1: Write the schemas**

Create `services/core-api/app/schemas/ai.py`:

```python
"""Pydantic schemas for AI chat API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# Persona Schemas
# ============================================================================


class PersonaResponse(BaseModel):
    """Schema for persona information."""

    id: str = Field(..., description="Persona identifier (e.g., 'biographer')")
    name: str = Field(..., description="Display name")
    icon: str = Field(..., description="Icon name for UI")
    description: str = Field(..., description="Short description of persona's role")


# ============================================================================
# Conversation Schemas
# ============================================================================


class ConversationCreate(BaseModel):
    """Schema for creating a new conversation."""

    legacy_id: UUID = Field(..., description="Legacy this conversation is about")
    persona_id: str = Field(..., description="Persona to chat with")


class ConversationResponse(BaseModel):
    """Schema for conversation response."""

    id: UUID
    user_id: UUID
    legacy_id: UUID
    persona_id: str
    title: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationSummary(BaseModel):
    """Schema for conversation list item."""

    id: UUID
    legacy_id: UUID
    persona_id: str
    title: str | None
    message_count: int = Field(default=0)
    last_message_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ============================================================================
# Message Schemas
# ============================================================================


class MessageCreate(BaseModel):
    """Schema for sending a new message."""

    content: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Message content",
    )


class MessageResponse(BaseModel):
    """Schema for message response."""

    id: UUID
    conversation_id: UUID
    role: Literal["user", "assistant"]
    content: str
    token_count: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageListResponse(BaseModel):
    """Schema for paginated message list."""

    messages: list[MessageResponse]
    total: int
    has_more: bool


# ============================================================================
# SSE Event Schemas
# ============================================================================


class SSEChunkEvent(BaseModel):
    """SSE event for streaming content chunk."""

    type: Literal["chunk"] = "chunk"
    content: str


class SSEDoneEvent(BaseModel):
    """SSE event for stream completion."""

    type: Literal["done"] = "done"
    message_id: UUID
    token_count: int | None


class SSEErrorEvent(BaseModel):
    """SSE event for stream error."""

    type: Literal["error"] = "error"
    message: str
    retryable: bool = False
```

**Step 2: Run validation**

```bash
cd /apps/mosaic-life
just validate-backend
```

Expected: ruff and mypy pass

**Step 3: Commit**

```bash
git add services/core-api/app/schemas/ai.py
git commit -m "feat(schemas): add Pydantic schemas for AI chat API"
```

---

## Task 4: Persona Configuration

**Files:**
- Create: `services/core-api/app/config/personas.yaml`
- Create: `services/core-api/app/config/personas.py`

**Step 1: Create the YAML config file**

Create directory and file `services/core-api/app/config/personas.yaml`:

```yaml
# AI Persona Definitions
# Loaded at startup and cached in memory

base_rules: |
  CRITICAL SAFETY RULES (apply to all responses):
  - You are assisting with a memorial/legacy site. Be grief-aware and respectful.
  - Never claim certainty about medical, legal, or financial matters.
  - Never impersonate the deceased or claim to be them.
  - Always acknowledge uncertainty: use phrases like "I may be mistaken" or "Based on what you've shared..."
  - Never speculate about cause of death or controversial circumstances.
  - If asked about topics outside your role, gently redirect to your purpose.
  - Keep responses concise but warm. Aim for 2-4 paragraphs unless more detail is requested.

personas:
  biographer:
    name: "The Biographer"
    icon: "BookOpen"
    description: "Life Story Curator - helps organize memories into meaningful narratives"
    model_id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens: 1024
    system_prompt: |
      You are The Biographer, a compassionate life story curator helping preserve memories of {legacy_name}.

      Your role:
      - Help users organize memories into themes and timelines
      - Ask clarifying questions to draw out rich details
      - Suggest connections between stories and life chapters
      - Help identify gaps in the narrative that could be filled

      Tone: Warm, curious, encouraging. Like a skilled interviewer writing a biography.

  friend:
    name: "The Friend"
    icon: "Heart"
    description: "Empathetic Listener - provides emotional support during the memorial process"
    model_id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    max_tokens: 1024
    system_prompt: |
      You are The Friend, a compassionate listener supporting someone preserving memories of {legacy_name}.

      Your role:
      - Acknowledge and validate emotions around grief and remembrance
      - Offer gentle prompts when someone seems stuck
      - Reflect feelings back to help users process
      - Celebrate joyful memories as much as honoring difficult ones

      Tone: Warm, gentle, patient. Like a trusted friend who listens without judgment.
```

**Step 2: Write failing test for persona loader**

Create `services/core-api/tests/config/test_personas.py`:

```python
"""Tests for persona configuration loader."""

import pytest

from app.config.personas import get_persona, get_personas, load_personas, PersonaConfig


class TestPersonaConfig:
    """Tests for persona configuration."""

    def test_load_personas_returns_dict(self):
        """Test that load_personas returns persona dict."""
        personas = load_personas()
        assert isinstance(personas, dict)
        assert "biographer" in personas
        assert "friend" in personas

    def test_persona_has_required_fields(self):
        """Test that each persona has required fields."""
        personas = load_personas()
        for persona_id, persona in personas.items():
            assert isinstance(persona, PersonaConfig)
            assert persona.name
            assert persona.icon
            assert persona.description
            assert persona.model_id
            assert persona.system_prompt

    def test_get_persona_returns_persona(self):
        """Test get_persona returns specific persona."""
        persona = get_persona("biographer")
        assert persona is not None
        assert persona.name == "The Biographer"

    def test_get_persona_returns_none_for_unknown(self):
        """Test get_persona returns None for unknown persona."""
        persona = get_persona("unknown_persona")
        assert persona is None

    def test_get_personas_returns_all(self):
        """Test get_personas returns all personas."""
        personas = get_personas()
        assert len(personas) >= 2

    def test_base_rules_exist(self):
        """Test base rules are loaded."""
        from app.config.personas import get_base_rules
        rules = get_base_rules()
        assert "grief-aware" in rules.lower()
        assert "impersonate" in rules.lower()
```

**Step 3: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/config/test_personas.py -v
```

Expected: FAIL with `ModuleNotFoundError`

**Step 4: Write the persona loader**

Create `services/core-api/app/config/personas.py`:

```python
"""Persona configuration loader."""

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent / "personas.yaml"


@dataclass
class PersonaConfig:
    """Configuration for an AI persona."""

    id: str
    name: str
    icon: str
    description: str
    model_id: str
    system_prompt: str
    max_tokens: int = 1024


_personas: dict[str, PersonaConfig] = {}
_base_rules: str = ""


def load_personas() -> dict[str, PersonaConfig]:
    """Load persona configurations from YAML file.

    Returns:
        Dictionary mapping persona_id to PersonaConfig.
    """
    global _personas, _base_rules

    if _personas:
        return _personas

    with open(CONFIG_PATH) as f:
        config = yaml.safe_load(f)

    _base_rules = config.get("base_rules", "")

    for persona_id, data in config.get("personas", {}).items():
        _personas[persona_id] = PersonaConfig(
            id=persona_id,
            name=data["name"],
            icon=data["icon"],
            description=data["description"],
            model_id=data["model_id"],
            system_prompt=data["system_prompt"],
            max_tokens=data.get("max_tokens", 1024),
        )

    logger.info(
        "personas.loaded",
        extra={"count": len(_personas), "ids": list(_personas.keys())},
    )

    return _personas


def get_persona(persona_id: str) -> PersonaConfig | None:
    """Get a specific persona by ID.

    Args:
        persona_id: The persona identifier.

    Returns:
        PersonaConfig if found, None otherwise.
    """
    personas = load_personas()
    return personas.get(persona_id)


def get_personas() -> list[PersonaConfig]:
    """Get all available personas.

    Returns:
        List of all persona configurations.
    """
    personas = load_personas()
    return list(personas.values())


def get_base_rules() -> str:
    """Get the base safety rules that apply to all personas.

    Returns:
        Base rules string.
    """
    load_personas()  # Ensure loaded
    return _base_rules


def build_system_prompt(persona_id: str, legacy_name: str) -> str | None:
    """Build complete system prompt for a persona with legacy context.

    Args:
        persona_id: The persona identifier.
        legacy_name: Name of the legacy being discussed.

    Returns:
        Complete system prompt with base rules and persona prompt, or None if persona not found.
    """
    persona = get_persona(persona_id)
    if not persona:
        return None

    base = get_base_rules()
    persona_prompt = persona.system_prompt.replace("{legacy_name}", legacy_name)

    return f"{base}\n\n{persona_prompt}"
```

**Step 5: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/config/test_personas.py -v
```

Expected: All tests PASS

**Step 6: Run validation**

```bash
cd /apps/mosaic-life
just validate-backend
```

Expected: ruff and mypy pass

**Step 7: Commit**

```bash
git add services/core-api/app/config/
git add services/core-api/tests/config/
git commit -m "feat(config): add persona configuration with YAML loader"
```

---

## Task 5: Bedrock Adapter

**Files:**
- Create: `services/core-api/app/adapters/bedrock.py`
- Modify: `services/core-api/pyproject.toml` (add aioboto3 if not present)

**Step 1: Check/add aioboto3 dependency**

```bash
cd /apps/mosaic-life/services/core-api
grep -q "aioboto3" pyproject.toml || uv add aioboto3
```

**Step 2: Write failing test**

Create `services/core-api/tests/adapters/test_bedrock.py`:

```python
"""Tests for Bedrock adapter."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.adapters.bedrock import BedrockAdapter, BedrockError


class TestBedrockAdapter:
    """Tests for BedrockAdapter."""

    @pytest.fixture
    def adapter(self):
        """Create adapter instance."""
        return BedrockAdapter(region="us-east-1")

    def test_adapter_initializes(self, adapter):
        """Test adapter initializes with region."""
        assert adapter.region == "us-east-1"

    def test_format_messages(self, adapter):
        """Test message formatting for Bedrock API."""
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"},
        ]

        formatted = adapter._format_messages(messages)

        assert len(formatted) == 3
        assert formatted[0]["role"] == "user"
        assert formatted[0]["content"][0]["text"] == "Hello"

    @pytest.mark.asyncio
    async def test_stream_generate_yields_chunks(self, adapter):
        """Test stream_generate yields content chunks."""
        # Mock the bedrock client response
        mock_stream = AsyncMock()
        mock_stream.__aiter__ = lambda self: self
        mock_stream.__anext__ = AsyncMock(
            side_effect=[
                {"contentBlockDelta": {"delta": {"text": "Hello"}}},
                {"contentBlockDelta": {"delta": {"text": " world"}}},
                {"messageStop": {}},
                StopAsyncIteration(),
            ]
        )

        with patch.object(adapter, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.invoke_model_with_response_stream = AsyncMock(
                return_value={"body": mock_stream}
            )
            mock_get_client.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_get_client.return_value.__aexit__ = AsyncMock(return_value=None)

            chunks = []
            async for chunk in adapter.stream_generate(
                messages=[{"role": "user", "content": "Hi"}],
                system_prompt="You are helpful.",
                model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            ):
                chunks.append(chunk)

            assert "Hello" in chunks
            assert " world" in chunks
```

**Step 3: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/adapters/test_bedrock.py -v
```

Expected: FAIL with `ModuleNotFoundError`

**Step 4: Write the Bedrock adapter**

Create `services/core-api/app/adapters/bedrock.py`:

```python
"""AWS Bedrock adapter for AI chat."""

import json
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import aioboto3
from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.bedrock")


class BedrockError(Exception):
    """Exception raised for Bedrock API errors."""

    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.message = message
        self.retryable = retryable


class BedrockAdapter:
    """Async adapter for AWS Bedrock streaming API."""

    def __init__(self, region: str = "us-east-1"):
        """Initialize the Bedrock adapter.

        Args:
            region: AWS region for Bedrock.
        """
        self.region = region
        self._session = aioboto3.Session()

    @asynccontextmanager
    async def _get_client(self):
        """Get async Bedrock runtime client."""
        async with self._session.client(
            "bedrock-runtime",
            region_name=self.region,
        ) as client:
            yield client

    def _format_messages(
        self, messages: list[dict[str, str]]
    ) -> list[dict[str, Any]]:
        """Format messages for Bedrock Anthropic API.

        Args:
            messages: List of {"role": str, "content": str} dicts.

        Returns:
            Messages formatted for Bedrock API.
        """
        return [
            {
                "role": msg["role"],
                "content": [{"text": msg["content"]}],
            }
            for msg in messages
        ]

    async def stream_generate(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model_id: str,
        max_tokens: int = 1024,
    ) -> AsyncGenerator[str, None]:
        """Stream generate a response from Bedrock.

        Args:
            messages: Conversation history.
            system_prompt: System prompt for the model.
            model_id: Bedrock model identifier.
            max_tokens: Maximum tokens to generate.

        Yields:
            Content chunks as they arrive.

        Raises:
            BedrockError: On API errors.
        """
        with tracer.start_as_current_span("ai.bedrock.stream") as span:
            span.set_attribute("model_id", model_id)
            span.set_attribute("message_count", len(messages))

            formatted_messages = self._format_messages(messages)

            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": formatted_messages,
            }

            try:
                async with self._get_client() as client:
                    response = await client.invoke_model_with_response_stream(
                        modelId=model_id,
                        contentType="application/json",
                        accept="application/json",
                        body=json.dumps(request_body),
                    )

                    total_tokens = 0
                    async for event in response["body"]:
                        chunk = json.loads(event["chunk"]["bytes"])

                        if "contentBlockDelta" in chunk:
                            delta = chunk["contentBlockDelta"]["delta"]
                            if "text" in delta:
                                yield delta["text"]

                        elif "messageStop" in chunk:
                            # End of message
                            pass

                        elif "metadata" in chunk:
                            # Token usage info
                            usage = chunk["metadata"].get("usage", {})
                            total_tokens = usage.get("outputTokens", 0)

                    span.set_attribute("output_tokens", total_tokens)

            except client.exceptions.ThrottlingException as e:
                span.set_attribute("error", True)
                logger.warning("bedrock.throttled", extra={"error": str(e)})
                raise BedrockError(
                    "Rate limit exceeded. Please try again.",
                    retryable=True,
                ) from e

            except client.exceptions.ModelTimeoutException as e:
                span.set_attribute("error", True)
                logger.warning("bedrock.timeout", extra={"error": str(e)})
                raise BedrockError(
                    "Request timed out. Please try again.",
                    retryable=True,
                ) from e

            except Exception as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                logger.error(
                    "bedrock.error",
                    extra={"error": str(e), "model_id": model_id},
                )
                raise BedrockError(
                    "An error occurred while generating response.",
                    retryable=False,
                ) from e


# Global adapter instance
_adapter: BedrockAdapter | None = None


def get_bedrock_adapter(region: str = "us-east-1") -> BedrockAdapter:
    """Get or create the Bedrock adapter singleton.

    Args:
        region: AWS region.

    Returns:
        BedrockAdapter instance.
    """
    global _adapter
    if _adapter is None:
        _adapter = BedrockAdapter(region=region)
    return _adapter
```

**Step 5: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/adapters/test_bedrock.py -v
```

Expected: Tests PASS (mocked)

**Step 6: Run validation**

```bash
cd /apps/mosaic-life
just validate-backend
```

Expected: ruff and mypy pass

**Step 7: Commit**

```bash
git add services/core-api/app/adapters/bedrock.py services/core-api/tests/adapters/
git commit -m "feat(adapters): add Bedrock streaming adapter with OTel spans"
```

---

## Task 6: AI Service Layer

**Files:**
- Create: `services/core-api/app/services/ai.py`

**Step 1: Write failing test**

Create `services/core-api/tests/services/test_ai_service.py`:

```python
"""Tests for AI service layer."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.legacy import Legacy
from app.models.user import User
from app.schemas.ai import ConversationCreate, MessageCreate
from app.services import ai as ai_service


class TestGetOrCreateConversation:
    """Tests for get_or_create_conversation."""

    @pytest.mark.asyncio
    async def test_creates_new_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating a new conversation."""
        data = ConversationCreate(
            legacy_id=test_legacy.id,
            persona_id="biographer",
        )

        conversation = await ai_service.get_or_create_conversation(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )

        assert conversation.id is not None
        assert conversation.user_id == test_user.id
        assert conversation.legacy_id == test_legacy.id
        assert conversation.persona_id == "biographer"

    @pytest.mark.asyncio
    async def test_returns_existing_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test returning existing conversation."""
        # Create first conversation
        data = ConversationCreate(
            legacy_id=test_legacy.id,
            persona_id="biographer",
        )
        conv1 = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        # Request again - should return same
        conv2 = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        assert conv1.id == conv2.id

    @pytest.mark.asyncio
    async def test_requires_legacy_membership(
        self,
        db_session: AsyncSession,
        test_user_2: User,  # Not a member
        test_legacy: Legacy,
    ):
        """Test that non-members cannot create conversations."""
        data = ConversationCreate(
            legacy_id=test_legacy.id,
            persona_id="biographer",
        )

        with pytest.raises(HTTPException) as exc:
            await ai_service.get_or_create_conversation(
                db=db_session,
                user_id=test_user_2.id,
                data=data,
            )

        assert exc.value.status_code == 403


class TestSaveMessage:
    """Tests for save_message."""

    @pytest.mark.asyncio
    async def test_saves_user_message(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test saving a user message."""
        # Create conversation first
        conv = AIConversation(
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.commit()

        message = await ai_service.save_message(
            db=db_session,
            conversation_id=conv.id,
            role="user",
            content="Tell me about their childhood.",
        )

        assert message.id is not None
        assert message.role == "user"
        assert message.content == "Tell me about their childhood."


class TestGetConversationMessages:
    """Tests for get_conversation_messages."""

    @pytest.mark.asyncio
    async def test_returns_messages_in_order(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test messages returned in chronological order."""
        conv = AIConversation(
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        # Add messages
        msg1 = AIMessage(conversation_id=conv.id, role="user", content="First")
        msg2 = AIMessage(conversation_id=conv.id, role="assistant", content="Second")
        msg3 = AIMessage(conversation_id=conv.id, role="user", content="Third")
        db_session.add_all([msg1, msg2, msg3])
        await db_session.commit()

        result = await ai_service.get_conversation_messages(
            db=db_session,
            conversation_id=conv.id,
            user_id=test_user.id,
        )

        assert len(result.messages) == 3
        assert result.messages[0].content == "First"
        assert result.messages[2].content == "Third"
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/services/test_ai_service.py -v
```

Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write the AI service**

Create `services/core-api/app/services/ai.py`:

```python
"""Service layer for AI chat operations."""

import logging
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.ai import AIConversation, AIMessage
from ..models.legacy import Legacy, LegacyMember
from ..schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    ConversationSummary,
    MessageListResponse,
    MessageResponse,
)

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.ai")

# Maximum messages to include in conversation context
MAX_CONTEXT_MESSAGES = 20


async def check_legacy_access(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> None:
    """Check if user has access to legacy for AI chat.

    Args:
        db: Database session.
        user_id: User ID.
        legacy_id: Legacy ID.

    Raises:
        HTTPException: 404 if legacy not found, 403 if not a member.
    """
    # Check legacy exists
    legacy_result = await db.execute(
        select(Legacy).where(Legacy.id == legacy_id)
    )
    legacy = legacy_result.scalar_one_or_none()
    if not legacy:
        raise HTTPException(status_code=404, detail="Legacy not found")

    # Check membership (any role except pending)
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=403,
            detail="You must be a legacy member to use AI chat",
        )


async def get_or_create_conversation(
    db: AsyncSession,
    user_id: UUID,
    data: ConversationCreate,
) -> ConversationResponse:
    """Get existing or create new conversation.

    Args:
        db: Database session.
        user_id: User ID.
        data: Conversation creation data.

    Returns:
        Conversation response.

    Raises:
        HTTPException: 403 if not a member, 400 if invalid persona.
    """
    with tracer.start_as_current_span("ai.conversation.get_or_create") as span:
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("legacy_id", str(data.legacy_id))
        span.set_attribute("persona_id", data.persona_id)

        # Check access
        await check_legacy_access(db, user_id, data.legacy_id)

        # Check persona exists
        from ..config.personas import get_persona
        if not get_persona(data.persona_id):
            raise HTTPException(status_code=400, detail="Invalid persona")

        # Look for existing conversation
        result = await db.execute(
            select(AIConversation).where(
                AIConversation.user_id == user_id,
                AIConversation.legacy_id == data.legacy_id,
                AIConversation.persona_id == data.persona_id,
            )
        )
        conversation = result.scalar_one_or_none()

        if conversation:
            span.set_attribute("created", False)
            logger.info(
                "ai.conversation.found",
                extra={"conversation_id": str(conversation.id)},
            )
        else:
            # Create new conversation
            conversation = AIConversation(
                user_id=user_id,
                legacy_id=data.legacy_id,
                persona_id=data.persona_id,
            )
            db.add(conversation)
            await db.commit()
            await db.refresh(conversation)
            span.set_attribute("created", True)
            logger.info(
                "ai.conversation.created",
                extra={
                    "conversation_id": str(conversation.id),
                    "persona_id": data.persona_id,
                },
            )

        return ConversationResponse.model_validate(conversation)


async def list_conversations(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID | None = None,
) -> list[ConversationSummary]:
    """List user's conversations.

    Args:
        db: Database session.
        user_id: User ID.
        legacy_id: Optional filter by legacy.

    Returns:
        List of conversation summaries.
    """
    query = select(AIConversation).where(AIConversation.user_id == user_id)

    if legacy_id:
        query = query.where(AIConversation.legacy_id == legacy_id)

    query = query.order_by(AIConversation.updated_at.desc())

    result = await db.execute(query)
    conversations = result.scalars().all()

    summaries = []
    for conv in conversations:
        # Get message count and last message time
        count_result = await db.execute(
            select(func.count(AIMessage.id)).where(
                AIMessage.conversation_id == conv.id
            )
        )
        message_count = count_result.scalar() or 0

        last_msg_result = await db.execute(
            select(AIMessage.created_at)
            .where(AIMessage.conversation_id == conv.id)
            .order_by(AIMessage.created_at.desc())
            .limit(1)
        )
        last_message_at = last_msg_result.scalar_one_or_none()

        summaries.append(
            ConversationSummary(
                id=conv.id,
                legacy_id=conv.legacy_id,
                persona_id=conv.persona_id,
                title=conv.title,
                message_count=message_count,
                last_message_at=last_message_at,
                created_at=conv.created_at,
            )
        )

    return summaries


async def get_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
) -> AIConversation:
    """Get a conversation by ID.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        user_id: User ID (for ownership check).

    Returns:
        Conversation.

    Raises:
        HTTPException: 404 if not found.
    """
    result = await db.execute(
        select(AIConversation)
        .options(selectinload(AIConversation.messages))
        .where(
            AIConversation.id == conversation_id,
            AIConversation.user_id == user_id,
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


async def get_conversation_messages(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> MessageListResponse:
    """Get messages for a conversation.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        user_id: User ID.
        limit: Maximum messages to return.
        offset: Offset for pagination.

    Returns:
        Paginated message list.
    """
    # Verify ownership
    await get_conversation(db, conversation_id, user_id)

    # Count total
    count_result = await db.execute(
        select(func.count(AIMessage.id)).where(
            AIMessage.conversation_id == conversation_id
        )
    )
    total = count_result.scalar() or 0

    # Get messages
    result = await db.execute(
        select(AIMessage)
        .where(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    messages = result.scalars().all()

    return MessageListResponse(
        messages=[MessageResponse.model_validate(m) for m in messages],
        total=total,
        has_more=offset + len(messages) < total,
    )


async def get_context_messages(
    db: AsyncSession,
    conversation_id: UUID,
) -> list[dict[str, str]]:
    """Get recent messages for context.

    Args:
        db: Database session.
        conversation_id: Conversation ID.

    Returns:
        List of message dicts for Bedrock API.
    """
    with tracer.start_as_current_span("ai.chat.context_load") as span:
        result = await db.execute(
            select(AIMessage)
            .where(AIMessage.conversation_id == conversation_id)
            .order_by(AIMessage.created_at.desc())
            .limit(MAX_CONTEXT_MESSAGES)
        )
        messages = list(reversed(result.scalars().all()))

        span.set_attribute("message_count", len(messages))

        return [{"role": m.role, "content": m.content} for m in messages]


async def save_message(
    db: AsyncSession,
    conversation_id: UUID,
    role: str,
    content: str,
    token_count: int | None = None,
) -> AIMessage:
    """Save a message to the conversation.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        role: Message role (user/assistant).
        content: Message content.
        token_count: Optional token count.

    Returns:
        Saved message.
    """
    message = AIMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        token_count=token_count,
    )
    db.add(message)

    # Update conversation timestamp
    await db.execute(
        select(AIConversation)
        .where(AIConversation.id == conversation_id)
        .with_for_update()
    )
    result = await db.execute(
        select(AIConversation).where(AIConversation.id == conversation_id)
    )
    conversation = result.scalar_one()
    from datetime import datetime, timezone
    conversation.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(message)

    logger.info(
        "ai.message.saved",
        extra={
            "message_id": str(message.id),
            "conversation_id": str(conversation_id),
            "role": role,
            "token_count": token_count,
        },
    )

    return message


async def delete_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
) -> None:
    """Delete a conversation and all its messages.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        user_id: User ID.

    Raises:
        HTTPException: 404 if not found.
    """
    conversation = await get_conversation(db, conversation_id, user_id)
    await db.delete(conversation)
    await db.commit()

    logger.info(
        "ai.conversation.deleted",
        extra={"conversation_id": str(conversation_id)},
    )
```

**Step 4: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/services/test_ai_service.py -v
```

Expected: All tests PASS

**Step 5: Run validation**

```bash
cd /apps/mosaic-life
just validate-backend
```

Expected: ruff and mypy pass

**Step 6: Commit**

```bash
git add services/core-api/app/services/ai.py services/core-api/tests/services/test_ai_service.py
git commit -m "feat(services): add AI service layer for conversation management"
```

---

## Task 7: AI Routes with SSE Streaming

**Files:**
- Create: `services/core-api/app/routes/ai.py`
- Modify: `services/core-api/app/main.py`

**Step 1: Write failing test**

Create `services/core-api/tests/routes/test_ai_routes.py`:

```python
"""Tests for AI routes."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.user import User


class TestListPersonas:
    """Tests for GET /api/ai/personas."""

    @pytest.mark.asyncio
    async def test_list_personas_returns_personas(
        self,
        client: AsyncClient,
        test_user: User,
    ):
        """Test listing personas."""
        response = await client.get("/api/ai/personas")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        assert any(p["id"] == "biographer" for p in data)
        assert any(p["id"] == "friend" for p in data)


class TestCreateConversation:
    """Tests for POST /api/ai/conversations."""

    @pytest.mark.asyncio
    async def test_create_conversation_success(
        self,
        client: AsyncClient,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating a conversation."""
        response = await client.post(
            "/api/ai/conversations",
            json={
                "legacy_id": str(test_legacy.id),
                "persona_id": "biographer",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["persona_id"] == "biographer"
        assert data["legacy_id"] == str(test_legacy.id)

    @pytest.mark.asyncio
    async def test_create_conversation_requires_membership(
        self,
        client_user2: AsyncClient,  # Different user, not a member
        test_legacy: Legacy,
    ):
        """Test that non-members cannot create conversations."""
        response = await client_user2.post(
            "/api/ai/conversations",
            json={
                "legacy_id": str(test_legacy.id),
                "persona_id": "biographer",
            },
        )
        assert response.status_code == 403


class TestListConversations:
    """Tests for GET /api/ai/conversations."""

    @pytest.mark.asyncio
    async def test_list_conversations_empty(
        self,
        client: AsyncClient,
        test_user: User,
    ):
        """Test listing conversations when none exist."""
        response = await client.get("/api/ai/conversations")
        assert response.status_code == 200
        assert response.json() == []


class TestGetMessages:
    """Tests for GET /api/ai/conversations/{id}/messages."""

    @pytest.mark.asyncio
    async def test_get_messages_empty(
        self,
        client: AsyncClient,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test getting messages for new conversation."""
        # Create conversation first
        create_resp = await client.post(
            "/api/ai/conversations",
            json={
                "legacy_id": str(test_legacy.id),
                "persona_id": "biographer",
            },
        )
        conv_id = create_resp.json()["id"]

        response = await client.get(f"/api/ai/conversations/{conv_id}/messages")
        assert response.status_code == 200
        data = response.json()
        assert data["messages"] == []
        assert data["total"] == 0
```

**Step 2: Run test to verify it fails**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/routes/test_ai_routes.py -v
```

Expected: FAIL (404 or ModuleNotFoundError)

**Step 3: Write the AI routes**

Create `services/core-api/app/routes/ai.py`:

```python
"""API routes for AI chat."""

import json
import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from opentelemetry import trace
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.bedrock import BedrockError, get_bedrock_adapter
from ..auth.middleware import require_auth
from ..config.personas import build_system_prompt, get_persona, get_personas
from ..database import get_db
from ..models.legacy import Legacy
from ..schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    ConversationSummary,
    MessageCreate,
    MessageListResponse,
    PersonaResponse,
    SSEChunkEvent,
    SSEDoneEvent,
    SSEErrorEvent,
)
from ..services import ai as ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.ai")


# ============================================================================
# Persona Endpoints
# ============================================================================


@router.get(
    "/personas",
    response_model=list[PersonaResponse],
    summary="List available AI personas",
    description="Get list of available AI personas for chat.",
)
async def list_personas() -> list[PersonaResponse]:
    """List available AI personas."""
    personas = get_personas()
    return [
        PersonaResponse(
            id=p.id,
            name=p.name,
            icon=p.icon,
            description=p.description,
        )
        for p in personas
    ]


# ============================================================================
# Conversation Endpoints
# ============================================================================


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or get conversation",
    description="Create a new conversation or get existing one for the legacy/persona combination.",
)
async def create_conversation(
    data: ConversationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConversationResponse:
    """Create or get existing conversation."""
    session = require_auth(request)
    return await ai_service.get_or_create_conversation(
        db=db,
        user_id=session.user_id,
        data=data,
    )


@router.get(
    "/conversations",
    response_model=list[ConversationSummary],
    summary="List conversations",
    description="List user's AI conversations, optionally filtered by legacy.",
)
async def list_conversations(
    request: Request,
    legacy_id: UUID | None = Query(None, description="Filter by legacy"),
    db: AsyncSession = Depends(get_db),
) -> list[ConversationSummary]:
    """List user's conversations."""
    session = require_auth(request)
    return await ai_service.list_conversations(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=MessageListResponse,
    summary="Get conversation messages",
    description="Get paginated message history for a conversation.",
)
async def get_messages(
    conversation_id: UUID,
    request: Request,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> MessageListResponse:
    """Get messages for a conversation."""
    session = require_auth(request)
    return await ai_service.get_conversation_messages(
        db=db,
        conversation_id=conversation_id,
        user_id=session.user_id,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete conversation",
    description="Delete a conversation and all its messages.",
)
async def delete_conversation(
    conversation_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a conversation."""
    session = require_auth(request)
    await ai_service.delete_conversation(
        db=db,
        conversation_id=conversation_id,
        user_id=session.user_id,
    )


# ============================================================================
# Message/Chat Endpoints
# ============================================================================


@router.post(
    "/conversations/{conversation_id}/messages",
    summary="Send message and stream response",
    description="Send a message and receive AI response as SSE stream.",
)
async def send_message(
    conversation_id: UUID,
    data: MessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Send message and stream AI response."""
    session = require_auth(request)

    with tracer.start_as_current_span("ai.chat.request") as span:
        span.set_attribute("user_id", str(session.user_id))
        span.set_attribute("conversation_id", str(conversation_id))

        # Get conversation and verify ownership
        conversation = await ai_service.get_conversation(
            db=db,
            conversation_id=conversation_id,
            user_id=session.user_id,
        )

        span.set_attribute("legacy_id", str(conversation.legacy_id))
        span.set_attribute("persona_id", conversation.persona_id)

        # Get persona config
        persona = get_persona(conversation.persona_id)
        if not persona:
            raise ValueError(f"Invalid persona: {conversation.persona_id}")

        # Get legacy name for prompt
        from sqlalchemy import select
        legacy_result = await db.execute(
            select(Legacy).where(Legacy.id == conversation.legacy_id)
        )
        legacy = legacy_result.scalar_one()

        # Build system prompt
        system_prompt = build_system_prompt(
            conversation.persona_id,
            legacy.name,
        )

        # Save user message
        await ai_service.save_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=data.content,
        )

        # Get context messages
        context = await ai_service.get_context_messages(db, conversation_id)

        async def generate_stream() -> AsyncGenerator[str, None]:
            """Generate SSE stream."""
            adapter = get_bedrock_adapter()
            full_response = ""
            token_count = 0

            try:
                async for chunk in adapter.stream_generate(
                    messages=context,
                    system_prompt=system_prompt,
                    model_id=persona.model_id,
                    max_tokens=persona.max_tokens,
                ):
                    full_response += chunk
                    event = SSEChunkEvent(content=chunk)
                    yield f"data: {event.model_dump_json()}\n\n"

                # Save assistant message
                message = await ai_service.save_message(
                    db=db,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                    token_count=token_count,
                )

                # Send done event
                done_event = SSEDoneEvent(
                    message_id=message.id,
                    token_count=token_count,
                )
                yield f"data: {done_event.model_dump_json()}\n\n"

                logger.info(
                    "ai.chat.complete",
                    extra={
                        "conversation_id": str(conversation_id),
                        "message_id": str(message.id),
                        "response_length": len(full_response),
                    },
                )

            except BedrockError as e:
                logger.warning(
                    "ai.chat.error",
                    extra={
                        "conversation_id": str(conversation_id),
                        "error": e.message,
                        "retryable": e.retryable,
                    },
                )
                error_event = SSEErrorEvent(
                    message=e.message,
                    retryable=e.retryable,
                )
                yield f"data: {error_event.model_dump_json()}\n\n"

            except Exception as e:
                logger.exception(
                    "ai.chat.unexpected_error",
                    extra={"conversation_id": str(conversation_id)},
                )
                error_event = SSEErrorEvent(
                    message="An unexpected error occurred.",
                    retryable=False,
                )
                yield f"data: {error_event.model_dump_json()}\n\n"

        return StreamingResponse(
            generate_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
```

**Step 4: Register the router in main.py**

Add to `services/core-api/app/main.py`:

```python
from .routes.ai import router as ai_router

# Add after other router includes:
app.include_router(ai_router)
```

**Step 5: Run test to verify it passes**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest tests/routes/test_ai_routes.py -v
```

Expected: All tests PASS

**Step 6: Run validation**

```bash
cd /apps/mosaic-life
just validate-backend
```

Expected: ruff and mypy pass

**Step 7: Commit**

```bash
git add services/core-api/app/routes/ai.py services/core-api/app/main.py services/core-api/tests/routes/test_ai_routes.py
git commit -m "feat(routes): add AI chat endpoints with SSE streaming"
```

---

## Task 8: Frontend API Client for SSE

**Files:**
- Create: `apps/web/src/lib/api/ai.ts`

**Step 1: Create the AI API client with SSE support**

Create `apps/web/src/lib/api/ai.ts`:

```typescript
/**
 * AI Chat API client with SSE streaming support.
 */

import { apiGet, apiPost, apiDelete } from './client';

// ============================================================================
// Types
// ============================================================================

export interface Persona {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  legacy_id: string;
  persona_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary {
  id: string;
  legacy_id: string;
  persona_id: string;
  title: string | null;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  token_count: number | null;
  created_at: string;
}

export interface MessageListResponse {
  messages: Message[];
  total: number;
  has_more: boolean;
}

export interface CreateConversationInput {
  legacy_id: string;
  persona_id: string;
}

export interface SendMessageInput {
  content: string;
}

// SSE Event types
export interface SSEChunkEvent {
  type: 'chunk';
  content: string;
}

export interface SSEDoneEvent {
  type: 'done';
  message_id: string;
  token_count: number | null;
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
  retryable: boolean;
}

export type SSEEvent = SSEChunkEvent | SSEDoneEvent | SSEErrorEvent;

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get available AI personas.
 */
export async function getPersonas(): Promise<Persona[]> {
  return apiGet<Persona[]>('/api/ai/personas');
}

/**
 * Create or get existing conversation.
 */
export async function createConversation(
  data: CreateConversationInput
): Promise<Conversation> {
  return apiPost<Conversation>('/api/ai/conversations', data);
}

/**
 * List user's conversations.
 */
export async function listConversations(
  legacyId?: string
): Promise<ConversationSummary[]> {
  const params = legacyId ? `?legacy_id=${legacyId}` : '';
  return apiGet<ConversationSummary[]>(`/api/ai/conversations${params}`);
}

/**
 * Get conversation messages.
 */
export async function getMessages(
  conversationId: string,
  limit = 50,
  offset = 0
): Promise<MessageListResponse> {
  return apiGet<MessageListResponse>(
    `/api/ai/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`
  );
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  return apiDelete(`/api/ai/conversations/${conversationId}`);
}

/**
 * Send a message and stream the response.
 *
 * @param conversationId - The conversation ID
 * @param content - The message content
 * @param onChunk - Callback for each content chunk
 * @param onDone - Callback when streaming completes
 * @param onError - Callback on error
 * @returns AbortController to cancel the stream
 */
export function streamMessage(
  conversationId: string,
  content: string,
  onChunk: (content: string) => void,
  onDone: (messageId: string, tokenCount: number | null) => void,
  onError: (message: string, retryable: boolean) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(
        `/api/ai/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        onError(
          errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
          response.status >= 500
        );
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError('No response body', false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              try {
                const event = JSON.parse(jsonStr) as SSEEvent;

                switch (event.type) {
                  case 'chunk':
                    onChunk(event.content);
                    break;
                  case 'done':
                    onDone(event.message_id, event.token_count);
                    break;
                  case 'error':
                    onError(event.message, event.retryable);
                    break;
                }
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError);
              }
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Stream was cancelled
        return;
      }
      console.error('Stream error:', error);
      onError('Connection error. Please try again.', true);
    }
  })();

  return controller;
}
```

**Step 2: Run frontend lint**

```bash
cd /apps/mosaic-life/apps/web
npm run lint
```

Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/api/ai.ts
git commit -m "feat(web): add AI chat API client with SSE streaming"
```

---

## Task 9: Zustand Store for AI Chat

**Files:**
- Create: `apps/web/src/stores/aiChatStore.ts`

**Step 1: Create the Zustand store**

Create `apps/web/src/stores/aiChatStore.ts`:

```typescript
/**
 * Zustand store for AI chat state management.
 */

import { create } from 'zustand';
import type { Message, Conversation } from '@/lib/api/ai';

export interface ChatMessage extends Message {
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  error?: string;
}

export interface ConversationState {
  conversation: Conversation | null;
  messages: ChatMessage[];
  isLoading: boolean;
}

interface AIChatState {
  // State
  conversations: Map<string, ConversationState>;
  activeConversationId: string | null;
  isStreaming: boolean;
  error: string | null;

  // Getters
  getActiveConversation: () => ConversationState | null;
  getActiveMessages: () => ChatMessage[];

  // Actions
  setActiveConversation: (id: string | null) => void;
  setConversation: (id: string, conversation: Conversation) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateLastMessage: (conversationId: string, update: Partial<ChatMessage>) => void;
  appendToLastMessage: (conversationId: string, chunk: string) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  setConversationLoading: (conversationId: string, loading: boolean) => void;
  clearConversation: (conversationId: string) => void;
  reset: () => void;
}

const initialState = {
  conversations: new Map<string, ConversationState>(),
  activeConversationId: null,
  isStreaming: false,
  error: null,
};

export const useAIChatStore = create<AIChatState>((set, get) => ({
  ...initialState,

  // Getters
  getActiveConversation: () => {
    const { conversations, activeConversationId } = get();
    if (!activeConversationId) return null;
    return conversations.get(activeConversationId) || null;
  },

  getActiveMessages: () => {
    const state = get().getActiveConversation();
    return state?.messages || [];
  },

  // Actions
  setActiveConversation: (id) => {
    set({ activeConversationId: id, error: null });
  },

  setConversation: (id, conversation) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(id);
      conversations.set(id, {
        conversation,
        messages: existing?.messages || [],
        isLoading: existing?.isLoading || false,
      });
      return { conversations };
    });
  },

  setMessages: (conversationId, messages) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing) {
        conversations.set(conversationId, {
          ...existing,
          messages: messages.map((m) => ({ ...m, status: 'complete' as const })),
        });
      }
      return { conversations };
    });
  },

  addMessage: (conversationId, message) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing) {
        conversations.set(conversationId, {
          ...existing,
          messages: [...existing.messages, message],
        });
      }
      return { conversations };
    });
  },

  updateLastMessage: (conversationId, update) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing && existing.messages.length > 0) {
        const messages = [...existing.messages];
        const lastIdx = messages.length - 1;
        messages[lastIdx] = { ...messages[lastIdx], ...update };
        conversations.set(conversationId, { ...existing, messages });
      }
      return { conversations };
    });
  },

  appendToLastMessage: (conversationId, chunk) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing && existing.messages.length > 0) {
        const messages = [...existing.messages];
        const lastIdx = messages.length - 1;
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: messages[lastIdx].content + chunk,
        };
        conversations.set(conversationId, { ...existing, messages });
      }
      return { conversations };
    });
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming });
  },

  setError: (error) => {
    set({ error });
  },

  setConversationLoading: (conversationId, loading) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing) {
        conversations.set(conversationId, { ...existing, isLoading: loading });
      } else {
        conversations.set(conversationId, {
          conversation: null,
          messages: [],
          isLoading: loading,
        });
      }
      return { conversations };
    });
  },

  clearConversation: (conversationId) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      conversations.delete(conversationId);
      return {
        conversations,
        activeConversationId:
          state.activeConversationId === conversationId
            ? null
            : state.activeConversationId,
      };
    });
  },

  reset: () => {
    set(initialState);
  },
}));
```

**Step 2: Run frontend lint**

```bash
cd /apps/mosaic-life/apps/web
npm run lint
```

Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/stores/aiChatStore.ts
git commit -m "feat(web): add Zustand store for AI chat state"
```

---

## Task 10: useAIChat Hook

**Files:**
- Create: `apps/web/src/hooks/useAIChat.ts`

**Step 1: Create the useAIChat hook**

Create `apps/web/src/hooks/useAIChat.ts`:

```typescript
/**
 * Custom hook for AI chat functionality.
 * Combines Zustand store with API calls and SSE streaming.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createConversation,
  getMessages,
  getPersonas,
  streamMessage,
  type Persona,
} from '@/lib/api/ai';
import { useAIChatStore, type ChatMessage } from '@/stores/aiChatStore';

// Query keys
export const aiChatKeys = {
  all: ['ai-chat'] as const,
  personas: () => [...aiChatKeys.all, 'personas'] as const,
  conversations: () => [...aiChatKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...aiChatKeys.conversations(), id] as const,
  messages: (conversationId: string) =>
    [...aiChatKeys.conversation(conversationId), 'messages'] as const,
};

interface UseAIChatOptions {
  legacyId: string;
  personaId: string;
  legacyName?: string;
}

interface UseAIChatReturn {
  // State
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  conversationId: string | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for personas list.
 */
export function usePersonas() {
  return useQuery({
    queryKey: aiChatKeys.personas(),
    queryFn: getPersonas,
    staleTime: 1000 * 60 * 60, // 1 hour - personas don't change often
  });
}

/**
 * Main hook for AI chat functionality.
 */
export function useAIChat({
  legacyId,
  personaId,
}: UseAIChatOptions): UseAIChatReturn {
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);

  const {
    activeConversationId,
    isStreaming,
    error,
    getActiveMessages,
    setActiveConversation,
    setConversation,
    setMessages,
    addMessage,
    updateLastMessage,
    appendToLastMessage,
    setStreaming,
    setError,
    setConversationLoading,
    getActiveConversation,
  } = useAIChatStore();

  const conversationState = getActiveConversation();
  const messages = getActiveMessages();
  const isLoading = conversationState?.isLoading || false;

  // Initialize conversation
  useEffect(() => {
    let mounted = true;

    async function initConversation() {
      // Generate a stable key for this legacy/persona combination
      const key = `${legacyId}-${personaId}`;

      setConversationLoading(key, true);
      setActiveConversation(key);

      try {
        // Create or get existing conversation
        const conversation = await createConversation({
          legacy_id: legacyId,
          persona_id: personaId,
        });

        if (!mounted) return;

        setConversation(conversation.id, conversation);
        setActiveConversation(conversation.id);

        // Load existing messages
        const { messages: existingMessages } = await getMessages(conversation.id);

        if (!mounted) return;

        setMessages(conversation.id, existingMessages);
        setConversationLoading(conversation.id, false);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to initialize conversation:', err);
        setError('Failed to start conversation. Please try again.');
        setConversationLoading(key, false);
      }
    }

    initConversation();

    return () => {
      mounted = false;
      // Cancel any in-flight stream
      abortControllerRef.current?.abort();
    };
  }, [legacyId, personaId]);

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeConversationId || isStreaming) return;

      const conversationId = activeConversationId;
      lastUserMessageRef.current = content;
      setError(null);

      // Add user message to UI immediately
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content,
        token_count: null,
        created_at: new Date().toISOString(),
        status: 'complete',
      };
      addMessage(conversationId, userMessage);

      // Add placeholder for assistant response
      const assistantMessage: ChatMessage = {
        id: `temp-assistant-${Date.now()}`,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        token_count: null,
        created_at: new Date().toISOString(),
        status: 'streaming',
      };
      addMessage(conversationId, assistantMessage);

      setStreaming(true);

      // Start streaming
      abortControllerRef.current = streamMessage(
        conversationId,
        content,
        // onChunk
        (chunk) => {
          appendToLastMessage(conversationId, chunk);
        },
        // onDone
        (messageId, tokenCount) => {
          updateLastMessage(conversationId, {
            id: messageId,
            token_count: tokenCount,
            status: 'complete',
          });
          setStreaming(false);
          lastUserMessageRef.current = null;
        },
        // onError
        (message, retryable) => {
          updateLastMessage(conversationId, {
            status: 'error',
            error: message,
          });
          setStreaming(false);
          setError(message);
        }
      );
    },
    [activeConversationId, isStreaming, addMessage, appendToLastMessage, updateLastMessage, setStreaming, setError]
  );

  // Retry last message
  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessageRef.current || !activeConversationId) return;

    // Remove the failed assistant message
    const currentMessages = getActiveMessages();
    if (currentMessages.length > 0) {
      const lastMessage = currentMessages[currentMessages.length - 1];
      if (lastMessage.status === 'error' && lastMessage.role === 'assistant') {
        // Remove last two messages (user + failed assistant)
        const trimmedMessages = currentMessages.slice(0, -2);
        setMessages(activeConversationId, trimmedMessages);
      }
    }

    // Resend
    await sendMessage(lastUserMessageRef.current);
  }, [activeConversationId, getActiveMessages, setMessages, sendMessage]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    conversationId: activeConversationId,
    sendMessage,
    retryLastMessage,
    clearError,
  };
}
```

**Step 2: Run frontend lint**

```bash
cd /apps/mosaic-life/apps/web
npm run lint
```

Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useAIChat.ts
git commit -m "feat(web): add useAIChat hook for streaming chat"
```

---

## Task 11: Update AIAgentChat Component

**Files:**
- Modify: `apps/web/src/components/AIAgentChat.tsx`

**Step 1: Read current component**

```bash
# Read the current component to understand its structure
head -100 /apps/mosaic-life/apps/web/src/components/AIAgentChat.tsx
```

**Step 2: Update component to use real API**

This is a larger modification. Key changes:
- Replace mock data with `useAIChat` hook
- Replace mock message sending with real streaming
- Add error display with retry button
- Keep existing UI structure

The implementation should:
1. Import `useAIChat` and `usePersonas` hooks
2. Get `legacyId` from route params
3. Replace `useState` for messages with hook state
4. Replace `handleSendMessage` with hook's `sendMessage`
5. Add streaming indicator during response
6. Add error toast/display with retry button

**Step 3: Run frontend tests**

```bash
cd /apps/mosaic-life/apps/web
npm run test
```

**Step 4: Run frontend lint**

```bash
cd /apps/mosaic-life/apps/web
npm run lint
```

**Step 5: Commit**

```bash
git add apps/web/src/components/AIAgentChat.tsx
git commit -m "feat(web): integrate AIAgentChat with real API and streaming"
```

---

## Task 12: Backend Validation & Full Test

**Step 1: Run all backend tests**

```bash
cd /apps/mosaic-life/services/core-api
uv run pytest -v
```

Expected: All tests PASS

**Step 2: Run backend validation**

```bash
cd /apps/mosaic-life
just validate-backend
```

Expected: ruff and mypy pass

**Step 3: Start local environment and test manually**

```bash
# Start all services
docker compose -f /apps/mosaic-life/infra/compose/docker-compose.yml up -d

# Run migrations
cd /apps/mosaic-life/services/core-api
uv run alembic upgrade head

# Start backend
uv run python -m app.main
```

In another terminal:
```bash
# Start frontend
cd /apps/mosaic-life/apps/web
npm run dev
```

**Step 4: Manual testing checklist**

- [ ] Navigate to a legacy's AI chat page
- [ ] Verify personas load (Biographer, Friend)
- [ ] Select Biographer persona
- [ ] Send a message
- [ ] Verify streaming response appears
- [ ] Verify conversation persists on page refresh
- [ ] Test error handling (disconnect network temporarily)
- [ ] Verify retry button works

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Bedrock AI chat integration Phase 1"
```

---

## Task 13: Infrastructure - IAM Policy for Bedrock

**Files:**
- Modify: Infrastructure repo or CDK stack

**Step 1: Add Bedrock IAM policy**

The EKS service account needs permission to call Bedrock. Add to the IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-*"
      ]
    }
  ]
}
```

**Step 2: Add environment variable**

In Helm values or ConfigMap:

```yaml
env:
  AWS_REGION: "us-east-1"
```

**Step 3: Deploy and verify**

```bash
# Deploy via ArgoCD
argocd app sync mosaic-core-api

# Verify pod can reach Bedrock
kubectl exec -it deploy/core-api -- python -c "import boto3; print(boto3.client('bedrock-runtime', region_name='us-east-1').list_foundation_models())"
```

---

## Summary

This plan covers 13 tasks to implement Phase 1 of the Bedrock AI Chat integration:

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | Database migration | 5 |
| 2 | SQLAlchemy models | 7 |
| 3 | Pydantic schemas | 3 |
| 4 | Persona configuration | 7 |
| 5 | Bedrock adapter | 7 |
| 6 | AI service layer | 6 |
| 7 | AI routes with SSE | 7 |
| 8 | Frontend API client | 3 |
| 9 | Zustand store | 3 |
| 10 | useAIChat hook | 3 |
| 11 | Update AIAgentChat | 5 |
| 12 | Full validation | 5 |
| 13 | Infrastructure | 3 |

**Total:** ~64 steps across 13 tasks

Each task follows TDD where applicable and includes validation/commit steps.
