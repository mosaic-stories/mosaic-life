"""Tests for the story response service."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.notification import Notification
from app.models.story import Story
from app.models.story_response import StoryResponse as StoryResponseModel
from app.models.user import User
from app.schemas.story_response import StoryResponseCreate, StoryResponseUpdate
from app.services import story_response as story_response_service

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


class TestCreateResponseMembershipGating:
    @pytest.mark.asyncio
    async def test_member_can_respond(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        item = await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            data=StoryResponseCreate(body="I remember that day."),
        )

        assert item.body == "I remember that day."
        assert item.user_id == test_user_2.id

        refreshed = await db_session.get(Story, test_story.id)
        assert refreshed is not None
        assert refreshed.response_count == 1

    @pytest.mark.asyncio
    async def test_non_member_denied(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story: Story,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await story_response_service.create_response(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user_2.id,
                data=StoryResponseCreate(body="Not a member"),
            )
        assert exc_info.value.status_code == 403

        result = await db_session.execute(select(StoryResponseModel))
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
            await story_response_service.create_response(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user_2.id,
                data=StoryResponseCreate(body="Still pending"),
            )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_author_can_respond_even_if_not_a_member(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """The story's author may respond even without a LegacyMember row."""
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

        item = await story_response_service.create_response(
            db=db_session,
            story_id=story.id,
            user_id=test_user_2.id,
            data=StoryResponseCreate(body="My own story"),
        )
        assert item.user_id == test_user_2.id

    @pytest.mark.asyncio
    async def test_non_member_denied_on_public_story(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story_public: Story,
    ):
        """Public visibility does not extend response rights to non-members."""
        with pytest.raises(HTTPException) as exc_info:
            await story_response_service.create_response(
                db=db_session,
                story_id=test_story_public.id,
                user_id=test_user_2.id,
                data=StoryResponseCreate(body="Can read but cannot respond"),
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
            await story_response_service.create_response(
                db=db_session,
                story_id=test_story_personal.id,
                user_id=test_user_2.id,
                data=StoryResponseCreate(body="Can't see this"),
            )
        assert exc_info.value.status_code == 403


class TestBodySanitization:
    def test_html_tags_stripped(self):
        data = StoryResponseCreate(body="<b>bold</b> and <script>alert(1)</script>text")
        assert "<" not in data.body
        assert "bold" in data.body
        assert "alert(1)" in data.body  # tag stripped, inner text kept as plain text

    def test_line_breaks_preserved(self):
        data = StoryResponseCreate(body="line one\nline two")
        assert data.body == "line one\nline two"

    def test_empty_after_stripping_rejected(self):
        with pytest.raises(ValueError):
            StoryResponseCreate(body="<div></div>   ")


class TestEditResponse:
    @pytest.mark.asyncio
    async def test_author_can_edit_and_gets_edited_marker(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        created = await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            data=StoryResponseCreate(body="Original text"),
        )
        assert created.edited_at is None

        updated = await story_response_service.update_response(
            db=db_session,
            story_id=test_story.id,
            response_id=created.id,
            user_id=test_user.id,
            data=StoryResponseUpdate(body="Updated text"),
        )

        assert updated.body == "Updated text"
        assert updated.edited_at is not None

    @pytest.mark.asyncio
    async def test_non_author_cannot_edit(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        created = await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            data=StoryResponseCreate(body="Original text"),
        )

        with pytest.raises(HTTPException) as exc_info:
            await story_response_service.update_response(
                db=db_session,
                story_id=test_story.id,
                response_id=created.id,
                user_id=test_user_2.id,
                data=StoryResponseUpdate(body="Hijacked"),
            )
        assert exc_info.value.status_code == 403

        unchanged = await db_session.get(StoryResponseModel, created.id)
        assert unchanged is not None
        assert unchanged.body == "Original text"
        assert unchanged.edited_at is None


class TestDeleteResponseRights:
    @pytest.mark.asyncio
    async def test_author_can_delete_own_response(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        created = await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            data=StoryResponseCreate(body="Delete me"),
        )

        await story_response_service.delete_response(
            db=db_session,
            story_id=test_story.id,
            response_id=created.id,
            user_id=test_user_2.id,
        )

        row = await db_session.get(StoryResponseModel, created.id)
        assert row is not None
        assert row.deleted_at is not None

        refreshed = await db_session.get(Story, test_story.id)
        assert refreshed is not None
        # The decrement uses a conditional CASE expression, so SQLAlchemy's
        # ORM-enabled UPDATE falls back to expiring the matched row rather
        # than evaluating it client-side (same reason favorite.py calls
        # db.refresh() after its own clamped decrement).
        await db_session.refresh(refreshed)
        assert refreshed.response_count == 0

    @pytest.mark.asyncio
    async def test_legacy_admin_can_delete_others_response(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        created = await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            data=StoryResponseCreate(body="Delete me"),
        )

        admin = await _make_user(db_session, "admin@example.com", "legacy-admin")
        await _add_member(db_session, test_legacy.id, admin.id, "admin")

        await story_response_service.delete_response(
            db=db_session,
            story_id=test_story.id,
            response_id=created.id,
            user_id=admin.id,
        )

        row = await db_session.get(StoryResponseModel, created.id)
        assert row is not None
        assert row.deleted_at is not None

    @pytest.mark.asyncio
    async def test_advocate_cannot_delete_others_response(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        author = await _make_user(db_session, "author2@example.com", "response-author")
        await _add_member(db_session, test_legacy.id, author.id, "advocate")
        created = await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=author.id,
            data=StoryResponseCreate(body="Delete me"),
        )

        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        with pytest.raises(HTTPException) as exc_info:
            await story_response_service.delete_response(
                db=db_session,
                story_id=test_story.id,
                response_id=created.id,
                user_id=test_user_2.id,
            )
        assert exc_info.value.status_code == 403

        row = await db_session.get(StoryResponseModel, created.id)
        assert row is not None
        assert row.deleted_at is None

    @pytest.mark.asyncio
    async def test_admirer_cannot_delete_others_response(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        author = await _make_user(
            db_session, "author3@example.com", "response-author-2"
        )
        await _add_member(db_session, test_legacy.id, author.id, "advocate")
        created = await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=author.id,
            data=StoryResponseCreate(body="Delete me"),
        )

        await _add_member(db_session, test_legacy.id, test_user_2.id, "admirer")

        with pytest.raises(HTTPException) as exc_info:
            await story_response_service.delete_response(
                db=db_session,
                story_id=test_story.id,
                response_id=created.id,
                user_id=test_user_2.id,
            )
        assert exc_info.value.status_code == 403


class TestNotificationFanOut:
    @pytest.mark.asyncio
    async def test_author_notified_when_member_responds(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")

        await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user_2.id,
            data=StoryResponseCreate(body="First response"),
        )

        result = await db_session.execute(
            select(Notification).where(Notification.user_id == test_user.id)
        )
        notifications = result.scalars().all()
        assert len(notifications) == 1
        assert notifications[0].type == "story_response"

    @pytest.mark.asyncio
    async def test_actor_not_notified_of_own_action(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        """The story author responding to their own story notifies no one."""
        await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            data=StoryResponseCreate(body="Talking to myself"),
        )

        result = await db_session.execute(select(Notification))
        assert result.scalars().first() is None

    @pytest.mark.asyncio
    async def test_prior_responder_notified_also_responded(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        member_a = test_user_2
        await _add_member(db_session, test_legacy.id, member_a.id, "advocate")
        member_b = await _make_user(db_session, "memberb@example.com", "member-b")
        await _add_member(db_session, test_legacy.id, member_b.id, "advocate")

        # Member A responds first.
        await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=member_a.id,
            data=StoryResponseCreate(body="First"),
        )

        # Member B responds next: story author + member A should be notified.
        await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=member_b.id,
            data=StoryResponseCreate(body="Second"),
        )

        author_notifs = (
            (
                await db_session.execute(
                    select(Notification).where(Notification.user_id == test_user.id)
                )
            )
            .scalars()
            .all()
        )
        assert len(author_notifs) == 2  # one per response

        member_a_notifs = (
            (
                await db_session.execute(
                    select(Notification).where(Notification.user_id == member_a.id)
                )
            )
            .scalars()
            .all()
        )
        assert len(member_a_notifs) == 1  # notified only about B's response

        member_b_notifs = (
            (
                await db_session.execute(
                    select(Notification).where(Notification.user_id == member_b.id)
                )
            )
            .scalars()
            .all()
        )
        assert len(member_b_notifs) == 0  # actor never notified of own action

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
            await story_response_service.create_response(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user_2.id,
                data=StoryResponseCreate(body="Hello"),
            )
            mock_create.assert_awaited_once()
            call_kwargs = mock_create.call_args.kwargs
            assert call_kwargs["user_id"] == test_user.id
            assert call_kwargs["notification_type"] == "story_response"
            assert call_kwargs["actor_id"] == test_user_2.id
            assert call_kwargs["resource_type"] == "story_response"
            assert (
                call_kwargs["link"] == f"/legacy/{test_legacy.id}/story/{test_story.id}"
            )


