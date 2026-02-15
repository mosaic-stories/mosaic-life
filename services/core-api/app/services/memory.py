"""Service layer for agent memory operations."""

import json as json_mod
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.memory import ConversationChunk, LegacyFact
from ..schemas.memory import SummarizeExtractResponse

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.memory")


async def get_facts_for_context(
    db: AsyncSession,
    legacy_id: UUID,
    user_id: UUID,
) -> list[LegacyFact]:
    """Get facts for system prompt injection.

    Returns the user's own private facts plus all shared facts
    from any user for this legacy.

    Args:
        db: Database session.
        legacy_id: Legacy to get facts for.
        user_id: Current user.

    Returns:
        List of LegacyFact objects.
    """
    with tracer.start_as_current_span("memory.get_facts_for_context") as span:
        span.set_attribute("legacy_id", str(legacy_id))
        span.set_attribute("user_id", str(user_id))

        result = await db.execute(
            select(LegacyFact)
            .where(
                LegacyFact.legacy_id == legacy_id,
                or_(
                    LegacyFact.user_id == user_id,
                    LegacyFact.visibility == "shared",
                ),
            )
            .order_by(LegacyFact.extracted_at)
        )
        facts = list(result.scalars().all())

        span.set_attribute("facts_count", len(facts))
        return facts


async def list_user_facts(
    db: AsyncSession,
    legacy_id: UUID,
    user_id: UUID,
) -> list[LegacyFact]:
    """List a user's own facts for a legacy (for the review UI).

    Args:
        db: Database session.
        legacy_id: Legacy to list facts for.
        user_id: User whose facts to list.

    Returns:
        List of the user's own LegacyFact objects.
    """
    result = await db.execute(
        select(LegacyFact)
        .where(
            LegacyFact.legacy_id == legacy_id,
            LegacyFact.user_id == user_id,
        )
        .order_by(LegacyFact.extracted_at)
    )
    return list(result.scalars().all())


async def delete_fact(
    db: AsyncSession,
    fact_id: UUID,
    user_id: UUID,
) -> None:
    """Delete a fact (ownership check enforced).

    Args:
        db: Database session.
        fact_id: Fact to delete.
        user_id: User requesting deletion.

    Raises:
        HTTPException: 404 if fact not found or not owned by user.
    """
    result = await db.execute(
        select(LegacyFact).where(
            LegacyFact.id == fact_id,
            LegacyFact.user_id == user_id,
        )
    )
    fact = result.scalar_one_or_none()

    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    await db.delete(fact)
    await db.commit()

    logger.info(
        "memory.fact.deleted",
        extra={"fact_id": str(fact_id), "user_id": str(user_id)},
    )


async def update_fact_visibility(
    db: AsyncSession,
    fact_id: UUID,
    user_id: UUID,
    visibility: str,
) -> LegacyFact:
    """Update fact visibility (ownership check enforced).

    Args:
        db: Database session.
        fact_id: Fact to update.
        user_id: User requesting the change.
        visibility: New visibility ('private' or 'shared').

    Returns:
        Updated LegacyFact.

    Raises:
        HTTPException: 404 if fact not found or not owned by user.
    """
    result = await db.execute(
        select(LegacyFact).where(
            LegacyFact.id == fact_id,
            LegacyFact.user_id == user_id,
        )
    )
    fact = result.scalar_one_or_none()

    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    fact.visibility = visibility
    fact.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(fact)

    logger.info(
        "memory.fact.visibility_updated",
        extra={
            "fact_id": str(fact_id),
            "user_id": str(user_id),
            "visibility": visibility,
        },
    )

    return fact


# --- Constants ---
SUMMARIZATION_THRESHOLD = 30
BATCH_SIZE = 20

# --- Prompt ---
SUMMARIZE_AND_EXTRACT_PROMPT = """You are analyzing a conversation between a user and a memorial agent about {legacy_name}.

Given the following conversation messages, produce:
1. A concise summary (2-4 sentences) capturing the key topics discussed and any emotional tone.
2. A list of factual observations about {legacy_name} mentioned by the user.

For each fact, provide:
- category: one of [personality, hobby, relationship, milestone, occupation, preference, habit, other]
- content: a short factual statement (one sentence)

Only extract facts the user explicitly stated or clearly implied. Do not infer or speculate.

Respond in JSON:
{{"summary": "...", "facts": [{{"category": "...", "content": "..."}}]}}"""


def parse_summary_response(raw: str) -> SummarizeExtractResponse | None:
    """Parse the LLM's JSON response for summary and facts.

    Returns None if the response is malformed.
    """
    try:
        data = json_mod.loads(raw)
    except (json_mod.JSONDecodeError, TypeError):
        logger.warning("memory.parse_summary.malformed_json")
        return None

    if "summary" not in data:
        logger.warning("memory.parse_summary.missing_summary")
        return None

    return SummarizeExtractResponse(
        summary=data["summary"],
        facts=data.get("facts", []),
    )


