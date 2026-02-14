"""Thin adapter shells and orchestration for AI storytelling."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from ..adapters.ai import (
    AIProviderError,
    AgentMemory,
    ContentGuardrail,
    LLMProvider,
    VectorStore,
)
from ..config.personas import build_system_prompt
from ..services import ai as ai_service
from ..services import retrieval as retrieval_service

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from ..models.ai import AIMessage
    from ..schemas.retrieval import ChunkResult

logger = logging.getLogger(__name__)


def format_story_context(chunks: list[ChunkResult]) -> str:
    """Format retrieved chunks for system prompt context."""
    if not chunks:
        return ""

    context_parts = ["\n## Relevant stories about this person:\n"]

    for i, chunk in enumerate(chunks, 1):
        context_parts.append(f"[Story excerpt {i}]\n{chunk.content}\n")

    context_parts.append(
        "\nUse these excerpts to inform your responses. "
        "Reference specific details when relevant. "
        "If the excerpts don't contain relevant information, "
        "say so rather than making things up."
    )

    return "\n".join(context_parts)


@dataclass(slots=True)
class PreparedStoryTurn:
    """Prepared context for an AI response turn."""

    context_messages: list[dict[str, str]]
    system_prompt: str
    chunks_count: int
    guardrail_id: str | None
    guardrail_version: str | None


class PostgresVectorStoreAdapter:
    """Thin adapter over existing retrieval service functions."""

    async def store_chunks(
        self,
        db: AsyncSession,
        story_id: UUID,
        chunks: list[tuple[str, list[float]]],
        legacy_id: UUID,
        visibility: str,
        author_id: UUID,
    ) -> int:
        return await retrieval_service.store_chunks(
            db=db,
            story_id=story_id,
            chunks=chunks,
            legacy_id=legacy_id,
            visibility=visibility,
            author_id=author_id,
        )

    async def delete_chunks_for_story(self, db: AsyncSession, story_id: UUID) -> int:
        return await retrieval_service.delete_chunks_for_story(db=db, story_id=story_id)

    async def retrieve_context(
        self,
        db: AsyncSession,
        query: str,
        legacy_id: UUID,
        user_id: UUID,
        top_k: int = 5,
    ) -> list[ChunkResult]:
        return await retrieval_service.retrieve_context(
            db=db,
            query=query,
            legacy_id=legacy_id,
            user_id=user_id,
            top_k=top_k,
        )


class ConversationMemoryAdapter:
    """Thin adapter over existing AI conversation service functions."""

    async def get_context_messages(
        self,
        db: AsyncSession,
        conversation_id: UUID,
    ) -> list[dict[str, str]]:
        return await ai_service.get_context_messages(
            db=db,
            conversation_id=conversation_id,
        )

    async def save_message(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        role: str,
        content: str,
        token_count: int | None = None,
        blocked: bool = False,
    ) -> AIMessage:
        return await ai_service.save_message(
            db=db,
            conversation_id=conversation_id,
            role=role,
            content=content,
            token_count=token_count,
            blocked=blocked,
        )

    async def mark_message_blocked(self, db: AsyncSession, message_id: UUID) -> None:
        await ai_service.mark_message_blocked(db=db, message_id=message_id)


class BedrockGuardrailAdapter:
    """Guardrail adapter exposing Bedrock guardrail configuration semantics."""

    def __init__(self, guardrail_id: str | None, guardrail_version: str | None):
        self.guardrail_id = guardrail_id
        self.guardrail_version = guardrail_version

    def get_bedrock_guardrail(self) -> tuple[str | None, str | None]:
        if self.guardrail_id and self.guardrail_version:
            return self.guardrail_id, self.guardrail_version
        return None, None


class DefaultStorytellingAgent:
    """Default orchestrator for context retrieval, prompting, and streaming."""

    def __init__(
        self,
        llm_provider: LLMProvider,
        vector_store: VectorStore,
        memory: AgentMemory,
        guardrail: ContentGuardrail,
        context_formatter: Callable[[list[ChunkResult]], str] = format_story_context,
    ):
        self.llm_provider = llm_provider
        self.vector_store = vector_store
        self.memory = memory
        self.guardrail = guardrail
        self.context_formatter = context_formatter

    async def prepare_turn(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        user_id: UUID,
        user_query: str,
        legacy_id: UUID,
        persona_id: str,
        legacy_name: str,
        top_k: int = 5,
    ) -> PreparedStoryTurn:
        chunks: list[ChunkResult] = []

        try:
            chunks = await self.vector_store.retrieve_context(
                db=db,
                query=user_query,
                legacy_id=legacy_id,
                user_id=user_id,
                top_k=top_k,
            )
        except Exception as exc:
            logger.warning(
                "ai.chat.rag_retrieval_failed",
                extra={
                    "conversation_id": str(conversation_id),
                    "error": str(exc),
                },
            )

        story_context = self.context_formatter(chunks)
        system_prompt = build_system_prompt(persona_id, legacy_name, story_context)
        if not system_prompt:
            raise AIProviderError(
                message="Failed to build system prompt",
                retryable=False,
                code="invalid_request",
                provider="storytelling",
                operation="prepare_turn",
            )

        context_messages = await self.memory.get_context_messages(
            db=db,
            conversation_id=conversation_id,
        )
        guardrail_id, guardrail_version = self.guardrail.get_bedrock_guardrail()

        return PreparedStoryTurn(
            context_messages=context_messages,
            system_prompt=system_prompt,
            chunks_count=len(chunks),
            guardrail_id=guardrail_id,
            guardrail_version=guardrail_version,
        )

    async def stream_response(
        self,
        turn: PreparedStoryTurn,
        model_id: str,
        max_tokens: int,
    ) -> AsyncGenerator[str, None]:
        async for chunk in self.llm_provider.stream_generate(
            messages=turn.context_messages,
            system_prompt=turn.system_prompt,
            model_id=model_id,
            max_tokens=max_tokens,
            guardrail_id=turn.guardrail_id,
            guardrail_version=turn.guardrail_version,
        ):
            yield chunk

    async def save_assistant_message(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        content: str,
        token_count: int | None = None,
    ) -> AIMessage:
        return await self.memory.save_message(
            db=db,
            conversation_id=conversation_id,
            role="assistant",
            content=content,
            token_count=token_count,
        )
