"""AWS Bedrock adapter for AI chat."""

import json
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import aioboto3  # type: ignore[import-untyped]
from botocore.exceptions import ClientError  # type: ignore[import-untyped]
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
    async def _get_client(self) -> AsyncGenerator[Any, None]:
        """Get async Bedrock runtime client."""
        async with self._session.client(
            "bedrock-runtime",
            region_name=self.region,
        ) as client:
            yield client

    def _format_messages(self, messages: list[dict[str, str]]) -> list[dict[str, Any]]:
        """Format messages for Bedrock Anthropic API.

        Args:
            messages: List of {"role": str, "content": str} dicts.

        Returns:
            Messages formatted for Bedrock API.
        """
        return [
            {
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}],
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
        """Stream generate a response from Bedrock.

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

                    invoke_params = {
                        "modelId": model_id,
                        "contentType": "application/json",
                        "accept": "application/json",
                        "body": json.dumps(request_body),
                    }

                    # Add guardrail if configured
                    if guardrail_id and guardrail_version:
                        invoke_params["guardrailIdentifier"] = guardrail_id
                        invoke_params["guardrailVersion"] = guardrail_version
                        logger.info(
                            "bedrock.using_guardrail",
                            extra={
                                "guardrail_id": guardrail_id,
                                "guardrail_version": guardrail_version,
                            },
                        )

                    response = await client.invoke_model_with_response_stream(
                        **invoke_params
                    )
                    logger.info(
                        "bedrock.got_response",
                        extra={"response_keys": list(response.keys())},
                    )

                    total_tokens = 0
                    chunk_count = 0
                    event_stream = response.get("body")
                    logger.info(
                        "bedrock.event_stream_type",
                        extra={"stream_type": str(type(event_stream))},
                    )

                    async for event in event_stream:
                        chunk = json.loads(event["chunk"]["bytes"])
                        chunk_count += 1
                        chunk_type = chunk.get("type", "")

                        # Handle content_block_delta events (streaming text)
                        if chunk_type == "content_block_delta":
                            delta = chunk.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    yield text

                        # Handle message_stop event
                        elif chunk_type == "message_stop":
                            logger.info(
                                "bedrock.message_stop",
                                extra={"chunk_count": chunk_count},
                            )

                        # Handle message_delta for usage stats
                        elif chunk_type == "message_delta":
                            usage = chunk.get("usage", {})
                            total_tokens = usage.get("output_tokens", 0)

                        # Legacy format support: contentBlockDelta
                        elif "contentBlockDelta" in chunk:
                            delta = chunk["contentBlockDelta"]["delta"]
                            if "text" in delta:
                                yield delta["text"]

                        elif "metadata" in chunk:
                            usage = chunk["metadata"].get("usage", {})
                            total_tokens = usage.get("outputTokens", 0)

                    span.set_attribute("output_tokens", total_tokens)

            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                span.set_attribute("error", True)

                if error_code == "ThrottlingException":
                    logger.warning("bedrock.throttled", extra={"error": str(e)})
                    raise BedrockError(
                        "Rate limit exceeded. Please try again.",
                        retryable=True,
                    ) from e

                elif error_code == "ModelTimeoutException":
                    logger.warning("bedrock.timeout", extra={"error": str(e)})
                    raise BedrockError(
                        "Request timed out. Please try again.",
                        retryable=True,
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
                        retryable=False,
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