async def _call_summarize_llm(messages: list[dict[str, str]], legacy_name: str) -> str:
    """Call the LLM to summarize messages and extract facts.

    This is a thin wrapper to make mocking straightforward in tests.
    """
    from ..providers.registry import get_provider_registry

    with tracer.start_as_current_span("memory.summarize_llm") as span:
        span.set_attribute("input_message_count", len(messages))

        llm = get_provider_registry().get_llm_provider()
        prompt = SUMMARIZE_AND_EXTRACT_PROMPT.format(legacy_name=legacy_name)

        full_response = ""
        async for chunk in llm.stream_generate(
            messages=messages,
            system_prompt=prompt,
            model_id="",  # Use provider default
            max_tokens=1024,
        ):
            full_response += chunk

        return full_response


async def _embed_text(text: str) -> list[float]:
    """Embed a single text string. Thin wrapper for testability."""
    from ..providers.registry import get_provider_registry

    with tracer.start_as_current_span("memory.embed_summary") as span:
        span.set_attribute("text_length", len(text))

        embedding_provider = get_provider_registry().get_embedding_provider()
        [embedding] = await embedding_provider.embed_texts([text])
        return embedding


async def maybe_summarize(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
    legacy_id: UUID,
    legacy_name: str = "",
) -> None:
    """Check if summarization is needed and perform it.

    Called as a background task after each message save. Summarizes the
    oldest unsummarized batch of messages when the unsummarized count
    exceeds SUMMARIZATION_THRESHOLD.

    Args:
        db: Database session.
        conversation_id: Conversation to check.
        user_id: User who owns the conversation.
        legacy_id: Legacy being discussed.
        legacy_name: Legacy name for the LLM prompt.
    """
    from ..models.ai import AIMessage

    with tracer.start_as_current_span("memory.maybe_summarize") as span:
        span.set_attribute("conversation_id", str(conversation_id))

        # Count total messages
        count_result = await db.execute(
            select(func.count())
            .select_from(AIMessage)
            .where(AIMessage.conversation_id == conversation_id)
        )
        total_messages = count_result.scalar() or 0

        # Find last summarized range end
        last_range_result = await db.execute(
            select(
                func.coalesce(func.max(ConversationChunk.message_range_end), 0)
            ).where(ConversationChunk.conversation_id == conversation_id)
        )
        last_summarized_end = last_range_result.scalar() or 0

        unsummarized_count = total_messages - last_summarized_end
        span.set_attribute("unsummarized_count", unsummarized_count)

        if unsummarized_count <= SUMMARIZATION_THRESHOLD:
            return

        # Fetch oldest unsummarized batch
        result = await db.execute(
            select(AIMessage)
            .where(
                AIMessage.conversation_id == conversation_id,
                ~AIMessage.blocked,
            )
            .order_by(AIMessage.created_at.asc())
            .offset(last_summarized_end)
            .limit(BATCH_SIZE)
        )
        messages_to_summarize = result.scalars().all()

        if not messages_to_summarize:
            return

        message_dicts = [
            {"role": m.role, "content": m.content}
            for m in messages_to_summarize
            if m.content and m.content.strip()
        ]

        # Call LLM for summary + fact extraction
        try:
            raw_response = await _call_summarize_llm(message_dicts, legacy_name)
        except Exception:
            logger.exception(
                "memory.summarize.llm_failed",
                extra={"conversation_id": str(conversation_id)},
            )
            return

        parsed = parse_summary_response(raw_response)
        if not parsed:
            return

        # Embed the summary
        try:
            embedding = await _embed_text(parsed.summary)
        except Exception:
            logger.exception(
                "memory.summarize.embedding_failed",
                extra={"conversation_id": str(conversation_id)},
            )
            return

        range_end = last_summarized_end + BATCH_SIZE

        # Store conversation chunk (unique constraint prevents duplicates)
        chunk = ConversationChunk(
            conversation_id=conversation_id,
            user_id=user_id,
            legacy_id=legacy_id,
            content=parsed.summary,
            embedding=embedding,
            message_range_start=last_summarized_end,
            message_range_end=range_end,
        )
        db.add(chunk)

        # Store extracted facts
        for fact_data in parsed.facts:
            category = fact_data.get("category", "other")
            content = fact_data.get("content", "")
            if content:
                fact = LegacyFact(
                    legacy_id=legacy_id,
                    user_id=user_id,
                    category=category,
                    content=content,
                    source_conversation_id=conversation_id,
                )
                db.add(fact)

        await db.commit()

        logger.info(
            "memory.summarize.complete",
            extra={
                "conversation_id": str(conversation_id),
                "range": f"{last_summarized_end}-{range_end}",
                "facts_extracted": len(parsed.facts),
            },
        )
