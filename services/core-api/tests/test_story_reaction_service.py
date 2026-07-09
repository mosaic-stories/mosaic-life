"""Tests for the story reaction service."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.notification import Notification
from app.models.story import Story
from app.models.story_reaction import StoryReaction as StoryReactionModel
from app.models.user import User
from app.services import story as story_service
from app.services import story_reaction as story_reaction_service
from app.services import story_response as story_response_service
from app.schemas.story_response import StoryResponseCreate

NOTIF_PATCH = "app.services.notification.create_notification"


async def _add_member(db: AsyncSession, legacy_id, user_id, role: str) -> LegacyMember:
    member = LegacyMember(legacy_id=legacy_id, user_id=user_id, role=role)
    db.add(member)
    await db.commit()
    return member


async def _make_user(db: AsyncSession, email: str, username: str) -> User:
    user = User(
        email=email,
        google_id=f"google_{username}",
        provider="google",
        provider_id=f"google_{username}",
        name=username.replace("-", " ").title(),
        username=username,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestToggleReactionMembershipGating:
    @pytest.mark.asyncio
    async def test_member_can_react(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        result = await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            reaction_type="heart",
        )

        assert result["reacted"] is True
        assert result["reaction_heart_count"] == 1

        refreshed = await db_session.get(Story, test_story.id)
        assert refreshed is not None
        assert refreshed.reaction_heart_count == 1

    @pytest.mark.asyncio
    async def test_non_member_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story: Story,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await story_reaction_service.toggle_reaction(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user_2.id,
                reaction_type="heart",
            )
        assert exc_info.value.status_code == 403

        result = await db_session.execute(select(StoryReactionModel))
        assert result.scalars().first() is None

    @pytest.mark.asyncio
    async def test_pending_member_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "pending")

        with pytest.raises(HTTPException) as exc_info:
            await story_reaction_service.toggle_reaction(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user_2.id,
                reaction_type="candle",
            )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_author_can_react_even_if_not_a_member(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """The story's author may react even without a LegacyMember row."""
        story = Story(
            author_id=test_user_2.id,
            title="Authored, not a member",
            content="Body",
            visibility="private",
            status="published",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(
            StoryLegacy(story_id=story.id, legacy_id=test_legacy.id, role="primary")
        )
        await db_session.commit()

        result = await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=story.id,
            user_id=test_user_2.id,
            reaction_type="smile",
        )
        assert result["reacted"] is True

    @pytest.mark.asyncio
    async def test_non_member_denied_on_public_story(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story_public: Story,
    ):
        """Public visibility does not extend reaction rights to non-members."""
        with pytest.raises(HTTPException) as exc_info:
            await story_reaction_service.toggle_reaction(
                db=db_session,
                story_id=test_story_public.id,
                user_id=test_user_2.id,
                reaction_type="heart",
            )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_member_denied_on_personal_story(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story_personal: Story,
    ):
        """Personal stories stay author-only, even for active legacy members."""
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        with pytest.raises(HTTPException) as exc_info:
            await story_reaction_service.toggle_reaction(
                db=db_session,
                story_id=test_story_personal.id,
                user_id=test_user_2.id,
                reaction_type="heart",
            )
        assert exc_info.value.status_code == 403


class TestToggleOnOff:
    @pytest.mark.asyncio
    async def test_toggle_on_creates_row_and_increments(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        result = await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="candle",
        )
        assert result["reacted"] is True
        assert result["reaction_candle_count"] == 1
        assert result["reaction_heart_count"] == 0
        assert result["reaction_smile_count"] == 0

        row = await db_session.execute(
            select(StoryReactionModel).where(
                StoryReactionModel.story_id == test_story.id,
                StoryReactionModel.user_id == test_user.id,
                StoryReactionModel.reaction_type == "candle",
            )
        )
        assert row.scalars().first() is not None

    @pytest.mark.asyncio
    async def test_toggle_off_removes_row_and_decrements(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="candle",
        )

        result = await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="candle",
        )
        assert result["reacted"] is False
        assert result["reaction_candle_count"] == 0

        row = await db_session.execute(
            select(StoryReactionModel).where(
                StoryReactionModel.story_id == test_story.id,
                StoryReactionModel.user_id == test_user.id,
                StoryReactionModel.reaction_type == "candle",
            )
        )
        assert row.scalars().first() is None

    @pytest.mark.asyncio
    async def test_decrement_clamped_at_zero(
        self,
        db_session: AsyncSession,
        test_story: Story,
    ):
        """Decrementing below zero (e.g. counter drift) clamps at zero."""
        from sqlalchemy import update

        await db_session.execute(
            update(Story)
            .where(Story.id == test_story.id)
            .values(reaction_heart_count=0)
        )
        await db_session.commit()

        await story_reaction_service._decrement_reaction_count(
            db_session, test_story.id, "heart"
        )
        await db_session.commit()

        refreshed = await db_session.get(Story, test_story.id)
        assert refreshed is not None
        await db_session.refresh(refreshed)
        assert refreshed.reaction_heart_count == 0


