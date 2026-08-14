"""Service layer for story version operations."""

import logging
import time
from datetime import datetime, timedelta, timezone
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


def _as_aware_utc(value: datetime | None) -> datetime | None:
    """Normalize a DB-loaded timestamp to a UTC-aware datetime, or None.

    Duplicated from `app.services.story` rather than imported from there:
    `story.py` imports `create_version`, `get_draft_version`, and
    `mint_version_at_boundary` from this module, so an import in the other
    direction would create a circular import. This is the same 3-line
    helper (see the identical docstring there for the SQLite-naive-datetime
    rationale) -- not worth an import-cycle refactor to share.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


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
    story: Story,
    user_id: UUID,
    background_tasks: BackgroundTasks,
    page: int = 1,
    page_size: int = 20,
    soft_cap: int | None = None,
) -> StoryVersionListResponse:
    """List all versions for a story, paginated, newest first.

    Before listing, evaluates the same editing-session boundary rules as
    `update_story()`'s Step A (services/story.py) -- design.md Decision 2
    in `openspec/changes/story-save-path-performance`: opening version
    history after a session has gone idle, or after a session has run past
    the max-interval cap, mints that session's version first, so it is
    present in this same read rather than requiring another save (spec:
    "Version history read after a session ends"). At most one version is
    minted per call, with the same idle-before-max-interval precedence as
    the save path. Unlike `update_story`, there is no incoming update to
    apply afterward -- this is a read, and the mint (if any) is the only
    write it performs.

    Args:
        db: Database session.
        story: The story to list versions for. Must already be attached to
            `db` (e.g. loaded via `require_story_write_access`).
        user_id: The user attributed with a boundary mint, if one happens.
        background_tasks: The request's `BackgroundTasks`. Forwarded to
            `mint_version_at_boundary()` so its post-commit work
            (change-summary upgrade, search re-index) can be scheduled when
            a boundary mints a version during this call.
        page: Page number (1-indexed).
        page_size: Items per page.
        soft_cap: Override for version soft cap (uses settings if None).

    Returns:
        Paginated version list with optional warning.
    """
    story_id = story.id
    settings = get_settings()

    if soft_cap is None:
        soft_cap = settings.story_version_soft_cap

    # --- Boundary evaluation, mirroring update_story()'s Step A exactly:
    # same settings fields, same idle-before-max-interval precedence, at
    # most one mint per call. `mint_version_at_boundary()` reads
    # `story.title`/`story.content` as its snapshot and clears
    # `story.pending_edit_since` itself.
    now = datetime.now(timezone.utc)
    pending_edit_since = _as_aware_utc(story.pending_edit_since)
    if pending_edit_since is not None:
        idle_cutoff = now - timedelta(seconds=settings.story_edit_session_idle_seconds)
        max_cutoff = now - timedelta(seconds=settings.story_edit_session_max_seconds)
        updated_at = _as_aware_utc(story.updated_at)

        if updated_at is not None and updated_at < idle_cutoff:
            await mint_version_at_boundary(
                db,
                story,
                reason="session_idle",
                user_id=user_id,
                background_tasks=background_tasks,
            )
        elif pending_edit_since < max_cutoff:
            await mint_version_at_boundary(
                db,
                story,
                reason="session_max_interval",
                user_id=user_id,
                background_tasks=background_tasks,
            )

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
    background_tasks: BackgroundTasks,
) -> StoryVersionDetail:
    """Restore an old version by minting a new active version with its content.

    Routes through `mint_version_at_boundary` with `reason="restore"`
    (design.md Decisions 3/3a) so the restore boundary gets the same
    fallback-summary write, `pending_edit_since` clearing, and post-commit
    change-summary/reindex scheduling as every other boundary.

    `mint_version_at_boundary`'s internal `create_version()` call reads
    `story.title`/`story.content` as the content for the new row, and it
    already deactivates the current active version itself -- so this
    function must set `story.title`/`story.content` to the restored
    version's content *before* calling it, and must **not** deactivate the
    current active version itself (that would double-deactivate / race the
    ordering `create_version()` already handles).

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

    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one()

    story.title = source.title
    story.content = source.content

    version = await mint_version_at_boundary(
        db=db,
        story=story,
        reason="restore",
        user_id=user_id,
        background_tasks=background_tasks,
        source_version=version_number,
    )

    return StoryVersionDetail.model_validate(version)


