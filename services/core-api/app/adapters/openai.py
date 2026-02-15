"""Direct OpenAI adapter for chat streaming and embeddings."""

import json
import logging
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import httpx
from opentelemetry import trace

from .ai import AIProviderError
from ..observability.metrics import (
    AI_EMBEDDING_DURATION,
    AI_REQUEST_DURATION,
)
from .telemetry import (
    AI_ERROR_TYPE,
    AI_LATENCY_MS,
    AI_MODEL,
    AI_OPERATION,
    AI_PROVIDER,
    AI_RETRYABLE,
)

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.openai")


def _http_status_to_error(status_code: int) -> tuple[str, bool]:
    if status_code == 429:
        return "rate_limit", True
    if status_code in {500, 502, 503, 504}:
        return "provider_unavailable", True
    if status_code in {401, 403}:
        return "auth_error", False
    if status_code == 400:
        return "invalid_request", False
    return "unknown", False


def _is_bedrock_model_id(model_id: str) -> bool:
    return (
        model_id.startswith("us.")
        or model_id.startswith("amazon.")
        or model_id.startswith("anthropic.")
        or ":" in model_id
    )


class OpenAIProvider:
    """Direct OpenAI provider implementation for LLM and embeddings."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        default_chat_model: str = "gpt-4o-mini",
        default_embedding_model: str = "text-embedding-3-small",
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.default_chat_model = default_chat_model
        self.default_embedding_model = default_embedding_model

    @asynccontextmanager
    async def _client(self) -> AsyncGenerator[httpx.AsyncClient, None]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=httpx.Timeout(60.0),
        ) as client:
            yield client

    def _resolve_chat_model(self, model_id: str | None) -> str:
        if model_id and not _is_bedrock_model_id(model_id):
            return model_id
        return self.default_chat_model

    def _resolve_embedding_model(self, model_id: str | None) -> str:
        if model_id and not _is_bedrock_model_id(model_id):
            return model_id
        return self.default_embedding_model

    async def _read_error_message(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
            error = payload.get("error", {})
            message = error.get("message")
            if isinstance(message, str) and message:
                return message
        except Exception:
            pass
        return response.text or "OpenAI request failed"

    async def stream_generate(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model_id: str,
        max_tokens: int = 1024,
        guardrail_id: str | None = None,
        guardrail_version: str | None = None,
    ) -> AsyncGenerator[str, None]:
        del guardrail_id, guardrail_version

        resolved_model = self._resolve_chat_model(model_id)
        started = time.perf_counter()

        with tracer.start_as_current_span("ai.openai.stream") as span:
            span.set_attribute(AI_PROVIDER, "openai")
            span.set_attribute(AI_OPERATION, "stream_generate")
            span.set_attribute(AI_MODEL, resolved_model)
            span.set_attribute("message_count", len(messages))

            openai_messages = [
                {"role": "system", "content": system_prompt},
                *messages,
            ]

            payload: dict[str, Any] = {
                "model": resolved_model,
                "messages": openai_messages,
                "stream": True,
                "max_tokens": max_tokens,
            }

            logger.info(
                "openai.request",
                extra={
                    "model_id": resolved_model,
                    "message_count": len(openai_messages),
                    "max_tokens": max_tokens,
                },
            )

            try:
                async with self._client() as client:
                    async with client.stream(
                        "POST",
                        "/chat/completions",
                        json=payload,
                    ) as response:
                        if response.status_code >= 400:
                            message = await self._read_error_message(response)
                            code, retryable = _http_status_to_error(
                                response.status_code
                            )
                            raise AIProviderError(
                                message=message,
                                retryable=retryable,
                                code=code,
                                provider="openai",
                                operation="stream_generate",
                            )

                        async for line in response.aiter_lines():
                            if not line or not line.startswith("data: "):
                                continue

                            chunk_data = line[6:].strip()
                            if chunk_data == "[DONE]":
                                break

                            try:
                                event = json.loads(chunk_data)
                            except json.JSONDecodeError:
                                continue

                            choices = event.get("choices", [])
                            if not choices:
                                continue

                            delta = choices[0].get("delta", {})
                            content = delta.get("content")
                            if isinstance(content, str) and content:
                                yield content

            except AIProviderError as e:
                span.set_attribute(AI_RETRYABLE, e.retryable)
                span.set_attribute(AI_ERROR_TYPE, e.code)
                raise
            except httpx.HTTPError as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_RETRYABLE, True)
                span.set_attribute(AI_ERROR_TYPE, "provider_unavailable")
                raise AIProviderError(
                    message="OpenAI request failed",
                    retryable=True,
                    code="provider_unavailable",
                    provider="openai",
                    operation="stream_generate",
                ) from e
            except Exception as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_RETRYABLE, False)
                span.set_attribute(AI_ERROR_TYPE, "unknown")
                raise AIProviderError(
                    message="An error occurred while generating response.",
                    retryable=False,
                    code="unknown",
                    provider="openai",
                    operation="stream_generate",
                ) from e
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(
                    AI_LATENCY_MS,
                    int(elapsed * 1000),
                )
                AI_REQUEST_DURATION.labels(
                    provider="openai",
                    model=resolved_model,
                    operation="stream_generate",
                    persona_id="",
                ).observe(elapsed)

    async def embed_texts(
        self,
        texts: list[str],
        model_id: str = "amazon.titan-embed-text-v2:0",
        dimensions: int = 1024,
    ) -> list[list[float]]:
        resolved_model = self._resolve_embedding_model(model_id)
        started = time.perf_counter()

        with tracer.start_as_current_span("ai.openai.embed") as span:
            span.set_attribute(AI_PROVIDER, "openai")
            span.set_attribute(AI_OPERATION, "embed_texts")
            span.set_attribute(AI_MODEL, resolved_model)
            span.set_attribute("text_count", len(texts))

            payload: dict[str, Any] = {
                "model": resolved_model,
                "input": texts,
            }

            if dimensions != 1024:
                payload["dimensions"] = dimensions

            try:
                async with self._client() as client:
                    response = await client.post("/embeddings", json=payload)
                    if response.status_code >= 400:
                        message = await self._read_error_message(response)
                        code, retryable = _http_status_to_error(response.status_code)
                        raise AIProviderError(
                            message=message,
                            retryable=retryable,
                            code=code,
                            provider="openai",
                            operation="embed_texts",
                        )

                    data = response.json()
                    rows = data.get("data", [])
                    embeddings = [row.get("embedding", []) for row in rows]

                    return [e for e in embeddings if isinstance(e, list)]

            except AIProviderError as e:
                span.set_attribute(AI_RETRYABLE, e.retryable)
                span.set_attribute(AI_ERROR_TYPE, e.code)
                raise
            except httpx.HTTPError as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_RETRYABLE, True)
                span.set_attribute(AI_ERROR_TYPE, "provider_unavailable")
                raise AIProviderError(
                    message="OpenAI embedding request failed",
                    retryable=True,
                    code="provider_unavailable",
                    provider="openai",
                    operation="embed_texts",
                ) from e
            except Exception as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_RETRYABLE, False)
                span.set_attribute(AI_ERROR_TYPE, "unknown")
                raise AIProviderError(
                    message="Embedding generation failed",
                    retryable=False,
                    code="unknown",
                    provider="openai",
                    operation="embed_texts",
                ) from e
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(
                    AI_LATENCY_MS,
                    int(elapsed * 1000),
                )
                AI_EMBEDDING_DURATION.labels(
                    provider="openai",
                    model=resolved_model,
                ).observe(elapsed)


_provider: OpenAIProvider | None = None


def get_openai_provider(
    api_key: str,
    base_url: str,
    default_chat_model: str,
    default_embedding_model: str,
) -> OpenAIProvider:
    """Get or create singleton OpenAI provider for configured settings."""
    global _provider

    if (
        _provider is None
        or _provider.api_key != api_key
        or _provider.base_url != base_url.rstrip("/")
        or _provider.default_chat_model != default_chat_model
        or _provider.default_embedding_model != default_embedding_model
    ):
        _provider = OpenAIProvider(
            api_key=api_key,
            base_url=base_url,
            default_chat_model=default_chat_model,
            default_embedding_model=default_embedding_model,
        )

    return _provider
