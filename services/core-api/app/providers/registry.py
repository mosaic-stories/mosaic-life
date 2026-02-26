"""Central registry for runtime AI provider resolution."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from ..adapters.ai import AIProviderError
from ..config import get_settings

if TYPE_CHECKING:
    from ..adapters.ai import (
        AgentMemory,
        ContentGuardrail,
        EmbeddingProvider,
        LLMProvider,
        StorytellingAgent,
        VectorStore,
    )
    from ..adapters.graph_adapter import GraphAdapter
    from ..config.settings import Settings
    from ..services.graph_context import GraphContextService


class ProviderRegistry:
    """Resolve provider implementations from runtime settings."""

    def __init__(self, settings: Settings):
        self._settings = settings

    def _resolve_region(self, region: str | None) -> str:
        return region or self._settings.aws_region

    def _require_openai_config(self, operation: str) -> None:
        if self._settings.openai_api_key:
            return
        raise AIProviderError(
            message="OPENAI_API_KEY is required when OpenAI provider is selected",
            retryable=False,
            code="auth_error",
            provider="openai",
            operation=operation,
        )

    def _get_openai_provider(self) -> object:
        from ..adapters.openai import get_openai_provider

        return get_openai_provider(
            api_key=self._settings.openai_api_key or "",
            base_url=self._settings.openai_base_url,
            default_chat_model=self._settings.openai_chat_model,
            default_embedding_model=self._settings.openai_embedding_model,
        )

    def _get_openai_llm_provider(self) -> LLMProvider:
        return cast("LLMProvider", self._get_openai_provider())

    def _get_openai_embedding_provider(self) -> EmbeddingProvider:
        return cast("EmbeddingProvider", self._get_openai_provider())

    def get_llm_provider(self, region: str | None = None) -> LLMProvider:
        """Return the configured LLM provider instance."""
        provider = self._settings.ai_llm_provider

        if provider == "bedrock":
            from ..adapters.bedrock import get_bedrock_adapter

            return get_bedrock_adapter(region=self._resolve_region(region))

        if provider == "openai":
            self._require_openai_config(operation="stream_generate")
            return self._get_openai_llm_provider()

        raise AIProviderError(
            message=f"Unsupported LLM provider configured: {provider}",
            retryable=False,
            code="invalid_request",
            provider=provider,
            operation="stream_generate",
        )

    def get_embedding_provider(self, region: str | None = None) -> EmbeddingProvider:
        """Return the configured embedding provider instance."""
        provider = self._settings.ai_embedding_provider

        if provider == "bedrock":
            from ..adapters.bedrock import get_bedrock_adapter

            return get_bedrock_adapter(region=self._resolve_region(region))

        if provider == "openai":
            self._require_openai_config(operation="embed_texts")
            return self._get_openai_embedding_provider()

        raise AIProviderError(
            message=f"Unsupported embedding provider configured: {provider}",
            retryable=False,
            code="invalid_request",
            provider=provider,
            operation="embed_texts",
        )

    def get_vector_store(self) -> VectorStore:
        """Return the configured vector store adapter."""
        from ..adapters.storytelling import PostgresVectorStoreAdapter

        return PostgresVectorStoreAdapter()

    def get_agent_memory(self) -> AgentMemory:
        """Return the configured conversation memory adapter."""
        from ..adapters.storytelling import ConversationMemoryAdapter

        return ConversationMemoryAdapter()

    def get_content_guardrail(self) -> ContentGuardrail:
        """Return the configured content guardrail adapter."""
        from ..adapters.storytelling import BedrockGuardrailAdapter

        return BedrockGuardrailAdapter(
            guardrail_id=self._settings.bedrock_guardrail_id,
            guardrail_version=self._settings.bedrock_guardrail_version,
        )

    def get_graph_context_service(
        self, region: str | None = None
    ) -> GraphContextService | None:
        """Return a GraphContextService if graph augmentation is enabled."""
        if not self._settings.graph_augmentation_enabled:
            return None

        graph_adapter = self.get_graph_adapter()
        if not graph_adapter:
            return None

        from ..services.circuit_breaker import CircuitBreaker
        from ..services.graph_context import GraphContextService as _GCS

        return _GCS(
            graph_adapter=graph_adapter,
            llm_provider=self.get_llm_provider(region=region),
            intent_model_id=self._settings.intent_analysis_model_id,
            circuit_breaker=CircuitBreaker(failure_threshold=3, recovery_timeout=30.0),
        )

    def get_storytelling_agent(
        self,
        region: str | None = None,
    ) -> StorytellingAgent:
        """Return the default storytelling orchestrator."""
        from ..adapters.storytelling import (
            DefaultStorytellingAgent,
            format_story_context,
        )

        return DefaultStorytellingAgent(
            llm_provider=self.get_llm_provider(region=region),
            vector_store=self.get_vector_store(),
            memory=self.get_agent_memory(),
            guardrail=self.get_content_guardrail(),
            context_formatter=format_story_context,
            graph_context_service=self.get_graph_context_service(region=region),
        )

    def get_graph_adapter(self) -> GraphAdapter | None:
        """Return the configured graph adapter, or None if disabled."""
        from ..adapters.graph_factory import create_graph_adapter

        return create_graph_adapter(self._settings)


_provider_registry: ProviderRegistry | None = None
_provider_registry_signature: tuple[str, ...] | None = None


def _settings_signature(settings: Settings) -> tuple[str, ...]:
    return (
        settings.ai_llm_provider,
        settings.ai_embedding_provider,
        settings.aws_region,
        settings.openai_api_key or "",
        settings.openai_base_url,
        settings.openai_chat_model,
        settings.openai_embedding_model,
    )


def get_provider_registry() -> ProviderRegistry:
    """Get singleton provider registry for current settings."""
    global _provider_registry
    global _provider_registry_signature

    settings = get_settings()
    signature = _settings_signature(settings)

    if _provider_registry is None or _provider_registry_signature != signature:
        _provider_registry = ProviderRegistry(settings=settings)
        _provider_registry_signature = signature

    return _provider_registry
