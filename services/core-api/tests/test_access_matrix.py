"""Golden story access matrix across detail, list, and retrieval surfaces."""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.legacy_link import LegacyLink, LegacyLinkShare
from app.models.person import Person
from app.models.story import Story
from app.models.user import User
from app.services.retrieval import resolve_visibility_filter
from app.services.story import list_legacy_stories
from app.services.story_access import (
    can_read_story,
    can_write_story,
    require_story_read_access,
    require_story_write_access,
)
from tests.conftest import create_auth_headers_for_user


async def _user(db: AsyncSession, label: str) -> User:
    suffix = uuid4().hex[:8]
    user = User(
        email=f"{label}-{suffix}@example.com",
        google_id=f"google-{label}-{suffix}",
        provider="google",
        provider_id=f"google-{label}-{suffix}",
        name=label.title(),
        username=f"{label}-{suffix}",
    )
    db.add(user)
    await db.flush()
    return user


async def _legacy(db: AsyncSession, name: str, creator: User) -> Legacy:
    person = Person(canonical_name=name)
    db.add(person)
    await db.flush()
    legacy = Legacy(
        name=name,
        created_by=creator.id,
        visibility="private",
        person_id=person.id,
    )
    db.add(legacy)
    await db.flush()
    db.add(LegacyMember(legacy_id=legacy.id, user_id=creator.id, role="creator"))
    await db.flush()
    return legacy


async def _member(
    db: AsyncSession, legacy: Legacy, user: User, role: str
) -> LegacyMember:
    member = LegacyMember(legacy_id=legacy.id, user_id=user.id, role=role)
    db.add(member)
    await db.flush()
    return member


async def _story(
    db: AsyncSession,
    *,
    author: User,
    legacy: Legacy,
    visibility: str,
    status: str = "published",
    title: str | None = None,
) -> Story:
    story = Story(
        author_id=author.id,
        title=title or f"{visibility} story",
        content="Matrix content",
        visibility=visibility,
        status=status,
    )
    db.add(story)
    await db.flush()
    db.add(
        StoryLegacy(
            story_id=story.id,
            legacy_id=legacy.id,
            role="primary",
            position=0,
        )
    )
    await db.flush()
    return story


async def _matrix_context(db: AsyncSession) -> tuple[Legacy, dict[str, User]]:
    creator = await _user(db, "creator")
    legacy = await _legacy(db, "Matrix Legacy", creator)
    users = {
        "author": await _user(db, "author"),
        "creator": creator,
        "admin": await _user(db, "admin"),
        "advocate": await _user(db, "advocate"),
        "admirer": await _user(db, "admirer"),
        "non_member": await _user(db, "non-member"),
    }
    await _member(db, legacy, users["author"], "advocate")
    await _member(db, legacy, users["admin"], "admin")
    await _member(db, legacy, users["advocate"], "advocate")
    await _member(db, legacy, users["admirer"], "admirer")
    await db.commit()
    return legacy, users


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("visibility", "requester", "detail_status", "listed", "retrieval"),
    [
        ("public", "author", 200, True, True),
        ("public", "creator", 200, True, True),
        ("public", "admin", 200, True, True),
        ("public", "advocate", 200, True, True),
        ("public", "admirer", 200, True, True),
        ("public", "non_member", 200, True, False),
        ("private", "author", 200, True, True),
        ("private", "creator", 200, True, True),
        ("private", "admin", 200, True, True),
        ("private", "advocate", 200, True, True),
        ("private", "admirer", 200, True, True),
        ("private", "non_member", 403, False, False),
        ("personal", "author", 200, True, True),
        ("personal", "creator", 403, False, True),
        ("personal", "admin", 403, False, True),
        ("personal", "advocate", 403, False, True),
        ("personal", "admirer", 403, False, True),
        ("personal", "non_member", 403, False, False),
    ],
)
async def test_story_access_matrix(
    db_session: AsyncSession,
    client: AsyncClient,
    visibility: str,
    requester: str,
    detail_status: int,
    listed: bool,
    retrieval: bool,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility=visibility,
    )
    await db_session.commit()

    user = users[requester]
    response = await client.get(
        f"/api/stories/{story.id}",
        headers=create_auth_headers_for_user(user),
    )
    assert response.status_code == detail_status

    summaries = await list_legacy_stories(db_session, user.id, legacy_id=legacy.id)
    assert (story.id in {summary.id for summary in summaries}) is listed

    if requester == "non_member":
        with pytest.raises(Exception):
            await resolve_visibility_filter(db_session, user.id, legacy.id)
    else:
        visibility_filter = await resolve_visibility_filter(
            db_session, user.id, legacy.id
        )
        if visibility == "personal" and requester != "author":
            assert visibility_filter.personal_author_id == user.id
        else:
            assert (visibility in visibility_filter.allowed_visibilities) is retrieval


@pytest.mark.asyncio
async def test_draft_story_is_404_to_non_author(
    db_session: AsyncSession,
    client: AsyncClient,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility="private",
        status="draft",
    )
    await db_session.commit()

    response = await client.get(
        f"/api/stories/{story.id}",
        headers=create_auth_headers_for_user(users["admirer"]),
    )
    assert response.status_code == 404

    summaries = await list_legacy_stories(
        db_session, users["admirer"].id, legacy_id=legacy.id
    )
    assert story.id not in {summary.id for summary in summaries}