class TestListResponsesCursorPagination:
    @pytest.mark.asyncio
    async def test_paginates_oldest_first(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        base = datetime.now(timezone.utc)
        for i in range(5):
            db_session.add(
                StoryResponseModel(
                    story_id=test_story.id,
                    user_id=test_user.id,
                    body=f"Response {i}",
                    created_at=base + timedelta(seconds=i),
                )
            )
        await db_session.commit()

        page1 = await story_response_service.list_responses(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            cursor=None,
            limit=2,
        )
        assert [item.body for item in page1["items"]] == ["Response 0", "Response 1"]
        assert page1["has_more"] is True
        assert page1["next_cursor"] is not None

        page2 = await story_response_service.list_responses(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            cursor=datetime.fromisoformat(page1["next_cursor"]),
            limit=2,
        )
        assert [item.body for item in page2["items"]] == ["Response 2", "Response 3"]
        assert page2["has_more"] is True

        page3 = await story_response_service.list_responses(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            cursor=datetime.fromisoformat(page2["next_cursor"]),
            limit=2,
        )
        assert [item.body for item in page3["items"]] == ["Response 4"]
        assert page3["has_more"] is False
        assert page3["next_cursor"] is None

    @pytest.mark.asyncio
    async def test_soft_deleted_excluded_from_list(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ):
        created = await story_response_service.create_response(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            data=StoryResponseCreate(body="Will be deleted"),
        )
        await story_response_service.delete_response(
            db=db_session,
            story_id=test_story.id,
            response_id=created.id,
            user_id=test_user.id,
        )

        result = await story_response_service.list_responses(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            cursor=None,
            limit=20,
        )
        assert result["items"] == []
