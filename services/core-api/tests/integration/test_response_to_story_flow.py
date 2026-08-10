"""Integration tests for the response-to-story conversion feature.

Covers: create-from-response wiring (both FKs, note fields, backlinks),
author-only conversion, author-only dismissal, story-author-only + note-only
hiding, hidden-note list filtering, and FK-driven restore/backlink-drop on
delete (`ondelete="SET NULL"`).
"""

from collections.abc import AsyncGenerator
from uuid import UUID

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.story_response import StoryResponse as StoryResponseModel
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


@pytest_asyncio.fixture
async def fk_enforced_db_session(
    db_session: AsyncSession,
) -> AsyncGenerator[AsyncSession, None]:
    """`db_session`, but with SQLite FK enforcement turned on for the test.

    SQLite ignores foreign keys (including ``ON DELETE SET NULL``) unless
    ``PRAGMA foreign_keys=ON`` is issued per-connection; the shared test
    engine does not enable it (unlike Postgres, which always enforces FKs).
    Enforcement is turned back off in a `finally` so teardown
    (`Base.metadata.drop_all`) isn't tripped up by the pre-existing
    `ai_conversations`/`stories` circular FK (see the SAWarning emitted at
    teardown across the whole suite) — this is scoped to just the two tests
    that need to observe real `ON DELETE SET NULL` behavior, not flipped
    globally in conftest.py where it could affect unrelated tests.
    """
    await db_session.execute(text("PRAGMA foreign_keys=ON"))
    try:
        yield db_session
    finally:
        await db_session.execute(text("PRAGMA foreign_keys=OFF"))


async def _add_member(db: AsyncSession, legacy_id, user_id, role: str) -> None:
    db.add(LegacyMember(legacy_id=legacy_id, user_id=user_id, role=role))
    await db.commit()


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