async def approve_draft(
    db: AsyncSession,
    story_id: UUID,
    user_id: UUID,
    background_tasks: BackgroundTasks,
) -> StoryVersionDetail:
    """Approve the current draft, promoting it to active.

    Routes through `promote_draft_at_boundary` with
    `reason="ai_rewrite_applied"` (design.md Decision 3a) -- the existing
    draft row is promoted in place rather than a redundant new version being
    minted on top of it.

    Raises:
        HTTPException: 404 if no draft exists.
    """
    draft = await get_draft_version(db, story_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft found")

    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one()

    await promote_draft_at_boundary(
        db=db,
        story=story,
        draft=draft,
        reason="ai_rewrite_applied",
        user_id=user_id,
        background_tasks=background_tasks,
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


async def _finalize_mint(
    db: AsyncSession,
    story: Story,
    version: StoryVersion,
    *,
    reason: str,
    source: str,
    user_id: UUID,
    background_tasks: BackgroundTasks,
    base_content: str,
    fallback_text: str,
    source_version: int | None,
    span: trace.Span,
    schedule_summary_upgrade: bool = True,
) -> None:
    """Shared tail of every boundary mint (design.md Decision 3a).

    Used by both `mint_version_at_boundary()` (new row created via
    `create_version()`) and `promote_draft_at_boundary()` (existing draft
    row promoted in place) so both boundary paths get identical
    observability and post-commit behavior: clears `story.pending_edit_since`,
    sets the `story.version.mint` span attributes, increments the mint
    metric, emits the `story.version.minted` log, and schedules the two
    post-commit background tasks (a change-summary upgrade and a search
    re-index).

    Does **not** commit -- callers own the commit (this repo's established
    convention; see commit c1cb24c).

    Args:
        db: The request's session. Used only for reads/writes that must
            land in the same transaction as the caller's other changes;
            the two background tasks open their own sessions.
        story: The story the version belongs to. Its `title`/`content` are
            read as the post-boundary content for the background closures.
        version: The version now active -- whether newly created
            (`mint_version_at_boundary`) or an existing draft promoted in
            place (`promote_draft_at_boundary`).
        reason: Boundary reason -- observability only, never persisted.
        source: The `story_versions.source` value already resolved by the
            caller via `_source_for_reason(reason)`.
        user_id: The user attributed with the boundary.
        background_tasks: The request's `BackgroundTasks`, used to schedule
            the post-commit work.
        base_content: The diff base for the eventual generated change
            summary -- the content as of the *previous* boundary.
        fallback_text: The deterministic fallback `change_summary` already
            written to `version.change_summary` by the caller. Used as the
            CAS guard for the background upgrade so a slow/failed
            generation can never clobber a summary another writer already
            replaced it with.
        source_version: For `reason="restore"`, the version number being
            restored from -- threaded through to the generated change
            summary. `None` for every other reason.
        span: The already-open `story.version.mint` span, opened by the
            caller so both `mint_version_at_boundary` and
            `promote_draft_at_boundary` trace consistently.
        schedule_summary_upgrade: Whether to schedule the change-summary
            upgrade task. `promote_draft_at_boundary` passes `False` when
            the draft already carried a real (non-fallback) summary --
            there is nothing to upgrade. The reindex task is always
            scheduled regardless.
    """
    # Session captured.
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

    # Schedule the post-commit work.
    if schedule_summary_upgrade:
        background_tasks.add_task(upgrade_change_summary)
    background_tasks.add_task(reindex)


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

    This is the entry point every boundary that mints a *new* version row
    (evolve_entry, restore, session_close, session_idle,
    session_max_interval) routes through (design.md Decision 3). Boundaries
    that instead *promote an existing draft row* (`ai_rewrite_applied`) use
    `promote_draft_at_boundary()` -- routing them through this function would
    mint a redundant second active version on top of the promoted draft
    (design.md Decision 3a). It:

    1. Captures the *current* active version's content as the diff base for
       the eventual generated change summary -- the state as of the
       *previous* boundary, not a snapshot from moments earlier. Empty
       string if the story has no active version yet.
    2. Creates the version via `create_version()` with a deterministic
       fallback `change_summary` so the column is never null, even if the
       background upgrade never lands.
    3. Delegates the shared tail (clearing `pending_edit_since`, span/metric/
       log emission, scheduling the two post-commit background tasks) to
       `_finalize_mint()`.

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
        reason: Boundary reason -- observability only. One of:
            `evolve_entry`, `restore`, `session_close`, `session_idle`,
            `session_max_interval`.
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

        await _finalize_mint(
            db,
            story,
            version,
            reason=reason,
            source=source,
            user_id=user_id,
            background_tasks=background_tasks,
            base_content=base_content,
            fallback_text=fallback_text,
            source_version=source_version,
            span=span,
        )

    return version


async def promote_draft_at_boundary(
    db: AsyncSession,
    story: Story,
    draft: StoryVersion,
    *,
    reason: str,
    user_id: UUID,
    background_tasks: BackgroundTasks,
) -> StoryVersion:
    """Promote an existing draft `StoryVersion` row to active at a boundary.

    Used for `reason="ai_rewrite_applied"` -- `approve_draft()`
    (story_version.py) and `accept_session()` (story_evolution.py) don't
    create a new version, they promote a draft row created earlier by an AI
    rewrite (design.md Decision 3a). Routing them through
    `mint_version_at_boundary()` instead would mint a second, redundant
    active version on top of the promoted draft, corrupting the
    draft->active semantics the frontend depends on (`get_draft_version`,
    the draft indicator in `VersionsTool.tsx`).

    Unlike `mint_version_at_boundary()`, this function deactivates the
    current active version itself (mirroring what `create_version()` does
    internally for the new-row path), since there is no `create_version()`
    call here to do it.

    Does **not** commit -- callers own the commit (this repo's established
    convention; see commit c1cb24c).

    Args:
        db: The request's session.
        story: The story the draft belongs to. Must already be attached to
            `db`.
        draft: The draft `StoryVersion` row (`status="draft"`) to promote
            in place. Its `id` does not change.
        reason: Boundary reason -- observability only. Always
            `ai_rewrite_applied` today.
        user_id: The user attributed with the boundary.
        background_tasks: The request's `BackgroundTasks`, used to schedule
            the post-commit work.

    Returns:
        `draft`, now promoted (`status="active"`), flushed but uncommitted.
    """
    source = _source_for_reason(reason)

    with tracer.start_as_current_span("story.version.mint") as span:
        # (2) Deactivate the current active version. Mirrors the ordering
        # already established by the pre-refactor approve_draft/
        # accept_session: flush after deactivating, before activating the
        # draft, so the partial-unique constraint on active versions is
        # never briefly violated.
        current_active = await get_active_version(db, story.id)
        base_content = current_active.content if current_active else ""
        if current_active:
            current_active.status = "inactive"
            await db.flush()

        # (3) Backfill a null change_summary with the deterministic
        # fallback -- true for every draft today, since neither creation
        # site (rewrite.py, story_evolution.py's save_draft) sets one. If
        # the draft already carries real content, leave it alone and skip
        # scheduling the summary-upgrade task below -- there is nothing to
        # upgrade.
        fallback_text = fallback_summary(source)
        schedule_summary_upgrade = not draft.change_summary
        if not draft.change_summary:
            draft.change_summary = fallback_text

        # (4) Promote.
        draft.status = "active"
        draft.stale = False

        # (5) Update story fields.
        story.title = draft.title
        story.content = draft.content
        story.active_version_id = draft.id
        await db.flush()

        # (6) Shared tail -- same span/metric/log emission and background
        # scheduling as the create-new path.
        await _finalize_mint(
            db,
            story,
            draft,
            reason=reason,
            source=source,
            user_id=user_id,
            background_tasks=background_tasks,
            base_content=base_content,
            fallback_text=draft.change_summary,
            source_version=None,
            span=span,
            schedule_summary_upgrade=schedule_summary_upgrade,
        )

    return draft
