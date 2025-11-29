"""Tests for media service."""

import pytest
from fastapi import HTTPException

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
