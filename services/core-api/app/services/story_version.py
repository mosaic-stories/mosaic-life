"""Service layer for story version operations."""

import logging
import time
from typing import cast
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException
from opentelemetry import trace
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db_for_background
from ..models.associations import StoryLegacy
from ..models.story import Story
from ..models.story_version import StoryVersion
from ..observability.metrics import STORY_VERSION_MINTS
from ..schemas.story_version import (
    StoryVersionDetail,
    StoryVersionListResponse,
    StoryVersionSummary,
)
from .change_summary import fallback_summary, generate_change_summary
from .ingestion import index_story_chunks

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.story_version")


async def get_next_version_number(db: AsyncSession, story_id: UUID) -> int:
    """Get the next version number for a story.

    Returns MAX(version_number) + 1, or 1 if no versions exist.
    """
    result = await db.execute(
        select(func.max(StoryVersion.version_number)).where(
            StoryVersion.story_id == story_id
        )
    )
    max_version = result.scalar_one_or_none()
    return (max_version or 0) + 1


async def get_active_version(db: AsyncSession, story_id: UUID) -> StoryVersion | None:
    """Get the active version for a story, or None."""
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def get_draft_version(db: AsyncSession, story_id: UUID) -> StoryVersion | None:
    """Get the draft version for a story, or None."""
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.status == "draft",
        )
    )
    return result.scalar_one_or_none()


async def list_versions(
    db: AsyncSession,
    story_id: UUID,
    page: int = 1,
    page_size: int = 20,
    soft_cap: int | None = None,
) -> StoryVersionListResponse:
    """List all versions for a story, paginated, newest first.

    Args:
        db: Database session.
        story_id: Story ID.
        page: Page number (1-indexed).
        page_size: Items per page.
        soft_cap: Override for version soft cap (uses settings if None).

    Returns:
        Paginated version list with optional warning.
    """
    if soft_cap is None:
        soft_cap = get_settings().story_version_soft_cap

    # Count total versions
    count_result = await db.execute(
        select(func.count()).where(StoryVersion.story_id == story_id)
    )
    total = count_result.scalar_one()

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(
        select(StoryVersion)
        .where(StoryVersion.story_id == story_id)
        .order_by(StoryVersion.version_number.desc())
        .offset(offset)
        .limit(page_size)
    )
    versions = result.scalars().all()

    summaries = [StoryVersionSummary.model_validate(v) for v in versions]

    warning = None
    if total > soft_cap:
        warning = (
            f"This story has {total} versions. "
            f"Consider removing old versions you no longer need."
        )

    logger.info(
        "version.list",
        extra={
            "story_id": str(story_id),
            "total": total,
            "page": page,
        },
    )

    return StoryVersionListResponse(
        versions=summaries,
        total=total,
        page=page,
        page_size=page_size,
        warning=warning,
    )


async def get_version_detail(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
) -> StoryVersionDetail:
    """Get full detail for a specific version.

    Raises:
        HTTPException: 404 if version not found.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    version = result.scalar_one_or_none()

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return StoryVersionDetail.model_validate(version)


async def delete_version(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
) -> None:
    """Delete a version. Active versions cannot be deleted.

    Raises:
        HTTPException: 404 if not found, 409 if active.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    version = result.scalar_one_or_none()

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    if version.status == "active":
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the active version. Activate another version first.",
        )

    await db.delete(version)
    await db.flush()

    logger.info(
        "version.deleted",
        extra={
            "story_id": str(story_id),
            "version_number": version_number,
            "status": version.status,
        },
    )


async def bulk_delete_versions(
    db: AsyncSession,
    story_id: UUID,
    version_numbers: list[int],
) -> int:
    """Bulk delete versions. Rejects entire request if any version is active.

    Raises:
        HTTPException: 409 if any version is active, 404 if any not found.
    """
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number.in_(version_numbers),
        )
    )
    versions = result.scalars().all()

    found_numbers = {v.version_number for v in versions}
    missing = set(version_numbers) - found_numbers
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Versions not found: {sorted(missing)}",
        )

    active_versions = [v for v in versions if v.status == "active"]
    if active_versions:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete active versions. Activate another version first.",
        )

    for version in versions:
        await db.delete(version)
    await db.flush()

    logger.info(
        "version.bulk_deleted",
        extra={
            "story_id": str(story_id),
            "version_numbers": version_numbers,
            "count": len(versions),
        },
    )

    return len(versions)