class TestOneOfEachTypePerUser:
    @pytest.mark.asyncio
    async def test_heart_and_smile_coexist(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="heart",
        )
        result = await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="smile",
        )
        assert result["reaction_heart_count"] == 1
        assert result["reaction_smile_count"] == 1

        rows = await db_session.execute(
            select(StoryReactionModel).where(
                StoryReactionModel.story_id == test_story.id,
                StoryReactionModel.user_id == test_user.id,
            )
        )
        types = {r.reaction_type for r in rows.scalars().all()}
        assert types == {"heart", "smile"}

    @pytest.mark.asyncio
    async def test_reacting_heart_again_only_removes_heart(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="heart",
        )
        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="smile",
        )

        result = await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="heart",
        )
        assert result["reacted"] is False
        assert result["reaction_heart_count"] == 0
        assert result["reaction_smile_count"] == 1

        rows = await db_session.execute(
            select(StoryReactionModel).where(
                StoryReactionModel.story_id == test_story.id,
                StoryReactionModel.user_id == test_user.id,
            )
        )
        types = {r.reaction_type for r in rows.scalars().all()}
        assert types == {"smile"}


class TestNotificationFanOut:
    @pytest.mark.asyncio
    async def test_author_notified_when_member_reacts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            reaction_type="heart",
        )

        result = await db_session.execute(
            select(Notification).where(Notification.user_id == test_user.id)
        )
        notifications = result.scalars().all()
        assert len(notifications) == 1
        assert notifications[0].type == "story_reaction"

    @pytest.mark.asyncio
    async def test_actor_not_notified_of_own_reaction(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="heart",
        )

        result = await db_session.execute(select(Notification))
        assert result.scalars().first() is None

    @pytest.mark.asyncio
    async def test_no_notification_on_toggle_off(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            reaction_type="heart",
        )
        # Toggle off: no additional notification.
        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            reaction_type="heart",
        )

        result = await db_session.execute(
            select(Notification).where(Notification.user_id == test_user.id)
        )
        notifications = result.scalars().all()
        assert len(notifications) == 1  # only from the toggle-on

    @pytest.mark.asyncio
    async def test_create_notification_called_with_expected_kwargs(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        with patch(NOTIF_PATCH, new_callable=AsyncMock) as mock_create:
            await story_reaction_service.toggle_reaction(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user_2.id,
                reaction_type="candle",
            )
            mock_create.assert_awaited_once()
            call_kwargs = mock_create.call_args.kwargs
            assert call_kwargs["user_id"] == test_user.id
            assert call_kwargs["notification_type"] == "story_reaction"
            assert call_kwargs["actor_id"] == test_user_2.id
            assert call_kwargs["resource_type"] == "story_reaction"
            assert (
                call_kwargs["link"] == f"/legacy/{test_legacy.id}/story/{test_story.id}"
            )


class TestCountsInStorySerializers:
    @pytest.mark.asyncio
    async def test_get_story_detail_reflects_response_and_reaction_counts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            reaction_type="heart",
        )
        await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            data=StoryResponseCreate(body="Nice memory"),
        )

        detail = await story_service.get_story_detail(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story.id,
        )

        assert detail.response_count == 1
        assert detail.reaction_heart_count == 1
        assert detail.reaction_candle_count == 0
        assert detail.reaction_smile_count == 0

    @pytest.mark.asyncio
    async def test_get_story_detail_reflects_my_reactions_for_requesting_user(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        """`my_reactions` reflects only the requesting user's own reactions —
        distinct from the aggregate counts and from other users' reactions."""
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            reaction_type="heart",
        )
        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            reaction_type="smile",
        )

        # The reacting user sees both of their own reaction types.
        detail_for_reactor = await story_service.get_story_detail(
            db=db_session,
            user_id=test_user_2.id,
            story_id=test_story.id,
        )
        assert set(detail_for_reactor.my_reactions) == {"heart", "smile"}

        # The story's author (a different user, who hasn't reacted) sees none
        # of their own, even though the aggregate counts are non-zero.
        detail_for_author = await story_service.get_story_detail(
            db=db_session,
            user_id=test_user.id,
            story_id=test_story.id,
        )
        assert detail_for_author.my_reactions == []
        assert detail_for_author.reaction_heart_count == 1
        assert detail_for_author.reaction_smile_count == 1

    @pytest.mark.asyncio
    async def test_list_legacy_stories_reflects_reaction_counts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await story_reaction_service.toggle_reaction(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            reaction_type="smile",
        )

        summaries = await story_service.list_legacy_stories(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        matching = next(s for s in summaries if s.id == test_story.id)
        assert matching.reaction_smile_count == 1
        assert matching.reaction_heart_count == 0
        assert matching.response_count == 0
