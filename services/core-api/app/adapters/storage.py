# services/core-api/app/adapters/storage.py
"""Storage adapter for media files."""

import logging
from abc import ABC, abstractmethod
from pathlib import Path

import boto3  # type: ignore
from botocore.config import Config as BotoConfig  # type: ignore
from botocore.exceptions import ClientError  # type: ignore[import-untyped]

from ..config import get_settings

logger = logging.getLogger(__name__)


class StorageAdapter(ABC):
    """Abstract base class for storage adapters."""

    @abstractmethod
    def generate_upload_url(self, path: str, content_type: str) -> str:
        """Generate a URL for uploading a file."""
        pass

    @abstractmethod
    def generate_download_url(self, path: str) -> str:
        """Generate a URL for downloading a file."""
        pass

    @abstractmethod
    def file_exists(self, path: str) -> bool:
        """Check if a file exists at the given path."""
        pass

    @abstractmethod
    def get_file_size(self, path: str) -> int | None:
        """Get the size in bytes of the file at the given path.

        Returns:
            File size in bytes, or None if the file does not exist.
        """
        pass

    @abstractmethod
    def delete_file(self, path: str) -> None:
        """Delete a file at the given path."""
        pass


class LocalStorageAdapter(StorageAdapter):
    """Storage adapter for local filesystem (development)."""

    def __init__(self, base_path: str, api_url: str):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def generate_upload_url(self, path: str, content_type: str) -> str:
        """Generate local upload URL."""
        # Ensure parent directory exists
        full_path = self.base_path / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        # Use a relative path so local dev can stay same-origin via the web proxy.
        return f"/media/{path}"

    def generate_download_url(self, path: str) -> str:
        """Generate local download URL."""
        # Use a relative path so local dev can stay same-origin via the web proxy.
        return f"/media/{path}"

    def file_exists(self, path: str) -> bool:
        """Check if file exists locally."""
        full_path = self.base_path / path
        return full_path.exists() and full_path.is_file()

    def get_file_size(self, path: str) -> int | None:
        """Get the size in bytes of a local file, or None if it doesn't exist."""
        full_path = self.base_path / path
        if not full_path.exists() or not full_path.is_file():
            return None
        return full_path.stat().st_size

    def delete_file(self, path: str) -> None:
        """Delete file from local storage."""
        full_path = self.base_path / path
        if full_path.exists():
            full_path.unlink()
            logger.info("file.deleted", extra={"path": path})


class S3StorageAdapter(StorageAdapter):
    """Storage adapter for AWS S3 or any S3-compatible service (e.g. rustfs/MinIO)."""

    def __init__(
        self,
        bucket: str,
        region: str,
        endpoint_url: str | None = None,
        internal_endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
    ):
        self.bucket = bucket
        settings = get_settings()
        self.upload_expiry = settings.upload_url_expiry_seconds
        self.download_expiry = settings.download_url_expiry_seconds

        creds: dict[str, str] = {}
        if access_key_id and secret_access_key:
            creds = {
                "aws_access_key_id": access_key_id,
                "aws_secret_access_key": secret_access_key,
            }

        # Presigned-URL client — uses the public endpoint so generated URLs are
        # browser-accessible.  Path-style addressing is required for custom endpoints.
        self._presigned_client = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url,
            config=BotoConfig(
                signature_version="s3v4",
                s3={"addressing_style": "path" if endpoint_url else "auto"},
            ),
            **creds,
        )

        # Operations client — uses the internal Docker endpoint when available so
        # head_object / delete_object don't have to traverse the public DNS path
        # (which resolves to 127.0.0.1 from inside a container).
        ops_endpoint = internal_endpoint_url or endpoint_url
        self._ops_client = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=ops_endpoint,
            config=BotoConfig(
                signature_version="s3v4",
                s3={"addressing_style": "path" if ops_endpoint else "auto"},
            ),
            **creds,
        )

    def generate_upload_url(self, path: str, content_type: str) -> str:
        """Generate S3 presigned upload URL."""
        url = self._presigned_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": path,
                "ContentType": content_type,
            },
            ExpiresIn=self.upload_expiry,
        )
        logger.info("s3.upload_url_generated", extra={"path": path})
        return str(url)

    def generate_download_url(self, path: str) -> str:
        """Generate S3 presigned download URL."""
        url = self._presigned_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": path,
            },
            ExpiresIn=self.download_expiry,
        )
        return str(url)

    def file_exists(self, path: str) -> bool:
        """Check if file exists in S3."""
        try:
            self._ops_client.head_object(Bucket=self.bucket, Key=path)
            return True
        except ClientError:
            return False

    def get_file_size(self, path: str) -> int | None:
        """Get the size in bytes of an S3 object, or None if it doesn't exist."""
        try:
            response = self._ops_client.head_object(Bucket=self.bucket, Key=path)
            return int(response["ContentLength"])
        except ClientError:
            return None

    def delete_file(self, path: str) -> None:
        """Delete file from S3."""
        self._ops_client.delete_object(Bucket=self.bucket, Key=path)
        logger.info("s3.file_deleted", extra={"path": path})


def get_storage_adapter() -> StorageAdapter:
    """Get the configured storage adapter."""
    settings = get_settings()

    if settings.storage_backend == "s3":
        if not settings.s3_media_bucket:
            raise ValueError("S3_MEDIA_BUCKET required when STORAGE_BACKEND=s3")
        return S3StorageAdapter(
            bucket=settings.s3_media_bucket,
            region=settings.aws_region,
            endpoint_url=settings.s3_endpoint_url,
            internal_endpoint_url=settings.s3_internal_endpoint_url,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
        )
    else:
        return LocalStorageAdapter(
            base_path=settings.local_media_path,
            api_url=settings.api_url,
        )