async def _create_response(
    client: AsyncClient, story_id, headers: dict[str, str], body: str
) -> str:
    resp = await client.post(
        f"/api/stories/{story_id}/responses",
        json={"body": body},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def _convert_response(
    client: AsyncClient,
    response_id: str,
    legacy_id,
    headers: dict[str, str],
    content: str = "A memory worth its own page, seeded verbatim.",
) -> str:
    resp = await client.post(
        "/api/stories/",
        json={
            "content": content,
            "legacies": [{"legacy_id": str(legacy_id)}],
            "source_response_id": response_id,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


class TestCreateFromResponse:
    @pytest.mark.asyncio
    async def test_convert_sets_both_fks(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story: Story,
    ):
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A memory too big for a comment."
        )
        new_story_id = await _convert_response(
            client, response_id, test_legacy.id, auth_headers
        )

        new_story = await db_session.get(Story, UUID(new_story_id))
        assert new_story is not None
        assert new_story.source_story_id == test_story.id

        response_row = await db_session.get(StoryResponseModel, UUID(response_id))
        assert response_row is not None
        assert response_row.converted_story_id == UUID(new_story_id)

    @pytest.mark.asyncio
    async def test_note_fields_present_after_conversion(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story: Story,
    ):
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A memory too big for a comment."
        )
        new_story_id = await _convert_response(
            client, response_id, test_legacy.id, auth_headers
        )

        list_resp = await client.get(
            f"/api/stories/{test_story.id}/responses", headers=auth_headers
        )
        items = list_resp.json()["items"]
        assert len(items) == 1
        item = items[0]
        assert item["converted_story_id"] == new_story_id
        assert item["converted_story"]["id"] == new_story_id
        assert item["converted_story"]["legacy_id"] == str(test_legacy.id)
        assert item["hidden"] is False
        assert item["offer_dismissed_at"] is None

    @pytest.mark.asyncio
    async def test_converted_story_summary_respects_viewer_read_access(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        note_author_headers = create_auth_headers_for_user(test_user_2)

        response_id = await _create_response(
            client, test_story.id, note_author_headers, "A private memory."
        )
        create_resp = await client.post(
            "/api/stories/",
            json={
                "title": "Only Mine",
                "content": "This grew from my response, but remains personal.",
                "visibility": "personal",
                "legacies": [{"legacy_id": str(test_legacy.id)}],
                "source_response_id": response_id,
            },
            headers=note_author_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        new_story_id = create_resp.json()["id"]

        list_as_story_author = await client.get(
            f"/api/stories/{test_story.id}/responses", headers=auth_headers
        )
        item_for_story_author = next(
            item
            for item in list_as_story_author.json()["items"]
            if item["id"] == response_id
        )
        assert item_for_story_author["converted_story_id"] == new_story_id
        assert item_for_story_author["converted_story"] is None

        list_as_note_author = await client.get(
            f"/api/stories/{test_story.id}/responses", headers=note_author_headers
        )
        item_for_note_author = next(
            item
            for item in list_as_note_author.json()["items"]
            if item["id"] == response_id
        )
        assert item_for_note_author["converted_story"]["id"] == new_story_id

    @pytest.mark.asyncio
    async def test_backlink_fields_on_new_story_and_source_story(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story: Story,
    ):
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A memory too big for a comment."
        )
        new_story_id = await _convert_response(
            client, response_id, test_legacy.id, auth_headers
        )

        new_story_detail = await client.get(
            f"/api/stories/{new_story_id}", headers=auth_headers
        )
        assert new_story_detail.status_code == 200
        source_story = new_story_detail.json()["source_story"]
        assert source_story is not None
        assert source_story["id"] == str(test_story.id)
        assert source_story["title"] == test_story.title

        source_story_detail = await client.get(
            f"/api/stories/{test_story.id}", headers=auth_headers
        )
        assert source_story_detail.status_code == 200
        grown = source_story_detail.json()["grown_from_responses"]
        assert len(grown) == 1
        assert grown[0]["id"] == new_story_id

    @pytest.mark.asyncio
    async def test_convert_denied_for_non_author(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        response_id = await _create_response(
            client, test_story.id, auth_headers, "My own long memory, not yours."
        )

        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        other_headers = create_auth_headers_for_user(test_user_2)

        resp = await client.post(
            "/api/stories/",
            json={
                "content": "Stolen memory",
                "legacies": [{"legacy_id": str(test_legacy.id)}],
                "source_response_id": response_id,
            },
            headers=other_headers,
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_convert_denied_for_nonexistent_response(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = await client.post(
            "/api/stories/",
            json={
                "content": "No such response",
                "legacies": [{"legacy_id": str(test_legacy.id)}],
                "source_response_id": fake_id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_convert_denied_for_mismatched_legacy(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy_2: Legacy,
        test_story: Story,
    ):
        """The converted story must share a legacy with the source response's
        story — an arbitrary `legacies` list would produce a confusing
        cross-legacy backlink and violate the offer's "same legacy" contract.
        """
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A memory that belongs here."
        )

        resp = await client.post(
            "/api/stories/",
            json={
                "content": "Wrong legacy entirely",
                "legacies": [{"legacy_id": str(test_legacy_2.id)}],
                "source_response_id": response_id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_convert_denied_for_already_converted_response(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story: Story,
    ):
        """Converting the same response twice would silently relink the note
        and orphan its first converted story — must be rejected.
        """
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A memory worth its own page."
        )
        await _convert_response(client, response_id, test_legacy.id, auth_headers)

        resp = await client.post(
            "/api/stories/",
            json={
                "content": "Trying to convert it again",
                "legacies": [{"legacy_id": str(test_legacy.id)}],
                "source_response_id": response_id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_converted_note_cannot_be_edited(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story: Story,
    ):
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A memory too big for a comment."
        )
        await _convert_response(client, response_id, test_legacy.id, auth_headers)

        resp = await client.patch(
            f"/api/stories/{test_story.id}/responses/{response_id}",
            json={"body": "Trying to edit the note anyway."},
            headers=auth_headers,
        )
        assert resp.status_code == 400


class TestDismissOffer:
    @pytest.mark.asyncio
    async def test_author_can_dismiss(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A response."
        )

        resp = await client.post(
            f"/api/stories/{test_story.id}/responses/{response_id}/dismiss-offer",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["offer_dismissed_at"] is not None

    @pytest.mark.asyncio
    async def test_non_author_cannot_dismiss(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A response."
        )

        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        other_headers = create_auth_headers_for_user(test_user_2)

        resp = await client.post(
            f"/api/stories/{test_story.id}/responses/{response_id}/dismiss-offer",
            headers=other_headers,
        )
        assert resp.status_code == 403


class TestHideNote:
    @pytest.mark.asyncio
    async def test_story_author_can_hide_note(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        note_author_headers = create_auth_headers_for_user(test_user_2)

        response_id = await _create_response(
            client, test_story.id, note_author_headers, "A memory of my own."
        )
        await _convert_response(
            client, response_id, test_legacy.id, note_author_headers
        )

        resp = await client.post(
            f"/api/stories/{test_story.id}/responses/{response_id}/hide",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["hidden"] is True

    @pytest.mark.asyncio
    async def test_hide_rejected_for_non_note(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A normal, unconverted response."
        )

        resp = await client.post(
            f"/api/stories/{test_story.id}/responses/{response_id}/hide",
            headers=auth_headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_hide_rejected_for_non_story_author(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        # test_user (auth_headers) is both the story author and the note's
        # own author here; test_user_2 is a legacy *admin* (not the story
        # author) and must still be denied — hide is story-author-only, not
        # a general legacy-admin power.
        response_id = await _create_response(
            client, test_story.id, auth_headers, "A memory of my own story."
        )
        await _convert_response(client, response_id, test_legacy.id, auth_headers)

        await _add_member(db_session, test_legacy.id, test_user_2.id, "admin")
        admin_headers = create_auth_headers_for_user(test_user_2)

        resp = await client.post(
            f"/api/stories/{test_story.id}/responses/{response_id}/hide",
            headers=admin_headers,
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_hidden_note_filtered_for_others_but_visible_to_author(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        note_author_headers = create_auth_headers_for_user(test_user_2)

        response_id = await _create_response(
            client, test_story.id, note_author_headers, "A memory of my own."
        )
        await _convert_response(
            client, response_id, test_legacy.id, note_author_headers
        )

        hide_resp = await client.post(
            f"/api/stories/{test_story.id}/responses/{response_id}/hide",
            headers=auth_headers,
        )
        assert hide_resp.status_code == 200

        # The note's own author still sees it.
        list_as_author = await client.get(
            f"/api/stories/{test_story.id}/responses", headers=note_author_headers
        )
        ids = [item["id"] for item in list_as_author.json()["items"]]
        assert response_id in ids

        # A third, unrelated member does not see it.
        third_user = await _make_user(db_session, "third@example.com", "third-member")
        await _add_member(db_session, test_legacy.id, third_user.id, "advocate")
        third_headers = create_auth_headers_for_user(third_user)
        list_as_third = await client.get(
            f"/api/stories/{test_story.id}/responses", headers=third_headers
        )
        ids_third = [item["id"] for item in list_as_third.json()["items"]]
        assert response_id not in ids_third

        # The story author (who hid it) does not see it either, since they
        # are not the note's own author.
        list_as_story_author = await client.get(
            f"/api/stories/{test_story.id}/responses", headers=auth_headers
        )
        ids_story_author = [item["id"] for item in list_as_story_author.json()["items"]]
        assert response_id not in ids_story_author


class TestRestoreAndBacklinkDrop:
    @pytest.mark.asyncio
    async def test_deleting_converted_story_restores_response(
        self,
        client: AsyncClient,
        fk_enforced_db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story: Story,
    ):
        db_session = fk_enforced_db_session

        response_id = await _create_response(
            client, test_story.id, auth_headers, "A memory worth its own page."
        )
        new_story_id = await _convert_response(
            client, response_id, test_legacy.id, auth_headers
        )

        response_row = await db_session.get(StoryResponseModel, UUID(response_id))
        assert response_row is not None
        assert response_row.converted_story_id == UUID(new_story_id)

        delete_resp = await client.delete(
            f"/api/stories/{new_story_id}", headers=auth_headers
        )
        assert delete_resp.status_code == 204

        # The Postgres ON DELETE SET NULL fires at the DB layer, invisible
        # to the ORM's unit-of-work — re-fetch rather than trust the
        # (possibly stale, expire_on_commit=False) identity-map object.
        await db_session.refresh(response_row)
        assert response_row.converted_story_id is None

        list_resp = await client.get(
            f"/api/stories/{test_story.id}/responses", headers=auth_headers
        )
        item = next(i for i in list_resp.json()["items"] if i["id"] == response_id)
        assert item["converted_story_id"] is None
        assert item["converted_story"] is None

    @pytest.mark.asyncio
    async def test_deleting_source_story_drops_backlink(
        self,
        client: AsyncClient,
        fk_enforced_db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_story: Story,
    ):
        db_session = fk_enforced_db_session

        response_id = await _create_response(
            client, test_story.id, auth_headers, "Another memory worth its own page."
        )
        new_story_id = await _convert_response(
            client, response_id, test_legacy.id, auth_headers
        )

        new_story_row = await db_session.get(Story, UUID(new_story_id))
        assert new_story_row is not None
        assert new_story_row.source_story_id == test_story.id

        delete_resp = await client.delete(
            f"/api/stories/{test_story.id}", headers=auth_headers
        )
        assert delete_resp.status_code == 204

        await db_session.refresh(new_story_row)
        assert new_story_row.source_story_id is None
