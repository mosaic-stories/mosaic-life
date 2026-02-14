"""AI provider abstractions.

This module defines protocol interfaces used by routes/services so provider
implementations can be swapped without business-logic changes.
"""

from collections.abc import AsyncGenerator
from typing import Protocol


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


def get_llm_provider(region: str | None = None) -> LLMProvider:
    """Compatibility wrapper returning configured LLM provider."""
    from ..providers.registry import get_provider_registry

    return get_provider_registry().get_llm_provider(region=region)


def get_embedding_provider(region: str | None = None) -> EmbeddingProvider:
    """Compatibility wrapper returning configured embedding provider."""
    from ..providers.registry import get_provider_registry

    return get_provider_registry().get_embedding_provider(region=region)
