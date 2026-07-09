"""Tests for activity-feed-language (story-responses change, section 6):
sentence templates, server-side filtering of untemplated events, and the
response/reaction `record_activity` wiring that feeds this feed.
"""

from datetime import datetime
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import UserActivity
from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.user import User
from app.services import activity as activity_service


async def _add_member(db: AsyncSession, legacy_id, user_id, role: str) -> None:
    db.add(LegacyMember(legacy_id=legacy_id, user_id=user_id, role=role))
    await db.commit()


class TestRenderActivitySentence:
    """Direct unit tests for the (action, entity_type) -> sentence templates."""

    def test_story_created_names_actor_and_legacy(self):
        sentence = activity_service.render_activity_sentence(
            action="created",
            entity_type="story",
            actor_name="Sue",
            metadata={"title": "A memory"},
            entity={"title": "A memory", "legacy_name": "Karen"},
        )
        assert sentence == "Sue added a memory to Karen's legacy"

    def test_media_action_has_no_template(self):
        sentence = activity_service.render_activity_sentence(
            action="created",
            entity_type="media",
            actor_name="Sue",
            metadata={"filename": "Screenshot 2026-05-17 at 12.16.55 AM.png"},
        )
        assert sentence is None

    def test_reaction_names_the_reaction_type(self):
        sentence = activity_service.render_activity_sentence(
            action="reacted",
            entity_type="story",
            actor_name="Sue",
            metadata={"reaction_type": "heart"},
        )
        assert sentence == "Sue reacted with a heart to a memory"

    def test_response_falls_back_gracefully_without_metadata(self):
        sentence = activity_service.render_activity_sentence(
            action="responded",
            entity_type="story",
            actor_name="Sue",
        )
        assert sentence == "Sue responded to a memory"

    def test_no_media_pair_is_ever_templated(self):
        """No (action, entity_type) template may surface a raw filename —
        enforced structurally by never templating `media` at all (see
        `app/routes/media.py`'s record_activity calls, which store the raw
        filename in metadata)."""
        assert not any(
            entity_type == "media"
            for (_action, entity_type) in activity_service.TEMPLATED_ACTIVITY_PAIRS
        )


class TestActivityFeedFiltering:
    """Server-side filtering of untemplated events, before pagination."""

    @pytest.mark.asyncio
    async def test_untemplated_event_absent_from_activity_feed(
        self, db_session: AsyncSession, test_user: User
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="media",
            entity_id=uuid4(),
            metadata={"filename": "photo.jpg"},
        )
        result = await activity_service.get_activity_feed(
            db=db_session, user_id=test_user.id
        )
        assert result["items"] == []

    @pytest.mark.asyncio
    async def test_untemplated_event_absent_from_social_feed(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="updated",
            entity_type="media",
            entity_id=uuid4(),
            metadata={"fields": ["caption"]},
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=test_user.id
        )
        assert result["items"] == []

    @pytest.mark.asyncio
    async def test_limit_counts_only_templated_items(
        self, db_session: AsyncSession, test_user: User
    ):
        # 3 templated ("story"/"created") events interleaved with 2
        # untemplated ("media"/"created") events.
        for i in range(3):
            await activity_service.record_activity(
                db=db_session,
                user_id=test_user.id,
                action="created",
                entity_type="story",
                entity_id=uuid4(),
                metadata={"title": f"Story {i}"},
            )
            await activity_service.record_activity(
                db=db_session,
                user_id=test_user.id,
                action="created",
                entity_type="media",
                entity_id=uuid4(),
                metadata={"filename": f"photo-{i}.jpg"},
            )

        page1 = await activity_service.get_activity_feed(
            db=db_session, user_id=test_user.id, limit=2
        )
        assert len(page1["items"]) == 2
        assert all(item.entity_type == "story" for item in page1["items"])
        assert page1["has_more"] is True

        cursor = datetime.fromisoformat(page1["next_cursor"])
        page2 = await activity_service.get_activity_feed(
            db=db_session, user_id=test_user.id, limit=2, cursor=cursor
        )
        assert len(page2["items"]) == 1
        assert page2["has_more"] is False

    @pytest.mark.asyncio
    async def test_templated_event_renders_sentence_in_personal_feed_route(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="legacy",
            entity_id=test_legacy.id,
            metadata={"name": test_legacy.name},
        )
        response = await client.get("/api/activity", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["summary"] == f"You created {test_legacy.name}'s legacy"

    @pytest.mark.asyncio
    async def test_templated_event_names_actor_and_legacy_in_social_feed(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user_2.id,
            action="created",
            entity_type="story",
            entity_id=test_story.id,
            metadata={"title": test_story.title},
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=test_user.id
        )
        assert len(result["items"]) == 1
        expected = f"{test_user_2.name} added a memory to {test_legacy.name}'s legacy"
        assert result["items"][0]["summary"] == expected


class TestResponseReactionActivityWiring:
    """`record_activity` calls added to the response/reaction routes."""

    @pytest.mark.asyncio
    async def test_creating_response_records_activity(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        auth_headers: dict[str, str],
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "I remember this well."},
            headers=auth_headers,
        )
        assert response.status_code == 201

        result = await db_session.execute(
            select(UserActivity).where(
                UserActivity.user_id == test_user.id,
                UserActivity.action == "responded",
            )
        )
        activity = result.scalar_one()
        assert activity.entity_type == "story"
        assert activity.entity_id == test_story.id

    @pytest.mark.asyncio
    async def test_reacting_records_activity_with_reaction_type(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        auth_headers: dict[str, str],
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "candle"},
            headers=auth_headers,
        )
        assert response.status_code == 200

        result = await db_session.execute(
            select(UserActivity).where(
                UserActivity.user_id == test_user.id,
                UserActivity.action == "reacted",
            )
        )
        activity = result.scalar_one()
        assert activity.entity_type == "story"
        assert activity.entity_id == test_story.id
        assert activity.metadata_["reaction_type"] == "candle"

    @pytest.mark.asyncio
    async def test_toggling_reaction_off_does_not_record_activity(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        auth_headers: dict[str, str],
    ):
        await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "smile"},
            headers=auth_headers,
        )
        off_response = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "smile"},
            headers=auth_headers,
        )
        assert off_response.json()["reacted"] is False

        result = await db_session.execute(
            select(UserActivity).where(
                UserActivity.user_id == test_user.id,
                UserActivity.action == "reacted",
            )
        )
        activities = result.scalars().all()
        assert len(activities) == 1  # only the toggle-on was recorded

    @pytest.mark.asyncio
    async def test_response_appears_in_feed_with_templated_sentence(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        auth_headers: dict[str, str],
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "Thanks for sharing."},
            headers=auth_headers,
        )
        assert response.status_code == 201

        feed_response = await client.get("/api/activity", headers=auth_headers)
        data = feed_response.json()
        responded_items = [i for i in data["items"] if i["action"] == "responded"]
        assert len(responded_items) == 1
        assert "responded" in responded_items[0]["summary"]
