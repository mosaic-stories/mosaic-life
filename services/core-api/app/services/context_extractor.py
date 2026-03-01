# services/core-api/app/services/context_extractor.py
"""Service for extracting structured context from stories and conversations."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.ai import LLMProvider
from app.models.story_context import ContextFact, StoryContext

logger = logging.getLogger(__name__)

SEED_EXTRACTION_PROMPT = """You are extracting structured facts from a memorial story.

Given the story text below, extract:
1. A 2-3 sentence narrative summary
2. Individual facts organized by category

Categories:
- person: Named people mentioned
- place: Locations, addresses, geographic references
- date: Dates, time periods, seasons, years
- event: Specific events, occasions, milestones
- emotion: Feelings, moods, emotional themes
- relationship: How people relate to each other (e.g., "grandmother of John")
- object: Significant objects, heirlooms, items

Return ONLY valid JSON in this exact format:
{
  "summary": "2-3 sentence narrative brief",
  "facts": [
    {"category": "person", "content": "short label", "detail": "optional elaboration"},
    {"category": "place", "content": "Portland, OR", "detail": "where John grew up"}
  ]
}

Story text:
"""

CONVERSATION_EXTRACTION_PROMPT = """You are extracting NEW facts learned from a memorial story conversation.

Given the conversation exchange below and facts already known, extract ONLY new information not already captured.

Known facts:
{known_facts}

Latest conversation exchange:
User: {user_message}
Assistant: {assistant_message}

Return ONLY valid JSON:
{{
  "updated_summary": "revised 2-3 sentence brief incorporating any new information, or null if no update needed",
  "new_facts": [
    {{"category": "person|place|date|event|emotion|relationship|object", "content": "short label", "detail": "optional elaboration"}}
  ]
}}

