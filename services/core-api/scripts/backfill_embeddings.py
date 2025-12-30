#!/usr/bin/env python
"""Backfill script to index existing stories into vector store.

Usage:
    cd services/core-api
    uv run python scripts/backfill_embeddings.py

Options:
    --dry-run    Show what would be indexed without actually indexing
    --limit N    Only process N stories (for testing)
"""

import argparse
import asyncio
import logging
import sys
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

# Add app to path
sys.path.insert(0, ".")

from app.config import get_settings
from app.models.knowledge import StoryChunk
from app.models.story import Story
from app.services.ingestion import index_story_chunks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def get_stories_without_chunks(
    db: AsyncSession,
    limit: int | None = None,
) -> list[tuple[Story, UUID]]:
    """Get stories that don't have any chunks yet.

    Returns:
        List of (story, primary_legacy_id) tuples.
    """
    # Subquery to find stories with chunks
    stories_with_chunks = select(StoryChunk.story_id).distinct()

    # Query stories without chunks
    query = (
        select(Story)
        .options(selectinload(Story.legacy_associations))
        .where(Story.id.notin_(stories_with_chunks))
        .order_by(Story.created_at)
    )

    if limit:
        query = query.limit(limit)

    result = await db.execute(query)
    stories = result.scalars().all()

    # Extract primary legacy for each story
    stories_with_legacy: list[tuple[Story, UUID]] = []
    for story in stories:
        primary_assoc = next(
            (a for a in story.legacy_associations if a.role == "primary"),
            story.legacy_associations[0] if story.legacy_associations else None,
        )
        if primary_assoc:
            stories_with_legacy.append((story, primary_assoc.legacy_id))
        else:
            logger.warning(f"Story {story.id} has no legacy associations, skipping")

    return stories_with_legacy


async def backfill_stories(
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    """Backfill embeddings for existing stories."""
    settings = get_settings()

    if not settings.db_url:
        logger.error("DB_URL not configured")
        sys.exit(1)

    # Convert to async driver
    db_url = settings.db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://")

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        stories = await get_stories_without_chunks(db, limit)
        total = len(stories)

        logger.info(f"Found {total} stories without embeddings")

        if dry_run:
            for story, legacy_id in stories:
                title_preview = (
                    story.title[:50] + "..." if len(story.title) > 50 else story.title
                )
                logger.info(f"[DRY RUN] Would index: {story.id} - {title_preview}")
            return

        success = 0
        failed = 0

        for i, (story, legacy_id) in enumerate(stories, 1):
            try:
                title_preview = (
                    story.title[:50] + "..." if len(story.title) > 50 else story.title
                )
                logger.info(f"[{i}/{total}] Indexing: {story.id} - {title_preview}")

                chunk_count = await index_story_chunks(
                    db=db,
                    story_id=story.id,
                    content=story.content,
                    legacy_id=legacy_id,
                    visibility=story.visibility,
                    author_id=story.author_id,
                    user_id=story.author_id,
                )

                logger.info(f"  Created {chunk_count} chunks")
                success += 1

            except Exception as e:
                logger.error(f"  Failed: {e}")
                failed += 1
                continue

        logger.info(f"Backfill complete: {success} succeeded, {failed} failed")

    await engine.dispose()


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Backfill story embeddings")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be indexed without indexing",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of stories to process",
    )

    args = parser.parse_args()

    asyncio.run(backfill_stories(dry_run=args.dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