async def restore_version(
    db: AsyncSession,
    story_id: UUID,
    version_number: int,
    user_id: UUID,
) -> StoryVersionDetail:
    """Restore an old version by creating a new active version with its content.

    This creates a new version (append-only history), deactivates the current
    active version, and updates the story's title/content.

    Raises:
        HTTPException: 404 if source version not found.
    """
    # Find the version to restore from
    result = await db.execute(
        select(StoryVersion).where(
            StoryVersion.story_id == story_id,
            StoryVersion.version_number == version_number,
        )
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Version not found")

    # Deactivate current active version
    current_active = await get_active_version(db, story_id)
    if current_active:
        current_active.status = "inactive"

    # Create new version from source content
    next_num = await get_next_version_number(db, story_id)
    new_version = StoryVersion(
        story_id=story_id,
        version_number=next_num,
        title=source.title,
        content=source.content,
        status="active",
        source="restoration",
        source_version=version_number,
        change_summary=f"Restored from version {version_number}",
        created_by=user_id,
    )
    db.add(new_version)
    await db.flush()

    # Update story to reflect restored content
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one()
    story.title = source.title
    story.content = source.content
    story.active_version_id = new_version.id

    await db.flush()

    logger.info(
        "version.restored",
        extra={
            "story_id": str(story_id),
            "source_version": version_number,
            "new_version": next_num,
        },
    )

    return StoryVersionDetail.model_validate(new_version)


async def approve_draft(
    db: AsyncSession,
    story_id: UUID,
) -> StoryVersionDetail:
    """Approve the current draft, promoting it to active.

    Deactivates the current active version, promotes draft, and updates
    the story's title/content.

    Raises:
        HTTPException: 404 if no draft exists.
    """
    draft = await get_draft_version(db, story_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft found")

    # Deactivate current active
    current_active = await get_active_version(db, story_id)
    if current_active:
        current_active.status = "inactive"

    # Promote draft
    draft.status = "active"
    draft.stale = False

    # Update story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one()
    story.title = draft.title
    story.content = draft.content
    story.active_version_id = draft.id

    await db.flush()

    logger.info(
        "version.draft_approved",
        extra={
            "story_id": str(story_id),
            "version_number": draft.version_number,
        },
    )

    return StoryVersionDetail.model_validate(draft)


async def discard_draft(
    db: AsyncSession,
    story_id: UUID,
) -> None:
    """Discard (hard-delete) the current draft.

    Raises:
        HTTPException: 404 if no draft exists.
    """
    draft = await get_draft_version(db, story_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft found")

    await db.delete(draft)
    await db.flush()

    logger.info(
        "version.draft_discarded",
        extra={
            "story_id": str(story_id),
            "version_number": draft.version_number,
        },
    )


async def create_version(
    db: AsyncSession,
    story: Story,
    title: str,
    content: str,
    source: str,
    user_id: UUID,
    change_summary: str | None = None,
    source_version: int | None = None,
) -> StoryVersion:
    """Create a new active version for a story.

    Handles: deactivating previous active, marking draft stale,
    updating story fields, and setting active_version_id.
    """
    # Deactivate current active version
    current_active = await get_active_version(db, story.id)
    if current_active:
        current_active.status = "inactive"

    # Mark any existing draft as stale
    draft = await get_draft_version(db, story.id)
    if draft:
        draft.stale = True

    # Create new version
    next_num = await get_next_version_number(db, story.id)
    version = StoryVersion(
        story_id=story.id,
        version_number=next_num,
        title=title,
        content=content,
        status="active",
        source=source,
        source_version=source_version,
        change_summary=change_summary,
        created_by=user_id,
    )
    db.add(version)
    await db.flush()

    # Update story fields
    story.title = title
    story.content = content
    story.active_version_id = version.id

    await db.flush()

    logger.info(
        "version.created",
        extra={
            "story_id": str(story.id),
            "version_number": next_num,
            "source": source,
        },
    )

    return version


# `reason` (why a version was minted -- observability only, never persisted)
# and `source` (what produced the content -- persisted, user-visible via
# apps/web's getSourceLabel, and the collapse migration's run-detection key)
# are different fields and must not be conflated (design.md Decision 3,
# clarified 2026-08-14). This maps every boundary reason to the existing
# `source` vocabulary so FALLBACK_SUMMARIES lookups, history labels, and the
# collapse migration all keep working unchanged.
_BOUNDARY_REASON_TO_SOURCE: dict[str, str] = {
    "session_close": "manual_edit",
    "session_idle": "manual_edit",
    "session_max_interval": "manual_edit",
    "publish": "manual_edit",
    "evolve_entry": "manual_edit",
    "ai_rewrite_applied": "ai_enhancement",
    "restore": "restoration",
}


def _source_for_reason(reason: str) -> str:
    """Map a boundary `reason` to the `source` value persisted on the version.

    Raises `ValueError` on an unrecognized reason rather than silently
    persisting the raw (possibly typo'd) reason string to the database.
    """
    try:
        return _BOUNDARY_REASON_TO_SOURCE[reason]
    except KeyError:
        raise ValueError(f"Unknown story version boundary reason: {reason!r}") from None


async def _get_primary_legacy_id(db: AsyncSession, story_id: UUID) -> UUID | None:
    """Resolve the primary legacy for a story, or None if it has none.

    Queried directly (rather than relying on ``story.legacy_associations``
    being eager-loaded) so the boundary helper works regardless of how the
    caller loaded ``story``, without risking a lazy-load on a detached/async
    session.
    """
    result = await db.execute(
        select(StoryLegacy).where(StoryLegacy.story_id == story_id)
    )
    associations = result.scalars().all()
    if not associations:
        return None
    primary = next(
        (assoc for assoc in associations if assoc.role == "primary"),
        associations[0],
    )
    return primary.legacy_id


async def mint_version_at_boundary(
    db: AsyncSession,
    story: Story,
    *,
    reason: str,
    user_id: UUID,
    background_tasks: BackgroundTasks,
    source_version: int | None = None,
) -> StoryVersion:
    """Mint a story version at an editing-session boundary.

    This is the single entry point every boundary (publish, evolve_entry,
    ai_rewrite_applied, restore, session_close, session_idle,
    session_max_interval) routes through (design.md Decision 3). It:

    1. Captures the *current* active version's content as the diff base for
       the eventual generated change summary -- the state as of the
       *previous* boundary, not a snapshot from moments earlier. Empty
       string if the story has no active version yet.
    2. Creates the version via `create_version()` with a deterministic
       fallback `change_summary` so the column is never null, even if the
       background upgrade in (5) never lands.
    3. Clears `story.pending_edit_since` -- the session's edits are now
       captured.
    4. Emits the `story.version.mint` span and `story.version.minted` log.
    5. Schedules two post-commit background tasks: a change-summary
       upgrade and a search re-index.

    Does **not** commit -- callers own the commit (this repo's established
    convention; see commit c1cb24c). `create_version()` already flushes, so
    `story.id` / the new version's `id` are available immediately.

    `reason` and `source` are deliberately different fields (design.md
    Decision 3, clarified 2026-08-14): `reason` says *why* a version was
    minted now and is observability-only (span attribute, metric label, log
    field) -- it is never persisted. `source` says *what produced the
    content*, keeps its existing pre-boundary vocabulary
    (`manual_edit`/`ai_enhancement`/`ai_interview`/`restoration`), and is
    what actually lands in `story_versions.source` -- it is user-visible via
    apps/web's `getSourceLabel`, and the collapse migration's run detection
    keys on `source='manual_edit'`. This helper maps `reason` to `source`
    via `_BOUNDARY_REASON_TO_SOURCE` and raises `ValueError` on an
    unrecognized `reason` rather than ever persisting a typo'd value.

    Args:
        db: The request's session. Used only for reads/writes that must
            land in the same transaction as the caller's other changes;
            the two background tasks open their own sessions.
        story: The story to mint a version for. Must already be attached
            to `db` (e.g. loaded via `require_story_write_access`).
        reason: Boundary reason -- observability only. One of: `publish`,
            `evolve_entry`, `ai_rewrite_applied`, `restore`,
            `session_close`, `session_idle`, `session_max_interval`.
        user_id: The user attributed with creating the version.
        background_tasks: The request's `BackgroundTasks`, used to schedule
            the post-commit work.
        source_version: For `reason="restore"`, the version number being
            restored from -- threaded through to `create_version()` and to
            the fallback/generated change summary so it reads "Restored
            from version N". Unused for every other reason.

    Returns:
        The newly created, still-flushed-but-uncommitted `StoryVersion`.
    """
    source = _source_for_reason(reason)

    with tracer.start_as_current_span("story.version.mint") as span:
        # (1) Diff base: the state as of the previous boundary.
        previous_active = await get_active_version(db, story.id)
        base_content = previous_active.content if previous_active else ""

        # (2) Deterministic fallback, computed once and reused both as the
        # value written now and as the CAS guard for the background upgrade.
        fallback_text = fallback_summary(source, source_version)

        version = await create_version(
            db=db,
            story=story,
            title=story.title,
            content=story.content,
            source=source,
            user_id=user_id,
            change_summary=fallback_text,
            source_version=source_version,
        )

        # (3) Session captured.
        story.pending_edit_since = None

        # Resolve the primary legacy now, while `db` is still open, so the
        # reindex closure below only ever needs a plain UUID.
        primary_legacy_id = await _get_primary_legacy_id(db, story.id)

        # --- Plain-value snapshot for the background closures. ---
        # By the time these tasks run, the request has already responded and
        # the session that loaded `story`/`version` is closed -- the ORM
        # instances are detached/expired. Capturing them (instead of these
        # plain values) would raise MissingGreenlet/DetachedInstanceError the
        # first time a background task touched an unloaded attribute, which
        # tests using mocked sessions would not catch.
        story_id = story.id
        version_id = version.id
        version_number = version.version_number
        new_title = story.title
        new_content = story.content
        visibility = story.visibility
        author_id = story.author_id

        span.set_attribute("story_id", str(story_id))
        span.set_attribute("version_number", version_number)
        span.set_attribute("boundary_reason", reason)

        STORY_VERSION_MINTS.labels(reason=reason).inc()

        logger.info(
            "story.version.minted",
            extra={
                "story_id": str(story_id),
                "version_number": version_number,
                "reason": reason,
                "user_id": str(user_id),
            },
        )

        async def upgrade_change_summary() -> None:
            """Post-commit: upgrade the fallback summary to a generated one.

            Never raises -- any failure is logged and swallowed so it can
            never surface to the user (there is no request left to surface
            it to). The DB write only ever happens if `change_summary` is
            still exactly `fallback_text`, so a slow/failed generation can
            never clobber a summary another writer (e.g. a restoration)
            already put there in the meantime.
            """
            started = time.perf_counter()
            try:
                generated = await generate_change_summary(
                    old_content=base_content,
                    new_content=new_content,
                    user_id=user_id,
                    story_id=story_id,
                    version_id=version_id,
                    source=source,
                    source_version=source_version,
                )
                latency_ms = (time.perf_counter() - started) * 1000

                if generated == fallback_text:
                    # generate_change_summary() itself fell back internally
                    # (timeout, concurrency limit, provider error, or empty
                    # output) -- nothing new to write.
                    logger.info(
                        "story.change_summary.fallback",
                        extra={
                            "story_id": str(story_id),
                            "version_id": str(version_id),
                            "outcome": "generation_fallback",
                            "latency_ms": round(latency_ms, 2),
                        },
                    )
                    return

                async for bg_db in get_db_for_background():
                    result = await bg_db.execute(
                        update(StoryVersion)
                        .where(
                            StoryVersion.id == version_id,
                            StoryVersion.change_summary == fallback_text,
                        )
                        .values(change_summary=generated)
                    )
                    await bg_db.commit()

                    # mypy doesn't recognize rowcount on Result[Any], but it
                    # exists at runtime (see app.services.notification for
                    # the same pattern).
                    updated = cast(int, getattr(result, "rowcount", 0)) or 0
                    if updated:
                        logger.info(
                            "story.change_summary.completed",
                            extra={
                                "story_id": str(story_id),
                                "version_id": str(version_id),
                                "outcome": "generated",
                                "latency_ms": round(latency_ms, 2),
                            },
                        )
                    else:
                        # change_summary no longer equalled fallback_text --
                        # another writer (e.g. a restoration) already
                        # replaced it. Leave it alone.
                        logger.info(
                            "story.change_summary.fallback",
                            extra={
                                "story_id": str(story_id),
                                "version_id": str(version_id),
                                "outcome": "superseded",
                                "latency_ms": round(latency_ms, 2),
                            },
                        )
            except Exception as e:
                logger.error(
                    "story.change_summary.background_failed",
                    extra={
                        "story_id": str(story_id),
                        "version_id": str(version_id),
                        "error": str(e),
                    },
                    exc_info=True,
                )

        async def reindex() -> None:
            """Post-commit: re-index the story's content at this boundary.

            Moved here from the per-save `background_reindex` in
            `routes/story.py` (design.md Decision 3) -- indexing now runs
            once per boundary instead of once per autosave. Swallows its
            own exceptions; a failed reindex must never surface to the user.
            """
            if primary_legacy_id is None:
                return
            try:
                async for bg_db in get_db_for_background():
                    await index_story_chunks(
                        db=bg_db,
                        story_id=story_id,
                        content=new_content,
                        legacy_id=primary_legacy_id,
                        visibility=visibility,
                        author_id=author_id,
                        user_id=user_id,
                        story_title=new_title,
                    )
            except Exception as e:
                logger.error(
                    "story.reindex.background_failed",
                    extra={"story_id": str(story_id), "error": str(e)},
                    exc_info=True,
                )

        # (5) Schedule the post-commit work.
        background_tasks.add_task(upgrade_change_summary)
        background_tasks.add_task(reindex)

    return version
