"""Service layer for agent memory operations."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.memory import LegacyFact

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
