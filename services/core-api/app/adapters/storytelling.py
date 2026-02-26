"""Thin adapter shells and orchestration for AI storytelling."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from opentelemetry import trace
from sqlalchemy import select

from ..adapters.ai import (
    AIProviderError,
    AgentMemory,
    ContentGuardrail,
    LLMProvider,
    VectorStore,
)
from ..config.personas import build_system_prompt
from ..services import ai as ai_service
from ..services import memory as memory_service
from ..services import retrieval as retrieval_service

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from ..models.ai import AIMessage
    from ..schemas.retrieval import ChunkResult
    from ..services.graph_context import GraphContextService

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.storytelling")


def format_story_context(chunks: list[ChunkResult]) -> str:
    """Format retrieved chunks for system prompt context."""
    if not chunks:
        return ""

    context_parts = ["\n## Relevant stories about this person:\n"]

    for i, chunk in enumerate(chunks, 1):
        context_parts.append(f"[Story excerpt {i}]\n{chunk.content}\n")

    context_parts.append(
        "\nThese excerpts are background knowledge ONLY. Guidelines:"
        "\n- If the user is sharing new information or memories, focus on what THEY are telling you."
        " Ask follow-up questions to learn more. Do NOT redirect the conversation to these excerpts."
        "\n- Only reference specific excerpt details when they are directly relevant to what"
        " the user is currently discussing."
        "\n- If the excerpts don't relate to the current topic, ignore them entirely."
        "\n- Never make up information that isn't in the excerpts or shared by the user."
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
        graph_context_service: GraphContextService | None = None,
    ):
        self.llm_provider = llm_provider
        self.vector_store = vector_store
        self.memory = memory
        self.guardrail = guardrail
        self.context_formatter = context_formatter
        self.graph_context_service = graph_context_service

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
        with tracer.start_as_current_span("storytelling.prepare_turn") as span:
            span.set_attribute("user_id", str(user_id))
            span.set_attribute("legacy_id", str(legacy_id))
            span.set_attribute("persona_id", persona_id)

            chunks: list[ChunkResult] = []
            story_context = ""

            if self.graph_context_service:
                # Graph-augmented path: delegate to GraphContextService
                try:
                    assembled = await self.graph_context_service.assemble_context(
                        query=user_query,
                        legacy_id=legacy_id,
                        user_id=user_id,
                        persona_type=persona_id,
                        db=db,
                        conversation_history=await self.memory.get_context_messages(
                            db=db,
                            conversation_id=conversation_id,
                        ),
                        legacy_name=legacy_name,
                    )
                    story_context = assembled.formatted_context
                    chunks = assembled.embedding_results
                    span.set_attribute("context_source", "graph_augmented")
                except Exception as exc:
                    logger.warning(
                        "ai.chat.graph_context_failed",
                        extra={
                            "conversation_id": str(conversation_id),
                            "error": str(exc),
                        },
                    )
                    # Fall through to embedding-only retrieval below

            if not story_context:
                # Embedding-only path (default or graph fallback)
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
                span.set_attribute("context_source", "embedding_only")

            # Fetch legacy facts for system prompt injection
            facts = []
            try:
                facts = await memory_service.get_facts_for_context(
                    db=db, legacy_id=legacy_id, user_id=user_id
                )
            except Exception as exc:
                logger.warning(
                    "ai.chat.facts_retrieval_failed",
                    extra={
                        "conversation_id": str(conversation_id),
                        "error": str(exc),
                    },
                )

            span.set_attribute("chunks_retrieved", len(chunks))
            span.set_attribute("facts_retrieved", len(facts))

            # Check if this conversation is linked to an active evolution session
            from ..models.story import Story
            from ..models.story_evolution import StoryEvolutionSession

            elicitation_mode = False
            original_story_text: str | None = None

            evo_result = await db.execute(
                select(StoryEvolutionSession).where(
                    StoryEvolutionSession.conversation_id == conversation_id,
                    StoryEvolutionSession.phase == "elicitation",
                )
            )
            evo_session = evo_result.scalar_one_or_none()
            if evo_session:
                elicitation_mode = True
                story_result = await db.execute(
                    select(Story).where(Story.id == evo_session.story_id)
                )
                story = story_result.scalar_one_or_none()
                if story:
                    original_story_text = story.content

            system_prompt = build_system_prompt(
                persona_id,
                legacy_name,
                story_context,
                facts=facts,
                elicitation_mode=elicitation_mode,
                original_story_text=original_story_text,
                include_graph_suggestions=(elicitation_mode and bool(story_context)),
            )
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
        with tracer.start_as_current_span("storytelling.stream_response") as span:
            span.set_attribute("ai.model", model_id)
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
