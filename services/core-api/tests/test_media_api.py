"""Integration tests for media API endpoints."""

import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient

from app.models.legacy import Legacy
from app.models.media import Media
from app.models.user import User


class TestRequestUploadUrl:
    """Tests for POST /api/legacies/{legacy_id}/media/upload-url."""

    @pytest.mark.asyncio
    async def test_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test requesting upload URL."""
        response = await client.post(
            f"/api/legacies/{test_legacy.id}/media/upload-url",
            headers=auth_headers,
            json={
                "filename": "photo.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 1024,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "upload_url" in data
        assert "media_id" in data
        assert "storage_path" in data
        assert data["storage_path"].startswith(f"legacy/{test_legacy.id}/")

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
    ):
        """Test upload URL requires authentication."""
        response = await client.post(
            f"/api/legacies/{test_legacy.id}/media/upload-url",
            json={
                "filename": "photo.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 1024,
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
            f"/api/legacies/{test_legacy.id}/media/upload-url",
            headers=auth_headers,
            json={
                "filename": "large.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 20 * 1024 * 1024,  # 20 MB
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
            f"/api/legacies/{test_legacy.id}/media/upload-url",
            headers=auth_headers,
            json={
                "filename": "doc.pdf",
                "content_type": "application/pdf",
                "size_bytes": 1024,
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
        """Test upload URL rejected for non-members."""
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
            f"/api/legacies/{test_legacy.id}/media/upload-url",
            headers=headers,
            json={
                "filename": "photo.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 1024,
            },
        )
        assert response.status_code == 403


class TestListMedia:
    """Tests for GET /api/legacies/{legacy_id}/media."""

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
            f"/api/legacies/{test_legacy.id}/media",
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
            f"/api/legacies/{test_legacy.id}/media",
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
            f"/api/legacies/{test_legacy.id}/media",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data == []


class TestGetMedia:
    """Tests for GET /api/legacies/{legacy_id}/media/{media_id}."""

    @pytest.mark.asyncio
    async def test_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test getting media details."""
        response = await client.get(
            f"/api/legacies/{test_legacy.id}/media/{test_media.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test-image.jpg"
        assert data["id"] == str(test_media.id)
        assert "download_url" in data
        assert "storage_path" in data

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
            f"/api/legacies/{test_legacy.id}/media/{fake_id}",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestDeleteMedia:
    """Tests for DELETE /api/legacies/{legacy_id}/media/{media_id}."""

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_media: Media,
    ):
        """Test deleting media requires authentication."""
        response = await client.delete(
            f"/api/legacies/{test_legacy.id}/media/{test_media.id}",
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
