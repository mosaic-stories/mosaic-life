"""AI provider abstractions.

This module defines protocol interfaces used by routes/services so provider
implementations can be swapped without business-logic changes.
"""

from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from ..models.ai import AIMessage
    from ..adapters.storytelling import PreparedStoryTurn
    from ..schemas.retrieval import ChunkResult


class AIProviderError(Exception):
    """Standard error envelope for AI provider operations."""

    def __init__(
        self,
        message: str,
        retryable: bool = False,
        code: str = "unknown",
        provider: str | None = None,
        operation: str | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.retryable = retryable
        self.code = code
        self.provider = provider
        self.operation = operation


class LLMProvider(Protocol):
    """Protocol for LLM generation/streaming."""

    def stream_generate(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model_id: str,
        max_tokens: int = 1024,
        guardrail_id: str | None = None,
        guardrail_version: str | None = None,
    ) -> AsyncGenerator[str, None]: ...


class EmbeddingProvider(Protocol):
    """Protocol for embedding generation."""

    async def embed_texts(
        self,
        texts: list[str],
        model_id: str = "amazon.titan-embed-text-v2:0",
        dimensions: int = 1024,
    ) -> list[list[float]]: ...


class VectorStore(Protocol):
    """Protocol for vector storage and retrieval operations."""

    async def store_chunks(
        self,
        db: "AsyncSession",
        story_id: "UUID",
        chunks: list[tuple[str, list[float]]],
        legacy_id: "UUID",
        visibility: str,
        author_id: "UUID",
    ) -> int: ...

    async def delete_chunks_for_story(
        self,
        db: "AsyncSession",
        story_id: "UUID",
    ) -> int: ...

    async def retrieve_context(
        self,
        db: "AsyncSession",
        query: str,
        legacy_id: "UUID",
        user_id: "UUID",
        top_k: int = 5,
    ) -> list["ChunkResult"]: ...


class AgentMemory(Protocol):
    """Protocol for conversation memory access and persistence."""

    async def get_context_messages(
        self,
        db: "AsyncSession",
        conversation_id: "UUID",
    ) -> list[dict[str, str]]: ...

    async def save_message(
        self,
        db: "AsyncSession",
        conversation_id: "UUID",
        role: str,
        content: str,
        token_count: int | None = None,
        blocked: bool = False,
    ) -> "AIMessage": ...

    async def mark_message_blocked(
        self,
        db: "AsyncSession",
        message_id: "UUID",
    ) -> None: ...


class ContentGuardrail(Protocol):
    """Protocol for provider-specific guardrail configuration."""

    def get_bedrock_guardrail(self) -> tuple[str | None, str | None]: ...


class StorytellingAgent(Protocol):
    """Protocol for orchestrating AI storytelling chat turns."""

    async def prepare_turn(
        self,
        db: "AsyncSession",
        conversation_id: "UUID",
        user_id: "UUID",
        user_query: str,
        legacy_id: "UUID",
        persona_id: str,
        legacy_name: str,
        top_k: int = 5,
    ) -> "PreparedStoryTurn": ...

    def stream_response(
        self,
        turn: "PreparedStoryTurn",
        model_id: str,
        max_tokens: int,
    ) -> AsyncGenerator[str, None]: ...

    async def save_assistant_message(
        self,
        db: "AsyncSession",
        conversation_id: "UUID",
        content: str,
        token_count: int | None = None,
    ) -> "AIMessage": ...


def get_llm_provider(region: str | None = None) -> LLMProvider:
    """Compatibility wrapper returning configured LLM provider."""
    from ..providers.registry import get_provider_registry

    return get_provider_registry().get_llm_provider(region=region)


def get_embedding_provider(region: str | None = None) -> EmbeddingProvider:
    """Compatibility wrapper returning configured embedding provider."""
    from ..providers.registry import get_provider_registry

    return get_provider_registry().get_embedding_provider(region=region)
