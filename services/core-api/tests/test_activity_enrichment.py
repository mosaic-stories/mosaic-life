"""Tests for activity entity enrichment."""

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.associations import StoryLegacy
from app.models.story_version import StoryVersion
from app.models.person import Person
from app.models.user import User
from app.services.activity import enrich_entities


@pytest_asyncio.fixture
async def enrichment_user(db_session: AsyncSession) -> User:
    """Create a user for enrichment tests."""
    user = User(
        email="enrich@example.com",
        google_id="google_enrich_123",
        name="Enrichment User",
        username="enrich-user-0001",
        avatar_url="https://example.com/enrich.jpg",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def enrichment_legacy(db_session: AsyncSession, enrichment_user: User) -> Legacy:
    """Create a legacy for enrichment tests."""
    person = Person(canonical_name="Enrichment Legacy")
    db_session.add(person)
    await db_session.flush()

    legacy = Legacy(
        name="Enrichment Legacy",
        biography="A test legacy for enrichment",
        birth_date=None,
        death_date=None,
        visibility="public",
        created_by=enrichment_user.id,
        person_id=person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    member = LegacyMember(
        legacy_id=legacy.id,
        user_id=enrichment_user.id,
        role="creator",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


@pytest_asyncio.fixture
async def enrichment_story(
    db_session: AsyncSession, enrichment_user: User, enrichment_legacy: Legacy
) -> Story:
    """Create a story for enrichment tests."""
    story = Story(
        author_id=enrichment_user.id,
        title="Enrichment Story",
        content="Content for enrichment testing.",
        visibility="public",
    )
    db_session.add(story)
    await db_session.flush()

    sl = StoryLegacy(
        story_id=story.id,
        legacy_id=enrichment_legacy.id,
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
        created_by=enrichment_user.id,
    )
    db_session.add(version)
    await db_session.flush()
    story.active_version_id = version.id
    await db_session.commit()
    await db_session.refresh(story)
    return story


class TestEnrichEntities:
    @pytest.mark.asyncio
    async def test_enriches_legacy(
        self, db_session: AsyncSession, enrichment_legacy: Legacy
    ):
        result = await enrich_entities(
            db=db_session,
            items=[("legacy", enrichment_legacy.id)],
        )
        entity = result.get(("legacy", enrichment_legacy.id))
        assert entity is not None
        assert entity["name"] == "Enrichment Legacy"
        assert entity["visibility"] == "public"

    @pytest.mark.asyncio
    async def test_enriches_story(
        self,
        db_session: AsyncSession,
        enrichment_story: Story,
        enrichment_legacy: Legacy,
        enrichment_user: User,
    ):
        result = await enrich_entities(
            db=db_session,
            items=[("story", enrichment_story.id)],
        )
        entity = result.get(("story", enrichment_story.id))
        assert entity is not None
        assert entity["title"] == "Enrichment Story"
        assert entity["legacy_id"] == str(enrichment_legacy.id)

    @pytest.mark.asyncio
    async def test_returns_none_for_deleted_entity(self, db_session: AsyncSession):
        result = await enrich_entities(
            db=db_session,
            items=[("legacy", uuid4())],
        )
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_handles_empty_input(self, db_session: AsyncSession):
        result = await enrich_entities(db=db_session, items=[])
        assert result == {}
