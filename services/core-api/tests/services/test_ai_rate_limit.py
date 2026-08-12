"""Tests for the AI per-user frequency rate limiter."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_rate_limit import AIRateLimitEvent
from app.models.user import User
from app.services.ai_rate_limit import AIRateLimitError, enforce_ai_rate_limit


async def _count_events(db: AsyncSession, user_id, bucket: str) -> int:
    result = await db.execute(
        select(func.count(AIRateLimitEvent.id)).where(
            AIRateLimitEvent.user_id == user_id,
            AIRateLimitEvent.bucket == bucket,
        )
    )
    return result.scalar() or 0


class TestEnforceAIRateLimit:
    """Tests for enforce_ai_rate_limit."""

    @pytest.mark.asyncio
    async def test_under_threshold_calls_succeed_and_record_events(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Calls below the limit succeed and each inserts an event row."""
        thresholds = [(60, 3)]

        for _ in range(2):
            await enforce_ai_rate_limit(
                db_session,
                test_user.id,
                bucket="chat_message",
                thresholds=thresholds,
            )

        count = await _count_events(db_session, test_user.id, "chat_message")
        assert count == 2

    @pytest.mark.asyncio
    async def test_crossing_threshold_raises_with_matching_retry_after(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """The call that crosses the threshold raises with the window as retry hint."""
        thresholds = [(60, 3)]

        for _ in range(3):
            await enforce_ai_rate_limit(
                db_session,
                test_user.id,
                bucket="chat_message",
                thresholds=thresholds,
            )

        with pytest.raises(AIRateLimitError) as exc:
            await enforce_ai_rate_limit(
                db_session,
                test_user.id,
                bucket="chat_message",
                thresholds=thresholds,
            )

        assert exc.value.retry_after_seconds == 60

        # The rejected call must not have recorded an additional event.
        count = await _count_events(db_session, test_user.id, "chat_message")
        assert count == 3

    @pytest.mark.asyncio
    async def test_events_isolated_per_user(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ):
        """Events for a different user don't count toward another user's limit."""
        thresholds = [(60, 3)]

        for _ in range(2):
            await enforce_ai_rate_limit(
                db_session,
                test_user.id,
                bucket="chat_message",
                thresholds=thresholds,
            )
        for _ in range(2):
            await enforce_ai_rate_limit(
                db_session,
                test_user_2.id,
                bucket="chat_message",
                thresholds=thresholds,
            )

        # Neither user is at 3 yet, so a further call for each should succeed.
        await enforce_ai_rate_limit(
            db_session,
            test_user.id,
            bucket="chat_message",
            thresholds=thresholds,
        )
        await enforce_ai_rate_limit(
            db_session,
            test_user_2.id,
            bucket="chat_message",
            thresholds=thresholds,
        )

        assert await _count_events(db_session, test_user.id, "chat_message") == 3
        assert await _count_events(db_session, test_user_2.id, "chat_message") == 3

    @pytest.mark.asyncio
    async def test_events_isolated_per_bucket(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Events for a different bucket don't count toward another bucket's limit."""
        thresholds = [(60, 3)]

        for _ in range(2):
            await enforce_ai_rate_limit(
                db_session,
                test_user.id,
                bucket="chat_message",
                thresholds=thresholds,
            )
        for _ in range(2):
            await enforce_ai_rate_limit(
                db_session,
                test_user.id,
                bucket="story_rewrite",
                thresholds=thresholds,
            )

        # Neither bucket is at 3 yet, so a further call for each should succeed.
        await enforce_ai_rate_limit(
            db_session,
            test_user.id,
            bucket="chat_message",
            thresholds=thresholds,
        )
        await enforce_ai_rate_limit(
            db_session,
            test_user.id,
            bucket="story_rewrite",
            thresholds=thresholds,
        )

        assert await _count_events(db_session, test_user.id, "chat_message") == 3
        assert await _count_events(db_session, test_user.id, "story_rewrite") == 3

    @pytest.mark.asyncio
    async def test_multi_threshold_enforces_tightest_window(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """A short, tight window can reject before a longer, looser window would."""
        thresholds = [(60, 3), (3600, 5)]

        for _ in range(3):
            await enforce_ai_rate_limit(
                db_session,
                test_user.id,
                bucket="chat_message",
                thresholds=thresholds,
            )

        # The 60s/3 threshold is now violated, even though the 3600s/5
        # threshold would still allow two more calls.
        with pytest.raises(AIRateLimitError) as exc:
            await enforce_ai_rate_limit(
                db_session,
                test_user.id,
                bucket="chat_message",
                thresholds=thresholds,
            )

        assert exc.value.retry_after_seconds == 60
        assert await _count_events(db_session, test_user.id, "chat_message") == 3

    @pytest.mark.asyncio
    async def test_prune_on_write_removes_stale_events_only(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Rows older than the largest configured window are pruned on write."""
        thresholds = [(60, 100), (3600, 200)]
        now = datetime.now(timezone.utc)

        # An old row well outside the largest (3600s) window.
        old_event = AIRateLimitEvent(
            user_id=test_user.id,
            bucket="chat_message",
            created_at=now - timedelta(seconds=7200),
        )
        # A recent row, well within all windows.
        recent_event = AIRateLimitEvent(
            user_id=test_user.id,
            bucket="chat_message",
            created_at=now - timedelta(seconds=5),
        )
        db_session.add_all([old_event, recent_event])
        await db_session.commit()

        assert await _count_events(db_session, test_user.id, "chat_message") == 2

        # This call is under both thresholds, so it succeeds and prunes.
        await enforce_ai_rate_limit(
            db_session,
            test_user.id,
            bucket="chat_message",
            thresholds=thresholds,
        )

        result = await db_session.execute(
            select(AIRateLimitEvent.created_at).where(
                AIRateLimitEvent.user_id == test_user.id,
                AIRateLimitEvent.bucket == "chat_message",
            )
        )
        remaining_created_ats = [row[0] for row in result.all()]

        # Old row pruned; recent row and the new event survive.
        assert len(remaining_created_ats) == 2
        for created_at in remaining_created_ats:
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            assert created_at > now - timedelta(seconds=3600)
