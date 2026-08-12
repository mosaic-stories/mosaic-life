"""Tests for the AI per-user, per-bucket in-process concurrency guard."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.services.ai_concurrency import (
    AIConcurrencyLimitError,
    AIConcurrencySlot,
    ai_concurrency_guard,
)


class TestAIConcurrencyGuard:
    """Tests for ai_concurrency_guard."""

    @pytest.mark.asyncio
    async def test_allows_up_to_limit_concurrent_slots(self) -> None:
        """Acquiring up to `limit` nested slots for the same key succeeds."""
        user_id = uuid4()

        async with ai_concurrency_guard(user_id, bucket="chat_message", limit=2):
            async with ai_concurrency_guard(user_id, bucket="chat_message", limit=2):
                pass  # both slots held concurrently without error

    @pytest.mark.asyncio
    async def test_rejects_beyond_limit(self) -> None:
        """The acquire beyond `limit` raises AIConcurrencyLimitError."""
        user_id = uuid4()

        async with ai_concurrency_guard(user_id, bucket="chat_message", limit=2):
            async with ai_concurrency_guard(user_id, bucket="chat_message", limit=2):
                with pytest.raises(AIConcurrencyLimitError) as exc:
                    async with ai_concurrency_guard(
                        user_id, bucket="chat_message", limit=2
                    ):
                        pass

                assert exc.value.retry_after_seconds == 5

    @pytest.mark.asyncio
    async def test_normal_exit_frees_slot_for_next_acquire(self) -> None:
        """Releasing on normal exit frees a slot for a subsequent acquire."""
        user_id = uuid4()

        async with ai_concurrency_guard(user_id, bucket="chat_message", limit=1):
            pass  # slot released on normal exit

        # Should succeed now that the first slot has been released.
        async with ai_concurrency_guard(user_id, bucket="chat_message", limit=1):
            pass

    @pytest.mark.asyncio
    async def test_exception_inside_block_still_frees_slot(self) -> None:
        """An exception raised inside the block still frees the slot."""
        user_id = uuid4()

        with pytest.raises(RuntimeError):
            async with ai_concurrency_guard(user_id, bucket="chat_message", limit=1):
                raise RuntimeError("boom")

        # The slot must have been released despite the exception, so this
        # acquire succeeds rather than raising AIConcurrencyLimitError.
        async with ai_concurrency_guard(user_id, bucket="chat_message", limit=1):
            pass

    @pytest.mark.asyncio
    async def test_slots_isolated_per_bucket(self) -> None:
        """Filling the limit for one bucket doesn't affect another bucket."""
        user_id = uuid4()

        async with ai_concurrency_guard(user_id, bucket="chat_message", limit=1):
            # Different bucket, same user: should not be blocked.
            async with ai_concurrency_guard(user_id, bucket="story_rewrite", limit=1):
                pass

    @pytest.mark.asyncio
    async def test_slots_isolated_per_user(self) -> None:
        """Filling the limit for one user doesn't affect another user."""
        user_a = uuid4()
        user_b = uuid4()

        async with ai_concurrency_guard(user_a, bucket="chat_message", limit=1):
            # Different user, same bucket: should not be blocked.
            async with ai_concurrency_guard(user_b, bucket="chat_message", limit=1):
                pass


class TestAIConcurrencySlot:
    """Tests for the manual acquire/release AIConcurrencySlot wrapper."""

    @pytest.mark.asyncio
    async def test_acquire_up_to_limit_succeeds(self) -> None:
        """Acquiring up to `limit` slots via AIConcurrencySlot succeeds."""
        user_id = uuid4()

        slot1 = await AIConcurrencySlot.acquire(user_id, bucket="chat_message", limit=2)
        slot2 = await AIConcurrencySlot.acquire(user_id, bucket="chat_message", limit=2)

        await slot1.release()
        await slot2.release()

    @pytest.mark.asyncio
    async def test_acquire_beyond_limit_raises(self) -> None:
        """The acquire beyond `limit` raises AIConcurrencyLimitError."""
        user_id = uuid4()

        slot = await AIConcurrencySlot.acquire(user_id, bucket="chat_message", limit=1)

        with pytest.raises(AIConcurrencyLimitError) as exc:
            await AIConcurrencySlot.acquire(user_id, bucket="chat_message", limit=1)

        assert exc.value.retry_after_seconds == 5

        await slot.release()

    @pytest.mark.asyncio
    async def test_release_frees_slot_for_subsequent_acquire(self) -> None:
        """Releasing a manually acquired slot frees it for a later acquire."""
        user_id = uuid4()

        slot = await AIConcurrencySlot.acquire(user_id, bucket="chat_message", limit=1)
        await slot.release()

        # Should succeed now that the slot has been released.
        slot2 = await AIConcurrencySlot.acquire(user_id, bucket="chat_message", limit=1)
        await slot2.release()
