#!/usr/bin/env python
"""Backfill entity extraction for existing stories.

Usage:
    cd services/core-api
    uv run python scripts/backfill_entities.py

Options:
    --dry-run    Show what would be processed without extracting
    --limit N    Only process N stories (for testing)
"""

import argparse
import asyncio
import logging
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

sys.path.insert(0, ".")

from app.config import get_settings
from app.models.story import Story

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def backfill_entities(
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    """Extract entities from all existing stories and sync to graph."""
    settings = get_settings()

    if not settings.db_url:
        logger.error("DB_URL not configured")
        sys.exit(1)

    if not settings.graph_augmentation_enabled:
        logger.error("GRAPH_AUGMENTATION_ENABLED is false")
        sys.exit(1)

    db_url = settings.db_url
    if "postgresql+psycopg://" in db_url:
        db_url = db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://")
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif "postgresql+asyncpg://" not in db_url:
        logger.error(f"Unsupported DB_URL format: {db_url}")
        sys.exit(1)

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    # Get graph adapter and LLM provider
    from app.providers.registry import get_provider_registry

    registry = get_provider_registry()
    graph_adapter = registry.get_graph_adapter()
    if not graph_adapter:
        logger.error("Graph adapter not available")
        sys.exit(1)

    llm_provider = registry.get_llm_provider()

    from app.services.entity_extraction import EntityExtractionService

    extraction_service = EntityExtractionService(
        llm_provider=llm_provider,
        model_id=settings.entity_extraction_model_id,
    )

    async with async_session() as db:
        query = (
            select(Story)
            .options(selectinload(Story.legacy_associations))
            .order_by(Story.created_at)
        )
        if limit:
            query = query.limit(limit)

        result = await db.execute(query)
        stories = result.scalars().all()
        total = len(stories)

        logger.info(f"Found {total} stories to process")

        if dry_run:
            for story in stories:
                title = (
                    story.title[:50] + "..." if len(story.title) > 50 else story.title
                )
                logger.info(
                    f"[DRY RUN] Would extract entities from: {story.id} - {title}"
                )
            return

        success = 0
        failed = 0

        for i, story in enumerate(stories, 1):
            try:
                title = (
                    story.title[:50] + "..." if len(story.title) > 50 else story.title
                )
                logger.info(f"[{i}/{total}] Extracting: {story.id} - {title}")

                entities = await extraction_service.extract_entities(story.content)
                filtered = entities.filter_by_confidence(0.7)

                primary = next(
                    (a for a in story.legacy_associations if a.role == "primary"),
                    (
                        story.legacy_associations[0]
                        if story.legacy_associations
                        else None
                    ),
                )
                if not primary:
                    logger.warning("  No legacy association, skipping")
                    continue

                from app.services.ingestion import _sync_entities_to_graph

                await _sync_entities_to_graph(
                    graph_adapter, story.id, primary.legacy_id, filtered
                )

                entity_count = (
                    len(filtered.people)
                    + len(filtered.places)
                    + len(filtered.events)
                    + len(filtered.objects)
                )
                logger.info(f"  Extracted {entity_count} entities")
                success += 1

                # Rate limiting: 0.5s between stories to avoid Bedrock throttling
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"  Failed: {e}")
                failed += 1
                continue

        logger.info(f"Backfill complete: {success} succeeded, {failed} failed")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill entity extraction")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    asyncio.run(backfill_entities(dry_run=args.dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
