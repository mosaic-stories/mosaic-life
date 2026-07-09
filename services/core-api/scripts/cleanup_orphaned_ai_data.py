#!/usr/bin/env python
"""One-time cleanup of orphaned AI conversations and empty untitled drafts.

Removes data left behind by the pre-story-lifecycle-split flows: AI
conversations that were created but never used (zero messages), and draft
stories that were auto-titled "Untitled Story - {date}" (or left blank) and
never got any content written into them. Idempotent — re-running finds
nothing left to remove once a prior run has cleaned up.

Usage:
    cd services/core-api
    uv run python scripts/cleanup_orphaned_ai_data.py --dry-run
    uv run python scripts/cleanup_orphaned_ai_data.py

Options:
    --dry-run          Report counts without deleting anything
    --min-age-days N   Only remove records older than N days (default: 7)
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, ".")

from app.config import get_settings
from app.database import normalize_async_db_url
from app.models.ai import AIConversation, AIMessage
from app.models.story import Story
from app.models.story_evolution import StoryEvolutionSession

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

DEFAULT_MIN_AGE_DAYS = 7


def _orphaned_conversation_ids_query(cutoff: datetime):
    """Conversations with zero messages, unreferenced by any session or story."""
    has_message = exists().where(AIMessage.conversation_id == AIConversation.id)
    has_session = exists().where(
        StoryEvolutionSession.conversation_id == AIConversation.id
    )
    has_evolved_story = exists().where(
        Story.source_conversation_id == AIConversation.id
    )
    return select(AIConversation.id).where(
        AIConversation.created_at < cutoff,
        ~has_message,
        ~has_session,
        ~has_evolved_story,
    )


def _orphaned_draft_ids_query(cutoff: datetime):
    """Draft stories with no content and no title (or a leaked placeholder title)."""
    return select(Story.id).where(
        Story.status == "draft",
        Story.created_at < cutoff,
        func.trim(Story.content) == "",
        or_(
            func.trim(Story.title) == "",
            Story.title.like("Untitled Story%"),
        ),
    )


async def cleanup_orphaned_ai_data(dry_run: bool, min_age_days: int) -> None:
    """Delete zero-message AI conversations and empty untitled draft stories."""
    settings = get_settings()

    if not settings.db_url:
        logger.error("DB_URL not configured")
        sys.exit(1)

    try:
        db_url = normalize_async_db_url(settings.db_url)
    except ValueError:
        logger.error(f"Unsupported DB_URL format: {settings.db_url}")
        sys.exit(1)

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    cutoff = datetime.now(timezone.utc) - timedelta(days=min_age_days)

    async with async_session() as db:
        conversation_ids = list(
            (await db.execute(_orphaned_conversation_ids_query(cutoff))).scalars()
        )
        draft_ids = list(
            (await db.execute(_orphaned_draft_ids_query(cutoff))).scalars()
        )

        logger.info(
            f"Found {len(conversation_ids)} zero-message conversation(s) and "
            f"{len(draft_ids)} empty untitled draft(s) older than {min_age_days} day(s)"
        )

        if dry_run:
            for conversation_id in conversation_ids:
                logger.info(f"[DRY RUN] would delete conversation {conversation_id}")
            for story_id in draft_ids:
                logger.info(f"[DRY RUN] would delete draft story {story_id}")
            await engine.dispose()
            return

        if conversation_ids:
            await db.execute(
                delete(AIConversation).where(AIConversation.id.in_(conversation_ids))
            )
        if draft_ids:
            await db.execute(delete(Story).where(Story.id.in_(draft_ids)))
        await db.commit()

        logger.info(
            f"Cleanup complete: removed {len(conversation_ids)} conversation(s) and "
            f"{len(draft_ids)} draft story(ies)"
        )

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="One-time cleanup of orphaned AI conversations and empty untitled drafts"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--min-age-days", type=int, default=DEFAULT_MIN_AGE_DAYS)
    args = parser.parse_args()
    asyncio.run(
        cleanup_orphaned_ai_data(dry_run=args.dry_run, min_age_days=args.min_age_days)
    )


if __name__ == "__main__":
    main()
