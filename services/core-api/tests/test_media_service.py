"""Tests for media service."""

from pathlib import Path
import pytest
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.storage import LocalStorageAdapter
from app.models.associations import MediaLegacy, MediaPerson, MediaTag
from app.models.legacy import Legacy
from app.models.media import Media
from app.models.person import Person
from app.models.tag import Tag
from app.models.user import User
from app.schemas.associations import LegacyAssociationCreate
from app.schemas.media import UploadUrlRequest
from app.services import media as media_service


class TestValidateUploadRequest:
    """Tests for upload request validation."""

    def test_size_exceeded(self):
        """Test validation rejects oversized files."""
        data = UploadUrlRequest(
            filename="large.jpg",
            content_type="image/jpeg",
            size_bytes=20 * 1024 * 1024,  # 20 MB
        )
        with pytest.raises(HTTPException) as exc:
            media_service.validate_upload_request(data)
        assert exc.value.status_code == 400
        assert "exceeds maximum" in exc.value.detail

    def test_invalid_content_type(self):
        """Test validation rejects invalid content types."""
        data = UploadUrlRequest(
            filename="doc.pdf",
            content_type="application/pdf",
            size_bytes=1024,
        )
        with pytest.raises(HTTPException) as exc:
            media_service.validate_upload_request(data)
        assert exc.value.status_code == 400
        assert "not allowed" in exc.value.detail

    def test_valid_request_passes(self):
        """Test validation passes for valid request."""
        data = UploadUrlRequest(
            filename="photo.jpg",
            content_type="image/jpeg",
            size_bytes=1024,
        )
        # Should not raise
        media_service.validate_upload_request(data)

    def test_all_allowed_types(self):
        """Test validation accepts all allowed content types."""
        allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
        for content_type in allowed_types:
            data = UploadUrlRequest(
                filename="photo.ext",
                content_type=content_type,
                size_bytes=1024,
            )
            # Should not raise
            media_service.validate_upload_request(data)


class TestGetFileExtension:
    """Tests for file extension extraction."""

    def test_standard_extension(self):
        """Test standard file extension."""
        assert media_service.get_file_extension("photo.jpg") == ".jpg"

    def test_uppercase_extension(self):
        """Test uppercase extension is normalized to lowercase."""
        assert media_service.get_file_extension("photo.JPEG") == ".jpeg"

    def test_no_extension(self):
        """Test file without extension."""
        assert media_service.get_file_extension("no-extension") == ""

    def test_multiple_dots(self):
        """Test file with multiple dots."""
        assert media_service.get_file_extension("my.photo.jpg") == ".jpg"

    def test_hidden_file(self):
        """Test hidden file (starts with dot)."""
        assert media_service.get_file_extension(".gitignore") == ""

    def test_empty_string(self):
        """Test empty filename."""
        assert media_service.get_file_extension("") == ""


class TestGenerateStoragePath:
    """Tests for user-scoped storage path generation."""

    def test_uses_owner_prefix(
        self,
        test_user: User,
    ):
        """Storage path should be scoped to `users/{owner_id}`."""
        media_id = uuid4()
        path = media_service.generate_storage_path(test_user.id, media_id, ".jpg")

        assert path.startswith(f"users/{test_user.id}/")
        assert path.endswith(".jpg")


class TestLocalStorageAdapter:
    """Tests for local storage URL generation."""

    def test_uses_relative_urls_for_local_dev(self, tmp_path: Path):
        """Local media URLs should stay same-origin via the dev proxy."""
        adapter = LocalStorageAdapter(
            str(tmp_path), "http://beelink.projecthewitt.info:8080"
        )

        assert (
            adapter.generate_upload_url("users/test/file.jpg", "image/jpeg")
            == "/media/users/test/file.jpg"
        )
        assert (
            adapter.generate_download_url("users/test/file.jpg")
            == "/media/users/test/file.jpg"
        )


class TestRequestUploadUrlAssociations:
    """Tests for upload URL request with owner and legacy associations."""

    @pytest.mark.asyncio
    async def test_creates_owner_scoped_media_and_associations(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        monkeypatch: pytest.MonkeyPatch,
    ):
        """Request upload persists owner_id and legacy association rows."""

        class DummyStorage:
            def generate_upload_url(self, storage_path: str, content_type: str) -> str:
                return f"https://example.test/upload/{storage_path}?type={content_type}"

        monkeypatch.setattr(
            media_service, "get_storage_adapter", lambda: DummyStorage()
        )

        data = UploadUrlRequest(
            filename="family-photo.jpg",
            content_type="image/jpeg",
            size_bytes=1024,
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id,
                    role="primary",
                    position=0,
                )
            ],
        )

        result = await media_service.request_upload_url(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )

        media_result = await db_session.execute(
            select(Media).where(Media.id == result.media_id)
        )
        media = media_result.scalar_one()
        assert media.owner_id == test_user.id
        assert media.storage_path.startswith(f"users/{test_user.id}/")

        associations_result = await db_session.execute(
            select(MediaLegacy).where(MediaLegacy.media_id == result.media_id)
        )
        associations = associations_result.scalars().all()
        assert len(associations) == 1
        assert associations[0].legacy_id == test_legacy.id
        assert associations[0].role == "primary"


class TestGetMediaDetail:
    """Tests for full media detail assembly."""

    @pytest.mark.asyncio
    async def test_includes_metadata_tags_and_people(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_media: Media,
        monkeypatch: pytest.MonkeyPatch,
    ):
        class DummyStorage:
            def generate_download_url(self, storage_path: str) -> str:
                return f"https://example.test/download/{storage_path}"

        monkeypatch.setattr(
            media_service, "get_storage_adapter", lambda: DummyStorage()
        )

        person = Person(canonical_name="Service Tagged Person")
        tag = Tag(name="service-tag", legacy_id=test_legacy.id, created_by=test_user.id)
        db_session.add_all([person, tag])
        await db_session.flush()

        test_media.caption = "Service caption"
        test_media.date_taken = "1958"
        test_media.location = "Detroit"
        test_media.era = "1950s"
        db_session.add(MediaTag(media_id=test_media.id, tag_id=tag.id))
        db_session.add(
            MediaPerson(
                media_id=test_media.id,
                person_id=person.id,
                role="family",
            )
        )
        await db_session.commit()

        detail = await media_service.get_media_detail(
            db=db_session,
            user_id=test_user.id,
            media_id=test_media.id,
        )

        assert detail.caption == "Service caption"
        assert detail.date_taken == "1958"
        assert detail.location == "Detroit"
        assert detail.era == "1950s"
        assert len(detail.tags) == 1
        assert detail.tags[0].id == tag.id
        assert detail.tags[0].name == "service-tag"
        assert detail.people[0].person_id == person.id
        assert detail.people[0].person_name == "Service Tagged Person"
        assert detail.people[0].role == "family"


class TestAddMediaTag:
    """Tests for add_media_tag legacy enforcement."""

    @pytest.mark.asyncio
    async def test_rejects_legacy_not_associated_with_media(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy_2: Legacy,
        test_media: Media,
    ):
        with pytest.raises(HTTPException) as exc:
            await media_service.add_media_tag(
                db=db_session,
                user_id=test_user.id,
                media_id=test_media.id,
                legacy_id=test_legacy_2.id,
                tag_name="invalid-scope",
            )

        assert exc.value.status_code == 400
        assert "associated with this media" in exc.value.detail
