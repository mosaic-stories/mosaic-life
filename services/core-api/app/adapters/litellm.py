"""LiteLLM proxy adapter for AI chat and embeddings."""

import json
import logging
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import httpx
from opentelemetry import trace

from .ai import AIProviderError
from .telemetry import (
    AI_ERROR_TYPE,
    AI_LATENCY_MS,
    AI_MODEL,
    AI_OPERATION,
    AI_PROVIDER,
    AI_RETRYABLE,
)
from ..observability.metrics import (
    AI_EMBEDDING_DURATION,
    AI_REQUEST_DURATION,
    AI_TOKENS,
)

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.litellm")


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


class LiteLLMAdapter:
    """Adapter for LiteLLM proxy using OpenAI-compatible API."""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    @asynccontextmanager
    async def _client(self) -> AsyncGenerator[httpx.AsyncClient, None]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=httpx.Timeout(600.0),
        ) as client:
            yield client

    async def _read_error_message(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
            error = payload.get("error", {})
            message = error.get("message")
            if isinstance(message, str) and message:
                return message
        except Exception:
            pass
        return response.text or "LiteLLM request failed"

    async def stream_generate(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model_id: str,
        max_tokens: int = 1024,
        guardrail_id: str | None = None,
        guardrail_version: str | None = None,
    ) -> AsyncGenerator[str, None]:
        started = time.perf_counter()

        with tracer.start_as_current_span("ai.litellm.stream") as span:
            span.set_attribute(AI_PROVIDER, "litellm")
            span.set_attribute(AI_OPERATION, "stream_generate")
            span.set_attribute(AI_MODEL, model_id)
            span.set_attribute("message_count", len(messages))

            openai_messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                *messages,
            ]

            payload: dict[str, Any] = {
                "model": model_id,
                "messages": openai_messages,
                "stream": True,
                "max_tokens": max_tokens,
            }

            # Pass guardrail metadata if configured
            if guardrail_id and guardrail_version:
                payload["metadata"] = {
                    "guardrail_name": "bedrock-content-guard",
                    "guardrail_id": guardrail_id,
                    "guardrail_version": guardrail_version,
                }

            logger.info(
                "litellm.request",
                extra={
                    "model_id": model_id,
                    "message_count": len(openai_messages),
                    "max_tokens": max_tokens,
                },
            )

            try:
                async with self._client() as client:
                    async with client.stream(
                        "POST",
                        "/v1/chat/completions",
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
                                provider="litellm",
                                operation="stream_generate",
                            )

                        total_tokens = 0
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

                            # Extract usage from streaming chunks if present
                            usage = event.get("usage")
                            if usage:
                                total_tokens = usage.get(
                                    "completion_tokens", total_tokens
                                )

                            choices = event.get("choices", [])
                            if not choices:
                                continue

                            delta = choices[0].get("delta", {})
                            content = delta.get("content")
                            if isinstance(content, str) and content:
                                yield content

                        if total_tokens:
                            span.set_attribute("output_tokens", total_tokens)
                            AI_TOKENS.labels(
                                provider="litellm",
                                model=model_id,
                                direction="output",
                            ).inc(total_tokens)

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
                    message="LiteLLM request failed",
                    retryable=True,
                    code="provider_unavailable",
                    provider="litellm",
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
                    provider="litellm",
                    operation="stream_generate",
                ) from e
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(AI_LATENCY_MS, int(elapsed * 1000))
                AI_REQUEST_DURATION.labels(
                    provider="litellm",
                    model=model_id,
                    operation="stream_generate",
                    persona_id="",
                ).observe(elapsed)

    async def embed_texts(
        self,
        texts: list[str],
        model_id: str = "titan-embed-text-v2",
        dimensions: int = 1024,
    ) -> list[list[float]]:
        started = time.perf_counter()

        with tracer.start_as_current_span("ai.litellm.embed") as span:
            span.set_attribute(AI_PROVIDER, "litellm")
            span.set_attribute(AI_OPERATION, "embed_texts")
            span.set_attribute(AI_MODEL, model_id)
            span.set_attribute("text_count", len(texts))

            payload: dict[str, Any] = {
                "model": model_id,
                "input": texts,
            }

            if dimensions != 1024:
                payload["dimensions"] = dimensions

            try:
                async with self._client() as client:
                    response = await client.post("/v1/embeddings", json=payload)
                    if response.status_code >= 400:
                        message = await self._read_error_message(response)
                        code, retryable = _http_status_to_error(response.status_code)
                        raise AIProviderError(
                            message=message,
                            retryable=retryable,
                            code=code,
                            provider="litellm",
                            operation="embed_texts",
                        )

                    data = response.json()
                    rows = data.get("data", [])
                    embeddings = [row.get("embedding", []) for row in rows]

                    logger.info(
                        "litellm.embed_complete",
                        extra={
                            "model_id": model_id,
                            "text_count": len(texts),
                            "dimensions": dimensions,
                        },
                    )

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
                    message="LiteLLM embedding request failed",
                    retryable=True,
                    code="provider_unavailable",
                    provider="litellm",
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
                    provider="litellm",
                    operation="embed_texts",
                ) from e
            finally:
                elapsed = time.perf_counter() - started
                span.set_attribute(AI_LATENCY_MS, int(elapsed * 1000))
                AI_EMBEDDING_DURATION.labels(
                    provider="litellm",
                    model=model_id,
                ).observe(elapsed)


# Global adapter instance
_adapter: LiteLLMAdapter | None = None


def get_litellm_adapter(base_url: str, api_key: str) -> LiteLLMAdapter:
    """Get or create the LiteLLM adapter singleton."""
    global _adapter
    if (
        _adapter is None
        or _adapter.base_url != base_url.rstrip("/")
        or _adapter.api_key != api_key
    ):
        _adapter = LiteLLMAdapter(base_url=base_url, api_key=api_key)
    return _adapter