If nothing new was learned, return: {{"updated_summary": null, "new_facts": []}}
"""

VALID_CATEGORIES = {
    "person",
    "place",
    "date",
    "event",
    "emotion",
    "relationship",
    "object",
}


class ContextExtractor:
    """Extracts structured facts from story text and conversations using LLM."""

    def __init__(self, llm_provider: LLMProvider, model_id: str) -> None:
        self._llm = llm_provider
        self._model_id = model_id

    async def extract_from_story(
        self,
        db: AsyncSession,
        story_id: UUID,
        user_id: UUID,
        story_content: str,
    ) -> StoryContext:
        """Extract facts from story text and persist to database.

        Creates or updates the StoryContext for this story+user.
        """
        # Get or create StoryContext
        ctx = await self._get_or_create_context(db, story_id, user_id)

        # Mark as extracting
        ctx.extracting = True
        await db.commit()

        try:
            # Call LLM for extraction
            prompt = SEED_EXTRACTION_PROMPT + story_content[:8000]
            result = await self._call_llm(prompt)

            if result is None:
                ctx.extracting = False
                await db.commit()
                return ctx

            # Parse and persist
            summary = result.get("summary")
            facts_data = result.get("facts", [])

            if summary:
                ctx.summary = summary
                ctx.summary_updated_at = func.current_timestamp()

            for fact_data in facts_data:
                category = fact_data.get("category", "").lower()
                content = fact_data.get("content", "").strip()
                if not content or category not in VALID_CATEGORIES:
                    continue
                detail = fact_data.get("detail")

                # Deduplicate by category + content
                existing = await self._find_existing_fact(db, ctx.id, category, content)
                if existing:
                    if detail and (
                        not existing.detail or len(detail) > len(existing.detail)
                    ):
                        existing.detail = detail
                else:
                    fact = ContextFact(
                        story_context_id=ctx.id,
                        category=category,
                        content=content,
                        detail=detail,
                        source="story",
                        status="active",
                    )
                    db.add(fact)

            ctx.extracting = False
            ctx.updated_at = func.current_timestamp()
            await db.commit()
            await db.refresh(ctx)
            return ctx

        except Exception:
            logger.exception("context_extractor.story.failed")
            ctx.extracting = False
            await db.commit()
            return ctx

    async def extract_from_conversation(
        self,
        db: AsyncSession,
        story_id: UUID,
        user_id: UUID,
        user_message: str,
        assistant_message: str,
        message_id: UUID | None = None,
    ) -> StoryContext | None:
        """Extract new facts from a conversation exchange.

        Called as a background task after each assistant message.
        """
        ctx = await self._get_or_create_context(db, story_id, user_id)

        try:
            # Build known facts summary
            existing_facts = await db.execute(
                select(ContextFact)
                .where(ContextFact.story_context_id == ctx.id)
                .where(ContextFact.status != "dismissed")
            )
            known = existing_facts.scalars().all()
            known_facts_str = json.dumps(
                [
                    {"category": f.category, "content": f.content, "detail": f.detail}
                    for f in known
                ],
                indent=2,
            )

            prompt = CONVERSATION_EXTRACTION_PROMPT.format(
                known_facts=known_facts_str,
                user_message=user_message,
                assistant_message=assistant_message,
            )
            result = await self._call_llm(prompt)

            if result is None:
                return ctx

            # Update summary if provided
            updated_summary = result.get("updated_summary")
            if updated_summary:
                ctx.summary = updated_summary
                ctx.summary_updated_at = func.current_timestamp()

            # Add new facts
            new_facts = result.get("new_facts", [])
            for fact_data in new_facts:
                category = fact_data.get("category", "").lower()
                content = fact_data.get("content", "").strip()
                if not content or category not in VALID_CATEGORIES:
                    continue
                detail = fact_data.get("detail")

                existing = await self._find_existing_fact(db, ctx.id, category, content)
                if existing:
                    if detail and (
                        not existing.detail or len(detail) > len(existing.detail)
                    ):
                        existing.detail = detail
                else:
                    fact = ContextFact(
                        story_context_id=ctx.id,
                        category=category,
                        content=content,
                        detail=detail,
                        source="conversation",
                        source_message_id=message_id,
                        status="active",
                    )
                    db.add(fact)

            ctx.updated_at = func.current_timestamp()
            await db.commit()
            await db.refresh(ctx)
            return ctx

        except Exception:
            logger.exception("context_extractor.conversation.failed")
            return ctx

    async def _get_or_create_context(
        self, db: AsyncSession, story_id: UUID, user_id: UUID
    ) -> StoryContext:
        """Get existing StoryContext or create a new one."""
        result = await db.execute(
            select(StoryContext).where(
                StoryContext.story_id == story_id,
                StoryContext.user_id == user_id,
            )
        )
        ctx = result.scalar_one_or_none()
        if ctx:
            return ctx

        ctx = StoryContext(story_id=story_id, user_id=user_id)
        db.add(ctx)
        await db.flush()
        return ctx

    async def _find_existing_fact(
        self,
        db: AsyncSession,
        context_id: UUID,
        category: str,
        content: str,
    ) -> ContextFact | None:
        """Find an existing fact by category and content (case-insensitive)."""
        result = await db.execute(
            select(ContextFact).where(
                ContextFact.story_context_id == context_id,
                ContextFact.category == category,
                func.lower(ContextFact.content) == content.lower(),
            )
        )
        return result.scalar_one_or_none()

    async def _call_llm(self, prompt: str) -> dict[str, Any] | None:
        """Call LLM and parse JSON response."""
        full_text = ""
        try:
            async for chunk in self._llm.stream_generate(
                messages=[{"role": "user", "content": prompt}],
                system_prompt="You are a precise fact extraction assistant. Return only valid JSON.",
                model_id=self._model_id,
                max_tokens=2048,
            ):
                full_text += chunk

            # Strip markdown code fences if present
            text = full_text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            if text.startswith("json"):
                text = text[4:].strip()

            parsed: dict[str, Any] = json.loads(text)
            return parsed
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning(
                "context_extractor.llm.parse_failed",
                extra={"error": str(exc), "raw_text": full_text[:500]},
            )
            return None
