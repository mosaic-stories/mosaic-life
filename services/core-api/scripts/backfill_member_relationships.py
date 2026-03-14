#!/usr/bin/env python
"""Backfill graph edges from existing member relationship profiles.

Usage:
    cd services/core-api
    uv run python scripts/backfill_member_relationships.py

Options:
    --dry-run    Show what would be processed without writing to graph
    --limit N    Only process N members (for testing)
"""

import argparse
import asyncio
import logging
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, ".")

from app.config import get_settings
from app.database import normalize_async_db_url
from app.models.legacy import LegacyMember
from app.services.graph_sync import categorize_relationship

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def backfill_member_relationships(
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    """Sync declared member relationships to the graph database."""
    settings = get_settings()

    if not settings.db_url:
        logger.error("DB_URL not configured")
        sys.exit(1)

    if not settings.graph_augmentation_enabled:
        logger.error("GRAPH_AUGMENTATION_ENABLED is false")
        sys.exit(1)

    try:
        db_url = normalize_async_db_url(settings.db_url)
    except ValueError:
        logger.error(f"Unsupported DB_URL format: {settings.db_url}")
        sys.exit(1)

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    from app.providers.registry import get_provider_registry

    registry = get_provider_registry()
    graph_adapter = registry.get_graph_adapter()
    if not graph_adapter:
        logger.error("Graph adapter not available")
        sys.exit(1)

    async with async_session() as db:
        query = (
            select(LegacyMember)
            .where(LegacyMember.role != "pending")
            .where(LegacyMember.profile.isnot(None))
        )
        if limit:
            query = query.limit(limit)

        result = await db.execute(query)
        members = result.scalars().all()
        total = len(members)

        logger.info(f"Found {total} members with profiles to process")

        if dry_run:
            for m in members:
                rt = (m.profile or {}).get("relationship_type", "none")
                logger.info(
                    f"[DRY RUN] user={m.user_id} legacy={m.legacy_id} "
                    f"relationship_type={rt} -> {categorize_relationship(rt)}"
                )
            return

        success = 0
        failed = 0

        for i, member in enumerate(members, 1):
            try:
                profile = member.profile or {}
                relationship_type = profile.get("relationship_type")
                if not relationship_type:
                    logger.info(f"[{i}/{total}] Skipping — no relationship_type")
                    continue

                user_node_id = f"user-{member.user_id}"
                legacy_node_id = str(member.legacy_id)
                edge_label = categorize_relationship(relationship_type)

                logger.info(
                    f"[{i}/{total}] user={member.user_id} "
                    f"legacy={member.legacy_id} "
                    f"{relationship_type} -> {edge_label}"
                )

                await graph_adapter.upsert_node(
                    "Person", user_node_id,
                    {"user_id": str(member.user_id), "is_user": "true", "source": "declared"},
                )
                await graph_adapter.upsert_node(
                    "Person", legacy_node_id,
                    {"legacy_id": str(member.legacy_id), "is_legacy": "true", "source": "declared"},
                )
                await graph_adapter.create_relationship(
                    "Person", user_node_id, edge_label, "Person", legacy_node_id,
                    properties={
                        "relationship_type": relationship_type,
                        "source": "declared",
                    },
                )

                success += 1
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"  Failed: {e}")
                failed += 1
                continue

        logger.info(f"Backfill complete: {success} succeeded, {failed} failed")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill member relationships to graph")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    asyncio.run(backfill_member_relationships(dry_run=args.dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
