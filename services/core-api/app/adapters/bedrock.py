"""AWS Bedrock adapter for AI chat."""

import json
import logging
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import aioboto3  # type: ignore[import-untyped]
from botocore.exceptions import ClientError  # type: ignore[import-untyped]
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

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.bedrock")

# Titan Embeddings v2 constants
TITAN_EMBED_MODEL_ID = "amazon.titan-embed-text-v2:0"
TITAN_EMBED_DIMENSION = 1024


def _map_bedrock_error(error_code: str) -> tuple[str, bool]:
    if error_code == "ThrottlingException":
        return "rate_limit", True
    if error_code in {"ModelTimeoutException", "ServiceUnavailableException"}:
        return "provider_unavailable", True
    if error_code in {"AccessDeniedException", "UnrecognizedClientException"}:
        return "auth_error", False
    if error_code == "ValidationException":
        return "invalid_request", False
    return "unknown", False


def _extract_triggered_filters(guardrail_trace: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract list of triggered filters from guardrail trace data.

    Args:
        guardrail_trace: Guardrail trace data from Bedrock response.

    Returns:
        List of triggered filters with type, confidence, and other details.
    """
    triggered_filters = []
    input_assessment = guardrail_trace.get("input", {})

    for assessment in input_assessment.values():
        if "contentPolicy" in assessment:
            for f in assessment["contentPolicy"].get("filters", []):
                if f.get("action") == "BLOCKED":
                    triggered_filters.append(
                        {
                            "type": f.get("type"),
                            "confidence": f.get("confidence"),
                        }
                    )
        if "topicPolicy" in assessment:
            for t in assessment["topicPolicy"].get("topics", []):
                if t.get("action") == "BLOCKED":
                    triggered_filters.append(
                        {
                            "type": "TOPIC",
                            "name": t.get("name"),
                        }
                    )

    return triggered_filters


class BedrockError(AIProviderError):
    """Exception raised for Bedrock API errors."""


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
    async def _get_client(self) -> AsyncGenerator[Any, None]:
        """Get async Bedrock runtime client."""
        async with self._session.client(
            "bedrock-runtime",
            region_name=self.region,
        ) as client:
            yield client

    def _format_messages(self, messages: list[dict[str, str]]) -> list[dict[str, Any]]:
        """Format messages for Bedrock Converse API.

        Args:
            messages: List of {"role": str, "content": str} dicts.

        Returns:
            Messages formatted for Converse API.
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
        guardrail_id: str | None = None,
        guardrail_version: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream generate a response from Bedrock using Converse API.

        Uses converse_stream for real-time streaming with async guardrails.

        Args:
            messages: Conversation history.
            system_prompt: System prompt for the model.
            model_id: Bedrock model identifier.
            max_tokens: Maximum tokens to generate.
            guardrail_id: Optional Bedrock Guardrail ID.
            guardrail_version: Optional Bedrock Guardrail version.

        Yields:
            Content chunks as they arrive.

        Raises:
            BedrockError: On API errors.
        """
        started = time.perf_counter()
        with tracer.start_as_current_span("ai.bedrock.stream") as span:
            span.set_attribute(AI_PROVIDER, "bedrock")
            span.set_attribute(AI_OPERATION, "stream_generate")
            span.set_attribute(AI_MODEL, model_id)
            span.set_attribute("message_count", len(messages))

            formatted_messages = self._format_messages(messages)

            logger.info(
                "bedrock.request",
                extra={
                    "model_id": model_id,
                    "message_count": len(formatted_messages),
                    "max_tokens": max_tokens,
                    "system_prompt_length": len(system_prompt) if system_prompt else 0,
                },
            )

            try:
                async with self._get_client() as client:
                    logger.info("bedrock.calling_api", extra={"model_id": model_id})

                    # Build converse_stream parameters
                    converse_params: dict[str, Any] = {
                        "modelId": model_id,
                        "messages": formatted_messages,
                        "system": [{"text": system_prompt}],
                        "inferenceConfig": {
                            "maxTokens": max_tokens,
                        },
                    }

                    # Add guardrail config with async streaming mode
                    if guardrail_id and guardrail_version:
                        converse_params["guardrailConfig"] = {
                            "guardrailIdentifier": guardrail_id,
                            "guardrailVersion": guardrail_version,
                            "streamProcessingMode": "async",
                            "trace": "enabled",
                        }
                        logger.info(
                            "bedrock.using_guardrail",
                            extra={
                                "guardrail_id": guardrail_id,
                                "guardrail_version": guardrail_version,
                                "stream_mode": "async",
                            },
                        )

                    response = await client.converse_stream(**converse_params)
                    logger.info(
                        "bedrock.got_response",
                        extra={"response_keys": list(response.keys())},
                    )

                    total_tokens = 0
                    chunk_count = 0
                    stop_reason: str | None = None
                    guardrail_trace_data: dict[str, Any] = {}
                    event_stream = response.get("stream")

                    async for event in event_stream:
                        chunk_count += 1

                        # Handle text content chunks
                        if "contentBlockDelta" in event:
                            delta = event["contentBlockDelta"].get("delta", {})
                            text = delta.get("text", "")
                            if text:
                                yield text

                        # Handle message stop with stop reason
                        elif "messageStop" in event:
                            stop_reason = event["messageStop"].get("stopReason")
                            logger.info(
                                "bedrock.message_stop",
                                extra={
                                    "chunk_count": chunk_count,
                                    "stop_reason": stop_reason,
                                },
                            )

                            # Check for guardrail intervention
                            if stop_reason == "guardrail_intervened":
                                triggered_filters = _extract_triggered_filters(
                                    guardrail_trace_data
                                )
                                logger.warning(
                                    "bedrock.guardrail_intervened",
                                    extra={
                                        "guardrail_id": guardrail_id,
                                        "chunk_count": chunk_count,
                                        "triggered_filters": triggered_filters,
                                        "trace": guardrail_trace_data,
                                    },
                                )
                                span.set_attribute("guardrail_intervened", True)
                                span.set_attribute(
                                    "guardrail_filters",
                                    json.dumps(triggered_filters),
                                )
                                raise BedrockError(
                                    "Your message was filtered for safety. Please rephrase.",
                                    retryable=False,
                                    code="invalid_request",
                                    provider="bedrock",
                                    operation="stream_generate",
                                )

                        # Handle metadata with usage stats and guardrail trace
                        elif "metadata" in event:
                            metadata = event["metadata"]
                            usage = metadata.get("usage", {})
                            total_tokens = usage.get("outputTokens", 0)

                            # Capture guardrail trace if present
                            trace_data = metadata.get("trace", {})
                            if "guardrail" in trace_data:
                                guardrail_trace_data = trace_data["guardrail"]

                        # Log other event types for debugging
                        elif "messageStart" in event:
                            logger.debug(
                                "bedrock.message_start",
                                extra={"role": event["messageStart"].get("role")},
                            )
                        elif "contentBlockStart" in event:
                            logger.debug("bedrock.content_block_start")
                        elif "contentBlockStop" in event:
                            logger.debug("bedrock.content_block_stop")

                    span.set_attribute("output_tokens", total_tokens)
                    span.set_attribute("stop_reason", stop_reason or "unknown")

            except BedrockError as e:
                span.set_attribute(AI_ERROR_TYPE, e.code)
                span.set_attribute(AI_RETRYABLE, e.retryable)
                # Re-raise BedrockError (e.g., from guardrail intervention)
                raise

            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                mapped_error, retryable = _map_bedrock_error(error_code)
                span.set_attribute("error", True)
                span.set_attribute(AI_ERROR_TYPE, mapped_error)
                span.set_attribute(AI_RETRYABLE, retryable)

                if error_code == "ThrottlingException":
                    logger.warning("bedrock.throttled", extra={"error": str(e)})
                    raise BedrockError(
                        "Rate limit exceeded. Please try again.",
                        retryable=True,
                        code="rate_limit",
                        provider="bedrock",
                        operation="stream_generate",
                    ) from e

                elif error_code == "ModelTimeoutException":
                    logger.warning("bedrock.timeout", extra={"error": str(e)})
                    raise BedrockError(
                        "Request timed out. Please try again.",
                        retryable=True,
                        code="provider_unavailable",
                        provider="bedrock",
                        operation="stream_generate",
                    ) from e

                else:
                    logger.error(
                        "bedrock.client_error",
                        extra={
                            "error": str(e),
                            "model_id": model_id,
                            "code": error_code,
                        },
                    )
                    raise BedrockError(
                        "An error occurred while generating response.",
                        retryable=retryable,
                        code=mapped_error,
                        provider="bedrock",
                        operation="stream_generate",
                    ) from e

            except Exception as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_ERROR_TYPE, "unknown")
                span.set_attribute(AI_RETRYABLE, False)
                logger.error(
                    "bedrock.error",
                    extra={"error": str(e), "model_id": model_id},
                )
                raise BedrockError(
                    "An error occurred while generating response.",
                    retryable=False,
                    code="unknown",
                    provider="bedrock",
                    operation="stream_generate",
                ) from e
            finally:
                span.set_attribute(
                    AI_LATENCY_MS,
                    int((time.perf_counter() - started) * 1000),
                )

    async def embed_texts(
        self,
        texts: list[str],
        model_id: str = TITAN_EMBED_MODEL_ID,
        dimensions: int = TITAN_EMBED_DIMENSION,
    ) -> list[list[float]]:
        """Generate embeddings for a list of texts using Amazon Titan.

        Args:
            texts: List of texts to embed.
            model_id: Titan embedding model ID.
            dimensions: Embedding dimension (256, 512, or 1024).

        Returns:
            List of embedding vectors.

        Raises:
            BedrockError: If embedding generation fails.
        """
        started = time.perf_counter()
        with tracer.start_as_current_span("ai.bedrock.embed") as span:
            span.set_attribute(AI_PROVIDER, "bedrock")
            span.set_attribute(AI_OPERATION, "embed_texts")
            span.set_attribute(AI_MODEL, model_id)
            span.set_attribute("text_count", len(texts))
            span.set_attribute("dimensions", dimensions)

            embeddings: list[list[float]] = []

            try:
                async with self._get_client() as client:
                    for text in texts:
                        response = await client.invoke_model(
                            modelId=model_id,
                            body=json.dumps(
                                {
                                    "inputText": text,
                                    "dimensions": dimensions,
                                    "normalize": True,
                                }
                            ),
                        )

                        body_bytes = await response["body"].read()
                        result = json.loads(body_bytes)
                        embeddings.append(result["embedding"])

                logger.info(
                    "bedrock.embed_complete",
                    extra={
                        "model_id": model_id,
                        "text_count": len(texts),
                        "dimensions": dimensions,
                    },
                )

                return embeddings

            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                mapped_error, retryable = _map_bedrock_error(error_code)
                span.set_attribute("error", True)
                span.set_attribute(AI_ERROR_TYPE, mapped_error)
                span.set_attribute(AI_RETRYABLE, retryable)
                logger.error(
                    "bedrock.embed_error",
                    extra={"error_code": error_code, "text_count": len(texts)},
                )

                if error_code == "ThrottlingException":
                    raise BedrockError(
                        "Rate limit exceeded",
                        retryable=True,
                        code="rate_limit",
                        provider="bedrock",
                        operation="embed_texts",
                    ) from e
                raise BedrockError(
                    f"Embedding failed: {error_code}",
                    retryable=retryable,
                    code=mapped_error,
                    provider="bedrock",
                    operation="embed_texts",
                ) from e

            except Exception as e:
                span.set_attribute("error", True)
                span.record_exception(e)
                span.set_attribute(AI_ERROR_TYPE, "unknown")
                span.set_attribute(AI_RETRYABLE, False)
                logger.error("bedrock.embed_error", extra={"error": str(e)})
                raise BedrockError(
                    "Embedding generation failed",
                    retryable=False,
                    code="unknown",
                    provider="bedrock",
                    operation="embed_texts",
                ) from e
            finally:
                span.set_attribute(
                    AI_LATENCY_MS,
                    int((time.perf_counter() - started) * 1000),
                )


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
    if _adapter is None or _adapter.region != region:
        _adapter = BedrockAdapter(region=region)
    return _adapter
