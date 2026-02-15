"""Tests for config-driven AI provider selection."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.adapters.ai import AIProviderError, get_embedding_provider, get_llm_provider
from app.adapters.bedrock import BedrockAdapter
from app.adapters.openai import OpenAIProvider
from app.config import get_settings
from app.providers import registry as registry_module


class TestProviderSelection:
    """Tests for provider selection via environment settings."""

    def setup_method(self) -> None:
        get_settings.cache_clear()
        registry_module._provider_registry = None
        registry_module._provider_registry_signature = None

    def teardown_method(self) -> None:
        get_settings.cache_clear()
        registry_module._provider_registry = None
        registry_module._provider_registry_signature = None

    def test_defaults_to_bedrock(self) -> None:
        """Default provider settings should resolve to Bedrock."""
        import app.adapters.bedrock as bedrock_module

        bedrock_module._adapter = None

        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="bedrock",
                ai_embedding_provider="bedrock",
                aws_region="us-east-1",
                openai_api_key=None,
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            llm_provider = get_llm_provider()
            embedding_provider = get_embedding_provider()

        assert isinstance(llm_provider, BedrockAdapter)
        assert isinstance(embedding_provider, BedrockAdapter)
        assert llm_provider.region == "us-east-1"

    def test_uses_configured_region(self) -> None:
        """Provider getter should honor configured AWS region."""
        import app.adapters.bedrock as bedrock_module

        bedrock_module._adapter = None

        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="bedrock",
                ai_embedding_provider="bedrock",
                aws_region="us-west-2",
                openai_api_key=None,
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            llm_provider = get_llm_provider()
            embedding_provider = get_embedding_provider()

        assert isinstance(llm_provider, BedrockAdapter)
        assert isinstance(embedding_provider, BedrockAdapter)
        assert llm_provider.region == "us-west-2"
        assert embedding_provider.region == "us-west-2"

    def test_region_argument_overrides_config(self) -> None:
        """Explicit region argument should override AWS_REGION setting."""
        import app.adapters.bedrock as bedrock_module

        bedrock_module._adapter = None

        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="bedrock",
                ai_embedding_provider="bedrock",
                aws_region="us-west-2",
                openai_api_key=None,
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            llm_provider = get_llm_provider(region="eu-west-1")

        assert isinstance(llm_provider, BedrockAdapter)
        assert llm_provider.region == "eu-west-1"

    def test_invalid_llm_provider_raises(self) -> None:
        """Unknown LLM provider should raise configuration error."""
        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="unknown-provider",
                ai_embedding_provider="bedrock",
                aws_region="us-east-1",
                openai_api_key=None,
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            with pytest.raises(AIProviderError) as exc:
                get_llm_provider()

        assert "Unsupported LLM provider" in exc.value.message

    def test_invalid_embedding_provider_raises(
        self,
    ) -> None:
        """Unknown embedding provider should raise configuration error."""
        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="bedrock",
                ai_embedding_provider="unknown-provider",
                aws_region="us-east-1",
                openai_api_key=None,
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            with pytest.raises(AIProviderError) as exc:
                get_embedding_provider()

        assert "Unsupported embedding provider" in exc.value.message

    def test_openai_llm_provider_selected(self) -> None:
        """OpenAI should be selected for LLM provider when configured."""
        import app.adapters.openai as openai_module

        openai_module._provider = None

        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="openai",
                ai_embedding_provider="bedrock",
                aws_region="us-east-1",
                openai_api_key="test-key",
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            llm_provider = get_llm_provider()

        assert isinstance(llm_provider, OpenAIProvider)

    def test_openai_embedding_provider_selected(self) -> None:
        """OpenAI should be selected for embedding provider when configured."""
        import app.adapters.openai as openai_module

        openai_module._provider = None

        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="bedrock",
                ai_embedding_provider="openai",
                aws_region="us-east-1",
                openai_api_key="test-key",
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            embedding_provider = get_embedding_provider()

        assert isinstance(embedding_provider, OpenAIProvider)

    def test_openai_llm_provider_requires_api_key(self) -> None:
        """Selecting OpenAI for LLM without API key should fail fast."""
        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="openai",
                ai_embedding_provider="bedrock",
                aws_region="us-east-1",
                openai_api_key=None,
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            with pytest.raises(AIProviderError) as exc:
                get_llm_provider()

        assert "OPENAI_API_KEY is required" in exc.value.message

    def test_openai_embedding_provider_requires_api_key(self) -> None:
        """Selecting OpenAI for embeddings without API key should fail fast."""
        with patch(
            "app.providers.registry.get_settings",
            return_value=SimpleNamespace(
                ai_llm_provider="bedrock",
                ai_embedding_provider="openai",
                aws_region="us-east-1",
                openai_api_key=None,
                openai_base_url="https://api.openai.com/v1",
                openai_chat_model="gpt-4o-mini",
                openai_embedding_model="text-embedding-3-small",
            ),
        ):
            with pytest.raises(AIProviderError) as exc:
                get_embedding_provider()

        assert "OPENAI_API_KEY is required" in exc.value.message