@pytest.mark.asyncio
async def test_shared_story_read_helper_hides_drafts_from_non_authors(
    db_session: AsyncSession,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility="private",
        status="draft",
    )
    await db_session.commit()

    loaded = await require_story_read_access(db_session, story.id, users["author"].id)
    assert loaded.id == story.id

    with pytest.raises(HTTPException) as exc:
        await require_story_read_access(db_session, story.id, users["admirer"].id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_private_story_read_allows_member_of_multiple_associated_legacies(
    db_session: AsyncSession,
) -> None:
    legacy, users = await _matrix_context(db_session)
    second_legacy = await _legacy(db_session, "Second Matrix Legacy", users["creator"])
    await _member(db_session, second_legacy, users["admirer"], "admirer")
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility="private",
    )
    db_session.add(
        StoryLegacy(
            story_id=story.id,
            legacy_id=second_legacy.id,
            role="related",
            position=1,
        )
    )
    await db_session.commit()
    loaded_story = (
        await db_session.execute(
            select(Story)
            .options(selectinload(Story.legacy_associations))
            .where(Story.id == story.id)
        )
    ).scalar_one()

    allowed, reason = await can_read_story(
        db_session, loaded_story, users["admirer"].id
    )

    assert allowed is True
    assert reason == "member"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    (
        "share_mode",
        "share_selected",
        "link_status",
        "expected_status",
        "expected_listed",
    ),
    [
        ("all", False, "active", 200, True),
        ("selective", True, "active", 200, True),
        ("selective", False, "active", 403, False),
        ("all", False, "revoked", 403, False),
    ],
)
async def test_legacy_link_access_matrix(
    db_session: AsyncSession,
    client: AsyncClient,
    share_mode: str,
    share_selected: bool,
    link_status: str,
    expected_status: int,
    expected_listed: bool,
) -> None:
    receiver_creator = await _user(db_session, "receiver")
    source_creator = await _user(db_session, "source")
    receiver = await _legacy(db_session, "Receiver", receiver_creator)
    source = await _legacy(db_session, "Source", source_creator)
    story = await _story(
        db_session,
        author=source_creator,
        legacy=source,
        visibility="private",
    )
    link = LegacyLink(
        person_id=receiver.person_id,
        requester_legacy_id=receiver.id,
        target_legacy_id=source.id,
        requested_by=receiver_creator.id,
        status=link_status,
        target_share_mode=share_mode,
    )
    db_session.add(link)
    await db_session.flush()
    if share_selected:
        db_session.add(
            LegacyLinkShare(
                legacy_link_id=link.id,
                source_legacy_id=source.id,
                resource_type="story",
                resource_id=story.id,
                shared_by=source_creator.id,
            )
        )
    await db_session.commit()

    response = await client.get(
        f"/api/stories/{story.id}",
        headers=create_auth_headers_for_user(receiver_creator),
    )
    assert response.status_code == expected_status

    summaries = await list_legacy_stories(
        db_session, receiver_creator.id, legacy_id=receiver.id
    )
    assert (story.id in {summary.id for summary in summaries}) is expected_listed


# ---------------------------------------------------------------------------
# `require_story_write_access` / `can_write_story` — canonical write gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("visibility", ["public", "private", "personal"])
async def test_write_access_allows_author(
    db_session: AsyncSession,
    visibility: str,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility=visibility,
    )
    await db_session.commit()

    loaded = await require_story_write_access(db_session, story.id, users["author"].id)
    assert loaded.id == story.id


@pytest.mark.asyncio
async def test_write_access_allows_author_on_own_draft(
    db_session: AsyncSession,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility="private",
        status="draft",
    )
    await db_session.commit()

    loaded = await require_story_write_access(db_session, story.id, users["author"].id)
    assert loaded.id == story.id


@pytest.mark.asyncio
async def test_write_access_denies_non_author_on_readable_story(
    db_session: AsyncSession,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility="public",
    )
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await require_story_write_access(
            db_session,
            story.id,
            users["non_member"].id,
            action="rewrite",
        )
    assert exc.value.status_code == 403
    assert "rewrite" in exc.value.detail


@pytest.mark.asyncio
async def test_write_access_denies_non_member_on_private_story(
    db_session: AsyncSession,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility="private",
    )
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await require_story_write_access(db_session, story.id, users["non_member"].id)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not authorized to view this story"


@pytest.mark.asyncio
async def test_write_access_hides_draft_existence_from_non_author(
    db_session: AsyncSession,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility="private",
        status="draft",
    )
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await require_story_write_access(db_session, story.id, users["admirer"].id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_write_access_missing_story_is_404(
    db_session: AsyncSession,
) -> None:
    _legacy_obj, users = await _matrix_context(db_session)

    with pytest.raises(HTTPException) as exc:
        await require_story_write_access(db_session, uuid4(), users["author"].id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_can_write_story_reasons(
    db_session: AsyncSession,
) -> None:
    legacy, users = await _matrix_context(db_session)
    story = await _story(
        db_session,
        author=users["author"],
        legacy=legacy,
        visibility="public",
    )
    await db_session.commit()

    allowed, reason = await can_write_story(story, users["author"].id)
    assert allowed is True
    assert reason == "author"

    denied, deny_reason = await can_write_story(story, users["non_member"].id)
    assert denied is False
    assert deny_reason == "not_author"
