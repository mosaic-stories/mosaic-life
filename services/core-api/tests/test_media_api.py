"""Integration tests for media API endpoints."""

import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import MediaLegacy, MediaPerson, MediaTag
from app.models.legacy import Legacy
from app.models.media import Media
from app.models.person import Person
from app.models.tag import Tag
from app.models.user import User


class TestRequestUploadUrl:
    """Tests for POST /api/media/upload-url."""

    @pytest.mark.asyncio
    async def test_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test requesting upload URL."""
        response = await client.post(
            "/api/media/upload-url",
            headers=auth_headers,
            json={
                "filename": "photo.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 1024,
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "upload_url" in data
        assert "media_id" in data
        assert "storage_path" in data
        assert data["upload_url"].startswith("/media/")
        assert data["storage_path"].startswith(f"users/{test_user.id}/")

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
    ):
        """Test upload URL requires authentication."""
        response = await client.post(
            "/api/media/upload-url",
            json={
                "filename": "photo.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 1024,
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_size_exceeded(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test upload URL rejected for oversized file."""
        response = await client.post(
            "/api/media/upload-url",
            headers=auth_headers,
            json={
                "filename": "large.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 20 * 1024 * 1024,  # 20 MB
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
        )
        assert response.status_code == 400
        assert "exceeds maximum" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_invalid_content_type(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test upload URL rejected for invalid content type."""
        response = await client.post(
            "/api/media/upload-url",
            headers=auth_headers,
            json={
                "filename": "doc.pdf",
                "content_type": "application/pdf",
                "size_bytes": 1024,
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
        )
        assert response.status_code == 400
        assert "not allowed" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_non_member_rejected(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_user_2: User,
    ):
        """Test upload URL rejected for non-members when associating with a legacy."""
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            google_id=test_user_2.google_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        response = await client.post(
            "/api/media/upload-url",
            headers=headers,
            json={
                "filename": "photo.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 1024,
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
        )
        assert response.status_code == 403


class TestListMedia:
    """Tests for GET /api/media."""

    @pytest.mark.asyncio
    async def test_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test listing legacy media."""
        response = await client.get(
            "/api/media/",
            params={"legacy_id": str(test_legacy.id)},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["filename"] == "test-image.jpg"
        assert data[0]["id"] == str(test_media.id)
        assert "download_url" in data[0]

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
    ):
        """Test listing media requires authentication."""
        response = await client.get(
            "/api/media/",
            params={"legacy_id": str(test_legacy.id)},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_empty_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test listing media returns empty list when none exist."""
        response = await client.get(
            "/api/media/",
            params={"legacy_id": str(test_legacy.id)},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data == []

    @pytest.mark.asyncio
    async def test_lists_user_media_without_legacy_filter(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_media: Media,
    ):
        """Test listing all user-owned media when no legacy filter is provided."""
        response = await client.get(
            "/api/media/",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(test_media.id)
        assert data[0]["legacies"][0]["legacy_id"]


class TestGetMedia:
    """Tests for GET /api/media/{media_id}."""

    @pytest.mark.asyncio
    async def test_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_media: Media,
        db_session: AsyncSession,
    ):
        """Test getting media details."""
        person = Person(canonical_name="Tagged Person")
        db_session.add(person)
        await db_session.flush()

        tag = Tag(
            name="wedding", legacy_id=test_legacy.id, created_by=test_media.owner_id
        )
        db_session.add(tag)
        await db_session.flush()

        test_media.caption = "Ceremony photo"
        test_media.date_taken = "1962"
        test_media.location = "Chicago"
        test_media.era = "1960s"
        db_session.add(MediaTag(media_id=test_media.id, tag_id=tag.id))
        db_session.add(
            MediaPerson(
                media_id=test_media.id,
                person_id=person.id,
                role="subject",
            )
        )
        await db_session.commit()

        response = await client.get(
            f"/api/media/{test_media.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test-image.jpg"
        assert data["id"] == str(test_media.id)
        assert "download_url" in data
        assert data["download_url"].startswith("/media/")
        assert "storage_path" in data
        assert data["caption"] == "Ceremony photo"
        assert data["date_taken"] == "1962"
        assert data["location"] == "Chicago"
        assert data["era"] == "1960s"
        assert data["tags"] == [{"id": str(tag.id), "name": "wedding"}]
        assert data["people"] == [
            {
                "person_id": str(person.id),
                "person_name": "Tagged Person",
                "role": "subject",
            }
        ]


class TestMediaTags:
    """Tests for POST /api/media/{media_id}/tags."""

    @pytest.mark.asyncio
    async def test_rejects_cross_legacy_tag_attachment(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy_2: Legacy,
        test_media: Media,
    ):
        response = await client.post(
            f"/api/media/{test_media.id}/tags",
            params={"legacy_id": str(test_legacy_2.id)},
            headers=auth_headers,
            json={"name": "cross-legacy"},
        )

        assert response.status_code == 400
        assert "associated with this media" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test getting non-existent media returns 404."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.get(
            f"/api/media/{fake_id}",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestDeleteMedia:
    """Tests for DELETE /api/media/{media_id}."""

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test deleting media requires authentication."""
        response = await client.delete(
            f"/api/media/{test_media.id}",
        )
        assert response.status_code == 401


class TestSetProfileImage:
    """Tests for PATCH /api/legacies/{legacy_id}/profile-image."""

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test setting profile image requires authentication."""
        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/profile-image",
            json={"media_id": str(test_media.id)},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_media_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test setting profile image with non-existent media returns 404."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/profile-image",
            headers=auth_headers,
            json={"media_id": str(fake_id)},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_clear_profile_image_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test successfully clearing profile image."""
        test_legacy.profile_image_id = test_media.id

        response = await client.delete(
            f"/api/legacies/{test_legacy.id}/profile-image",
            headers=auth_headers,
        )
        assert response.status_code == 204

        detail = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )
        assert detail.status_code == 200
        assert detail.json()["profile_image_id"] is None


class TestSetBackgroundImage:
    """Tests for PATCH /api/legacies/{legacy_id}/background-image."""

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test setting background image requires authentication."""
        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/background-image",
            json={"media_id": str(test_media.id)},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_media_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test setting background image with non-associated media returns 404."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/background-image",
            headers=auth_headers,
            json={"media_id": str(fake_id)},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_set_background_image_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test successfully setting background image."""
        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/background-image",
            headers=auth_headers,
            json={"media_id": str(test_media.id)},
        )
        assert response.status_code == 204

        # Verify via legacy detail
        detail = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )
        assert detail.status_code == 200
        assert detail.json()["background_image_id"] == str(test_media.id)

    @pytest.mark.asyncio
    async def test_clear_background_image_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test successfully clearing background image."""
        test_legacy.background_image_id = test_media.id

        response = await client.delete(
            f"/api/legacies/{test_legacy.id}/background-image",
            headers=auth_headers,
        )
        assert response.status_code == 204

        detail = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )
        assert detail.status_code == 200
        assert detail.json()["background_image_id"] is None


class TestAddMediaLegacyAssociation:
    """Tests for POST /api/media/{media_id}/legacy-associations."""

    @pytest.mark.asyncio
    async def test_adds_association_for_new_legacy(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_media: Media,
        test_legacy_2: Legacy,
        db_session: AsyncSession,
    ):
        """Test attaching owned media to another legacy the user belongs to."""
        response = await client.post(
            f"/api/media/{test_media.id}/legacy-associations",
            headers=auth_headers,
            json={
                "legacy_id": str(test_legacy_2.id),
                "role": "secondary",
                "position": 1,
            },
        )
        assert response.status_code == 200

        assoc_result = await db_session.execute(
            select(MediaLegacy).where(
                MediaLegacy.media_id == test_media.id,
                MediaLegacy.legacy_id == test_legacy_2.id,
            )
        )
        association = assoc_result.scalar_one_or_none()
        assert association is not None
        assert association.role == "secondary"
        assert association.position == 1
