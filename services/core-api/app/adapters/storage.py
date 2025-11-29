# services/core-api/app/adapters/storage.py
"""Storage adapter for media files."""

import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path

import boto3
from botocore.config import Config as BotoConfig

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
    def delete_file(self, path: str) -> None:
        """Delete a file at the given path."""
        pass


class LocalStorageAdapter(StorageAdapter):
    """Storage adapter for local filesystem (development)."""

    def __init__(self, base_path: str, api_url: str):
        self.base_path = Path(base_path)
        self.api_url = api_url.rstrip("/")
        self.base_path.mkdir(parents=True, exist_ok=True)

    def generate_upload_url(self, path: str, content_type: str) -> str:
        """Generate local upload URL."""
        # Ensure parent directory exists
        full_path = self.base_path / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        return f"{self.api_url}/media/{path}"

    def generate_download_url(self, path: str) -> str:
        """Generate local download URL."""
        return f"{self.api_url}/media/{path}"

    def file_exists(self, path: str) -> bool:
        """Check if file exists locally."""
        full_path = self.base_path / path
        return full_path.exists() and full_path.is_file()

    def delete_file(self, path: str) -> None:
        """Delete file from local storage."""
        full_path = self.base_path / path
        if full_path.exists():
            full_path.unlink()
            logger.info("file.deleted", extra={"path": path})


class S3StorageAdapter(StorageAdapter):
    """Storage adapter for AWS S3 (production)."""

    def __init__(self, bucket: str, region: str):
        self.bucket = bucket
        self.region = region
        self.client = boto3.client(
            "s3",
            region_name=region,
            config=BotoConfig(signature_version="s3v4"),
        )
        settings = get_settings()
        self.upload_expiry = settings.upload_url_expiry_seconds
        self.download_expiry = settings.download_url_expiry_seconds

    def generate_upload_url(self, path: str, content_type: str) -> str:
        """Generate S3 presigned upload URL."""
        url = self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": path,
                "ContentType": content_type,
            },
            ExpiresIn=self.upload_expiry,
        )
        logger.info("s3.upload_url_generated", extra={"path": path})
        return url

    def generate_download_url(self, path: str) -> str:
        """Generate S3 presigned download URL."""
        url = self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": path,
            },
            ExpiresIn=self.download_expiry,
        )
        return url

    def file_exists(self, path: str) -> bool:
        """Check if file exists in S3."""
        try:
            self.client.head_object(Bucket=self.bucket, Key=path)
            return True
        except self.client.exceptions.ClientError:
            return False

    def delete_file(self, path: str) -> None:
        """Delete file from S3."""
        self.client.delete_object(Bucket=self.bucket, Key=path)
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
        )
    else:
        return LocalStorageAdapter(
            base_path=settings.local_media_path,
            api_url=settings.api_url,
        )
