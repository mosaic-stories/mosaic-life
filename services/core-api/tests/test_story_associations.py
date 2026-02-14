"""Tests focused on story legacy association behavior."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.user import User
from app.schemas.associations import LegacyAssociationCreate
from app.schemas.story import StoryCreate, StoryUpdate
from app.services import story as story_service


@pytest.mark.asyncio
async def test_create_story_with_multiple_legacy_associations(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
) -> None:
    """Story creation persists primary/secondary legacy associations."""
    second_legacy = Legacy(
        name="Second Legacy",
        visibility="private",
        created_by=test_user.id,
    )
    db_session.add(second_legacy)
    await db_session.commit()

    created = await story_service.create_story(
        db=db_session,
        user_id=test_user.id,
        data=StoryCreate(
            title="Shared Memory",
            content="A story with multiple people.",
            visibility="private",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id,
                    role="primary",
                    position=0,
                ),
                LegacyAssociationCreate(
                    legacy_id=second_legacy.id,
                    role="secondary",
                    position=1,
                ),
            ],
        ),
    )

    assert len(created.legacies) == 2
    assert created.legacies[0].legacy_id == test_legacy.id
    assert created.legacies[0].role == "primary"
    assert created.legacies[1].legacy_id == second_legacy.id
    assert created.legacies[1].role == "secondary"


@pytest.mark.asyncio
async def test_update_story_replaces_associations(
    db_session: AsyncSession,
    test_user: User,
    test_legacy: Legacy,
    test_story_public: Story,
) -> None:
    """Updating `legacies` replaces existing associations and ordering."""
    third_legacy = Legacy(
        name="Third Legacy",
        visibility="private",
        created_by=test_user.id,
    )
    db_session.add(third_legacy)
    await db_session.flush()

    db_session.add(
        LegacyMember(
            legacy_id=third_legacy.id,
            user_id=test_user.id,
            role="creator",
        )
    )
    await db_session.commit()

    updated = await story_service.update_story(
        db=db_session,
        user_id=test_user.id,
        story_id=test_story_public.id,
        data=StoryUpdate(
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=third_legacy.id,
                    role="primary",
                    position=0,
                )
            ]
        ),
    )

    assert len(updated.legacies) == 1
    assert updated.legacies[0].legacy_id == third_legacy.id
    assert updated.legacies[0].role == "primary"

    result = await db_session.execute(
        select(StoryLegacy).where(StoryLegacy.story_id == test_story_public.id)
    )
    associations = result.scalars().all()
    assert len(associations) == 1
    assert associations[0].legacy_id == third_legacy.id


@pytest.mark.asyncio
async def test_orphaned_story_listing_returns_unassigned_owned_story(
    db_session: AsyncSession,
    test_user: User,
    test_story_public: Story,
) -> None:
    """Orphaned listing returns a user's stories with no legacy links."""
    delete_result = await db_session.execute(
        select(StoryLegacy).where(StoryLegacy.story_id == test_story_public.id)
    )
    for association in delete_result.scalars().all():
        await db_session.delete(association)
    await db_session.commit()

    orphaned = await story_service.list_legacy_stories(
        db=db_session,
        user_id=test_user.id,
        orphaned=True,
    )

    assert any(story.id == test_story_public.id for story in orphaned)
