"""Tests for social activity feed."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.person import Person
from app.models.story import Story
from app.models.story_version import StoryVersion
from app.models.user import User
from app.services import activity as activity_service


@pytest_asyncio.fixture
async def user_alice(db_session: AsyncSession) -> User:
    """Create user Alice."""
    user = User(
        email="alice@example.com",
        google_id="google_alice",
        name="Alice",
        avatar_url="https://example.com/alice.jpg",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_bob(db_session: AsyncSession) -> User:
    """Create user Bob."""
    user = User(
        email="bob@example.com",
        google_id="google_bob",
        name="Bob",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_eve(db_session: AsyncSession) -> User:
    """Create user Eve (not a member of any shared legacy)."""
    user = User(
        email="eve@example.com",
        google_id="google_eve",
        name="Eve",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def shared_legacy(
    db_session: AsyncSession, user_alice: User, user_bob: User
) -> Legacy:
    """Create a legacy where Alice and Bob are both members."""
    person = Person(canonical_name="Shared Legacy")
    db_session.add(person)
    await db_session.flush()

    legacy = Legacy(
        name="Shared Legacy",
        biography="Shared between Alice and Bob",
        visibility="public",
        created_by=user_alice.id,
        person_id=person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    for uid, role in [(user_alice.id, "creator"), (user_bob.id, "advocate")]:
        db_session.add(LegacyMember(legacy_id=legacy.id, user_id=uid, role=role))
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


@pytest_asyncio.fixture
async def shared_story(
    db_session: AsyncSession, user_bob: User, shared_legacy: Legacy
) -> Story:
    """Create a story by Bob linked to the shared legacy."""
    story = Story(
        author_id=user_bob.id,
        title="Bob's Story",
        content="Story content from Bob.",
        visibility="public",
    )
    db_session.add(story)
    await db_session.flush()

    sl = StoryLegacy(
        story_id=story.id,
        legacy_id=shared_legacy.id,
        role="primary",
        position=0,
    )
    db_session.add(sl)

    version = StoryVersion(
        story_id=story.id,
        version_number=1,
        title=story.title,
        content=story.content,
        status="active",
        source="manual_edit",
        change_summary="Initial version",
        created_by=user_bob.id,
    )
    db_session.add(version)
    await db_session.flush()
    story.active_version_id = version.id
    await db_session.commit()
    await db_session.refresh(story)
    return story


class TestGetSocialFeed:
    @pytest.mark.asyncio
    async def test_shows_own_activity(
        self, db_session: AsyncSession, user_alice: User, shared_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=user_alice.id,
            action="created",
            entity_type="legacy",
            entity_id=shared_legacy.id,
            metadata={"name": "Shared Legacy"},
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["action"] == "created"
        assert result["items"][0]["actor"]["name"] == "Alice"

    @pytest.mark.asyncio
    async def test_shows_co_member_legacy_activity(
        self,
        db_session: AsyncSession,
        user_alice: User,
        user_bob: User,
        shared_legacy: Legacy,
    ):
        # Bob updates the shared legacy
        await activity_service.record_activity(
            db=db_session,
            user_id=user_bob.id,
            action="updated",
            entity_type="legacy",
            entity_id=shared_legacy.id,
            metadata={"name": "Shared Legacy"},
        )
        # Alice should see Bob's action
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["actor"]["name"] == "Bob"

    @pytest.mark.asyncio
    async def test_shows_co_member_story_activity(
        self,
        db_session: AsyncSession,
        user_alice: User,
        user_bob: User,
        shared_legacy: Legacy,
        shared_story: Story,
    ):
        # Bob creates a story on shared legacy
        await activity_service.record_activity(
            db=db_session,
            user_id=user_bob.id,
            action="created",
            entity_type="story",
            entity_id=shared_story.id,
            metadata={"title": "Bob's Story"},
        )
        # Alice should see it
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["entity_type"] == "story"

    @pytest.mark.asyncio
    async def test_excludes_viewed_actions(
        self, db_session: AsyncSession, user_alice: User, shared_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=user_alice.id,
            action="viewed",
            entity_type="legacy",
            entity_id=shared_legacy.id,
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 0

    @pytest.mark.asyncio
    async def test_excludes_non_member_activity(
        self,
        db_session: AsyncSession,
        user_alice: User,
        user_eve: User,
        shared_legacy: Legacy,
    ):
        # Eve (not a member) does something on another legacy
        other_person = Person(canonical_name="Eve Legacy")
        db_session.add(other_person)
        await db_session.flush()

        eve_legacy = Legacy(
            name="Eve's Legacy",
            visibility="public",
            created_by=user_eve.id,
            person_id=other_person.id,
        )
        db_session.add(eve_legacy)
        await db_session.flush()

        db_session.add(
            LegacyMember(legacy_id=eve_legacy.id, user_id=user_eve.id, role="creator")
        )
        await db_session.commit()

        await activity_service.record_activity(
            db=db_session,
            user_id=user_eve.id,
            action="created",
            entity_type="legacy",
            entity_id=eve_legacy.id,
        )
        # Alice should NOT see Eve's activity
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert len(result["items"]) == 0

    @pytest.mark.asyncio
    async def test_excludes_non_member_actor_on_scoped_entity(
        self,
        db_session: AsyncSession,
        user_alice: User,
        user_eve: User,
        shared_legacy: Legacy,
    ):
        """Non-members who act on a public in-scope entity must not appear in the feed.

        Eve is not a member of shared_legacy. If she favorites it (possible for public
        legacies), her activity row has entity_id == shared_legacy.id — which is in
        Alice's membership scope — but she is not a co-member. Before the actor
        co-membership check was added, Eve's activity would have leaked into Alice's feed.
        """
        await activity_service.record_activity(
            db=db_session,
            user_id=user_eve.id,
            action="favorited",
            entity_type="legacy",
            entity_id=shared_legacy.id,
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        actor_ids = [item["actor"]["id"] for item in result["items"]]
        assert user_eve.id not in actor_ids, (
            "Non-member Eve's activity on a scoped entity must not appear in Alice's feed"
        )

    @pytest.mark.asyncio
    async def test_includes_enriched_entity_data(
        self, db_session: AsyncSession, user_alice: User, shared_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=user_alice.id,
            action="updated",
            entity_type="legacy",
            entity_id=shared_legacy.id,
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert result["items"][0]["entity"] is not None
        assert result["items"][0]["entity"]["name"] == "Shared Legacy"

    @pytest.mark.asyncio
    async def test_pagination(
        self,
        db_session: AsyncSession,
        user_alice: User,
        shared_legacy: Legacy,
    ):
        for i in range(4):
            await activity_service.record_activity(
                db=db_session,
                user_id=user_alice.id,
                action="updated",
                entity_type="legacy",
                entity_id=shared_legacy.id,
                metadata={"index": i},
            )
        page1 = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id, limit=2
        )
        assert len(page1["items"]) == 2
        assert page1["has_more"] is True

        from datetime import datetime

        cursor = datetime.fromisoformat(page1["next_cursor"])
        page2 = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id, limit=2, cursor=cursor
        )
        assert len(page2["items"]) == 2


class TestSocialFeedNoMembership:
    """Social feed behaviour for users who have no legacy memberships."""

    @pytest.mark.asyncio
    async def test_own_conversation_activity_appears_with_no_memberships(
        self, db_session: AsyncSession, user_eve: User
    ):
        """A user with no LegacyMember rows should still see their own conversation activity."""
        conv_id = uuid4()
        await activity_service.record_activity(
            db=db_session,
            user_id=user_eve.id,
            action="ai_conversation_started",
            entity_type="conversation",
            entity_id=conv_id,
            metadata={"persona_id": "default"},
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_eve.id
        )
        assert result["items"], (
            "Expected own conversation activity for user with no memberships"
        )
        assert result["items"][0]["entity_type"] == "conversation"
        assert result["items"][0]["entity_id"] == conv_id

    @pytest.mark.asyncio
    async def test_own_media_activity_appears_with_no_memberships(
        self, db_session: AsyncSession, user_eve: User
    ):
        """A user with no LegacyMember rows should still see their own media activity."""
        media_id = uuid4()
        await activity_service.record_activity(
            db=db_session,
            user_id=user_eve.id,
            action="created",
            entity_type="media",
            entity_id=media_id,
            metadata={"filename": "photo.jpg"},
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_eve.id
        )
        assert result["items"], (
            "Expected own media activity for user with no memberships"
        )
        assert result["items"][0]["entity_type"] == "media"
        assert result["items"][0]["entity_id"] == media_id

    @pytest.mark.asyncio
    async def test_viewed_actions_excluded_even_with_no_memberships(
        self, db_session: AsyncSession, user_eve: User
    ):
        """Ephemeral 'viewed' actions should still be excluded from the feed."""
        legacy_id = uuid4()
        await activity_service.record_activity(
            db=db_session,
            user_id=user_eve.id,
            action="viewed",
            entity_type="legacy",
            entity_id=legacy_id,
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_eve.id
        )
        assert result["items"] == [], (
            "Expected 'viewed' actions to be excluded from feed"
        )
