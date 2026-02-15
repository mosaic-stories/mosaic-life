# Media Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to upload images to legacies and set profile images.

**Architecture:** Direct-to-storage upload with presigned URLs. Storage adapter pattern supports local filesystem (dev) and S3 (prod). Media metadata stored in PostgreSQL.

**Tech Stack:** FastAPI, SQLAlchemy, boto3, React, TanStack Query

---

## Task 1: Media Model

**Files:**
- Create: `services/core-api/app/models/media.py`
- Modify: `services/core-api/app/models/__init__.py`

**Step 1: Create media model**

```python
# services/core-api/app/models/media.py
"""Media model for uploaded files."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base


class Media(Base):
    """Media model for uploaded files."""

    __tablename__ = "media"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    legacy_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("legacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)

    uploaded_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
        index=True,
    )

    # Relationships
    legacy: Mapped["Legacy"] = relationship("Legacy", foreign_keys=[legacy_id])
    uploader: Mapped["User"] = relationship("User", foreign_keys=[uploaded_by])

    def __repr__(self) -> str:
        return f"<Media(id={self.id}, filename={self.filename})>"
```

**Step 2: Update models __init__.py**

Add to `services/core-api/app/models/__init__.py`:

```python
from .media import Media
```

**Step 3: Commit**

```bash
git add services/core-api/app/models/media.py services/core-api/app/models/__init__.py
git commit -m "feat: add Media model for uploaded files"
```

---

## Task 2: Add profile_image_id to Legacy

**Files:**
- Modify: `services/core-api/app/models/legacy.py`

**Step 1: Add profile_image_id column**

Add to Legacy class in `services/core-api/app/models/legacy.py` after `updated_at`:

```python
    profile_image_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Add relationship after existing relationships
    profile_image: Mapped["Media | None"] = relationship(
        "Media",
        foreign_keys=[profile_image_id],
        lazy="joined",
    )
```

Add import at top:

```python
from .media import Media
```

**Step 2: Commit**

```bash
git add services/core-api/app/models/legacy.py
git commit -m "feat: add profile_image_id to Legacy model"
```

---

## Task 3: Create Alembic Migration

**Files:**
- Create: `services/core-api/alembic/versions/xxxx_add_media_table.py`

**Step 1: Generate migration**

```bash
cd services/core-api
alembic revision --autogenerate -m "add media table and profile_image_id"
```

**Step 2: Verify migration**

Check the generated migration includes:
- Create `media` table with all columns
- Add `profile_image_id` to `legacies` table
- Foreign key constraints

**Step 3: Apply migration**

```bash
alembic upgrade head
```

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat: add migration for media table"
```

---

## Task 4: Config Updates

**Files:**
- Modify: `services/core-api/app/config.py`

**Step 1: Add storage config**

Add to Settings class in `services/core-api/app/config.py`:

```python
    # Storage Configuration
    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")
    local_media_path: str = os.getenv("LOCAL_MEDIA_PATH", "/app/media")

    # Upload limits
    max_upload_size_bytes: int = 10 * 1024 * 1024  # 10 MB
    upload_url_expiry_seconds: int = 300  # 5 minutes
    download_url_expiry_seconds: int = 900  # 15 minutes

    # Allowed content types
    allowed_content_types: list[str] = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
    ]
```

**Step 2: Commit**

```bash
git add services/core-api/app/config.py
git commit -m "feat: add storage configuration settings"
```

---

## Task 5: Storage Adapter

**Files:**
- Create: `services/core-api/app/adapters/storage.py`

**Step 1: Create storage adapter**

```python
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
```

**Step 2: Commit**

```bash
git add services/core-api/app/adapters/storage.py
git commit -m "feat: add storage adapter for local and S3"
```

---

## Task 6: Media Schemas

**Files:**
- Create: `services/core-api/app/schemas/media.py`

**Step 1: Create media schemas**

```python
# services/core-api/app/schemas/media.py
"""Pydantic schemas for Media API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class UploadUrlRequest(BaseModel):
    """Request for presigned upload URL."""

    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., min_length=1, max_length=100)
    size_bytes: int = Field(..., gt=0)


class UploadUrlResponse(BaseModel):
    """Response with presigned upload URL."""

    upload_url: str
    media_id: UUID
    storage_path: str


class MediaConfirmResponse(BaseModel):
    """Response after confirming upload."""

    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class MediaSummary(BaseModel):
    """Media item in list responses."""

    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    download_url: str
    uploaded_by: UUID
    uploader_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MediaDetail(BaseModel):
    """Full media item details."""

    id: UUID
    legacy_id: UUID
    filename: str
    content_type: str
    size_bytes: int
    storage_path: str
    download_url: str
    uploaded_by: UUID
    uploader_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SetProfileImageRequest(BaseModel):
    """Request to set legacy profile image."""

    media_id: UUID
```

**Step 2: Commit**

```bash
git add services/core-api/app/schemas/media.py
git commit -m "feat: add media Pydantic schemas"
```

---

## Task 7: Media Service

**Files:**
- Create: `services/core-api/app/services/media.py`

**Step 1: Create media service**

```python
# services/core-api/app/services/media.py
"""Service layer for media operations."""

import logging
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..adapters.storage import get_storage_adapter
from ..config import get_settings
from ..models.legacy import Legacy
from ..models.media import Media
from ..schemas.media import (
    MediaConfirmResponse,
    MediaDetail,
    MediaSummary,
    UploadUrlRequest,
    UploadUrlResponse,
)
from .legacy import check_legacy_access

logger = logging.getLogger(__name__)


def get_file_extension(filename: str) -> str:
    """Extract file extension from filename."""
    return Path(filename).suffix.lower()


def validate_upload_request(data: UploadUrlRequest) -> None:
    """Validate upload request parameters."""
    settings = get_settings()

    # Check file size
    if data.size_bytes > settings.max_upload_size_bytes:
        max_mb = settings.max_upload_size_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum of {max_mb:.0f} MB",
        )

    # Check content type
    if data.content_type not in settings.allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=f"Content type '{data.content_type}' not allowed. "
            f"Allowed: {', '.join(settings.allowed_content_types)}",
        )


async def request_upload_url(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    data: UploadUrlRequest,
) -> UploadUrlResponse:
    """Generate presigned upload URL and create pending media record."""
    # Check user has access to legacy
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="member",
    )

    # Validate request
    validate_upload_request(data)

    # Generate storage path
    media_id = uuid4()
    ext = get_file_extension(data.filename)
    storage_path = f"legacy/{legacy_id}/{media_id}{ext}"

    # Create media record (pending)
    media = Media(
        id=media_id,
        legacy_id=legacy_id,
        filename=data.filename,
        content_type=data.content_type,
        size_bytes=data.size_bytes,
        storage_path=storage_path,
        uploaded_by=user_id,
    )
    db.add(media)
    await db.commit()

    # Generate upload URL
    storage = get_storage_adapter()
    upload_url = storage.generate_upload_url(storage_path, data.content_type)

    logger.info(
        "media.upload_url_generated",
        extra={
            "media_id": str(media_id),
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
            "filename": data.filename,
        },
    )

    return UploadUrlResponse(
        upload_url=upload_url,
        media_id=media_id,
        storage_path=storage_path,
    )


async def confirm_upload(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> MediaConfirmResponse:
    """Confirm upload completed and verify file exists."""
    # Load media record
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.legacy_id == legacy_id,
        )
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check user is the uploader
    if media.uploaded_by != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Verify file exists in storage
    storage = get_storage_adapter()
    if not storage.file_exists(media.storage_path):
        raise HTTPException(
            status_code=400,
            detail="File not found in storage. Upload may have failed.",
        )

    logger.info(
        "media.upload_confirmed",
        extra={
            "media_id": str(media_id),
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )

    return MediaConfirmResponse(
        id=media.id,
        filename=media.filename,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        created_at=media.created_at,
    )


async def list_legacy_media(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> list[MediaSummary]:
    """List all media for a legacy."""
    # Check user has access to legacy
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="member",
    )

    result = await db.execute(
        select(Media)
        .options(selectinload(Media.uploader))
        .where(Media.legacy_id == legacy_id)
        .order_by(Media.created_at.desc())
    )
    media_list = result.scalars().all()

    storage = get_storage_adapter()

    return [
        MediaSummary(
            id=m.id,
            filename=m.filename,
            content_type=m.content_type,
            size_bytes=m.size_bytes,
            download_url=storage.generate_download_url(m.storage_path),
            uploaded_by=m.uploaded_by,
            uploader_name=m.uploader.name,
            created_at=m.created_at,
        )
        for m in media_list
    ]


async def get_media_detail(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> MediaDetail:
    """Get single media item with download URL."""
    # Check user has access to legacy
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="member",
    )

    result = await db.execute(
        select(Media)
        .options(selectinload(Media.uploader))
        .where(
            Media.id == media_id,
            Media.legacy_id == legacy_id,
        )
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    storage = get_storage_adapter()

    return MediaDetail(
        id=media.id,
        legacy_id=media.legacy_id,
        filename=media.filename,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        storage_path=media.storage_path,
        download_url=storage.generate_download_url(media.storage_path),
        uploaded_by=media.uploaded_by,
        uploader_name=media.uploader.name,
        created_at=media.created_at,
    )


async def delete_media(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> None:
    """Delete media file and record."""
    # Check user has access as creator or editor
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="member",
    )

    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.legacy_id == legacy_id,
        )
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Only uploader or legacy creator can delete
    legacy_result = await db.execute(
        select(Legacy).where(Legacy.id == legacy_id)
    )
    legacy = legacy_result.scalar_one()

    if media.uploaded_by != user_id and legacy.created_by != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only uploader or legacy creator can delete",
        )

    # Delete from storage
    storage = get_storage_adapter()
    storage.delete_file(media.storage_path)

    # Delete record
    await db.delete(media)
    await db.commit()

    logger.info(
        "media.deleted",
        extra={
            "media_id": str(media_id),
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )


async def set_profile_image(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> None:
    """Set legacy profile image from existing media."""
    # Check user is creator or editor
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="editor",
    )

    # Verify media exists and belongs to legacy
    media_result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.legacy_id == legacy_id,
        )
    )
    media = media_result.scalar_one_or_none()

    if not media:
        raise HTTPException(
            status_code=404,
            detail="Media not found in this legacy",
        )

    # Update legacy
    legacy_result = await db.execute(
        select(Legacy).where(Legacy.id == legacy_id)
    )
    legacy = legacy_result.scalar_one()
    legacy.profile_image_id = media_id

    await db.commit()

    logger.info(
        "legacy.profile_image_set",
        extra={
            "legacy_id": str(legacy_id),
            "media_id": str(media_id),
            "user_id": str(user_id),
        },
    )
```

**Step 2: Commit**

```bash
git add services/core-api/app/services/media.py
git commit -m "feat: add media service layer"
```

---

## Task 8: Media Routes

**Files:**
- Create: `services/core-api/app/routes/media.py`
- Modify: `services/core-api/app/main.py`

**Step 1: Create media routes**

```python
# services/core-api/app/routes/media.py
"""API routes for media management."""

import logging
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.storage import LocalStorageAdapter, get_storage_adapter
from ..auth.middleware import require_auth
from ..config import get_settings
from ..database import get_db
from ..schemas.media import (
    MediaConfirmResponse,
    MediaDetail,
    MediaSummary,
    SetProfileImageRequest,
    UploadUrlRequest,
    UploadUrlResponse,
)
from ..services import media as media_service

router = APIRouter(prefix="/api/legacies", tags=["media"])
logger = logging.getLogger(__name__)


@router.post(
    "/{legacy_id}/media/upload-url",
    response_model=UploadUrlResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request upload URL",
)
async def request_upload_url(
    legacy_id: UUID,
    data: UploadUrlRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UploadUrlResponse:
    """Request a presigned URL for uploading media."""
    session = require_auth(request)
    return await media_service.request_upload_url(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        data=data,
    )


@router.post(
    "/{legacy_id}/media/{media_id}/confirm",
    response_model=MediaConfirmResponse,
    summary="Confirm upload",
)
async def confirm_upload(
    legacy_id: UUID,
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaConfirmResponse:
    """Confirm that file upload completed successfully."""
    session = require_auth(request)
    return await media_service.confirm_upload(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=media_id,
    )


@router.get(
    "/{legacy_id}/media",
    response_model=list[MediaSummary],
    summary="List legacy media",
)
async def list_media(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[MediaSummary]:
    """List all media for a legacy."""
    session = require_auth(request)
    return await media_service.list_legacy_media(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
    )


@router.get(
    "/{legacy_id}/media/{media_id}",
    response_model=MediaDetail,
    summary="Get media details",
)
async def get_media(
    legacy_id: UUID,
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaDetail:
    """Get single media item with download URL."""
    session = require_auth(request)
    return await media_service.get_media_detail(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=media_id,
    )


@router.delete(
    "/{legacy_id}/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete media",
)
async def delete_media(
    legacy_id: UUID,
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete media file and record."""
    session = require_auth(request)
    await media_service.delete_media(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=media_id,
    )


@router.patch(
    "/{legacy_id}/profile-image",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set profile image",
)
async def set_profile_image(
    legacy_id: UUID,
    data: SetProfileImageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Set legacy profile image from existing media."""
    session = require_auth(request)
    await media_service.set_profile_image(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=data.media_id,
    )


# Local storage routes (development only)
local_router = APIRouter(prefix="/media", tags=["media-local"])


@local_router.put("/{path:path}")
async def upload_local_file(
    path: str,
    request: Request,
) -> Response:
    """Accept file upload to local storage (dev only)."""
    settings = get_settings()
    if settings.storage_backend != "local":
        raise HTTPException(status_code=404, detail="Not found")

    # Validate path doesn't escape
    base_path = Path(settings.local_media_path)
    full_path = (base_path / path).resolve()
    if not str(full_path).startswith(str(base_path.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    # Create parent directories
    full_path.parent.mkdir(parents=True, exist_ok=True)

    # Write file
    body = await request.body()
    full_path.write_bytes(body)

    logger.info("local.file_uploaded", extra={"path": path})
    return Response(status_code=200)


@local_router.get("/{path:path}")
async def serve_local_file(path: str) -> FileResponse:
    """Serve file from local storage (dev only)."""
    settings = get_settings()
    if settings.storage_backend != "local":
        raise HTTPException(status_code=404, detail="Not found")

    # Validate path doesn't escape
    base_path = Path(settings.local_media_path)
    full_path = (base_path / path).resolve()
    if not str(full_path).startswith(str(base_path.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(full_path)
```

**Step 2: Register routes in main.py**

Add to `services/core-api/app/main.py`:

```python
from .routes.media import router as media_router, local_router as media_local_router

# After other router includes
app.include_router(media_router)
app.include_router(media_local_router)
```

**Step 3: Commit**

```bash
git add services/core-api/app/routes/media.py services/core-api/app/main.py
git commit -m "feat: add media API routes"
```

---

## Task 9: Docker Compose Volume

**Files:**
- Modify: `infra/compose/docker-compose.yml`
- Modify: `infra/compose/.env` (or `.env.example`)

**Step 1: Add media volume to docker-compose.yml**

Add to core-api service volumes:

```yaml
    volumes:
      - ../../services/core-api/app:/app/app:ro
      - ../../services/core-api/alembic:/app/alembic:ro
      - ../../services/core-api/tests:/app/tests:ro
      - media-data:/app/media  # Add this line
```

Add to volumes section:

```yaml
volumes:
  postgres-data:
    driver: local
  web-node-modules:
    driver: local
  media-data:  # Add this
    driver: local
```

**Step 2: Add environment variables**

Add to `.env` file:

```
STORAGE_BACKEND=local
LOCAL_MEDIA_PATH=/app/media
```

**Step 3: Commit**

```bash
git add infra/compose/docker-compose.yml infra/compose/.env
git commit -m "feat: add media volume to docker-compose"
```

---

## Task 10: Backend Tests

**Files:**
- Create: `services/core-api/tests/test_media_service.py`
- Create: `services/core-api/tests/test_media_api.py`
- Modify: `services/core-api/tests/conftest.py`

**Step 1: Add media fixture to conftest.py**

Add to `services/core-api/tests/conftest.py`:

```python
from app.models.media import Media

@pytest_asyncio.fixture
async def test_media(db_session: AsyncSession, test_user: User, test_legacy: Legacy) -> Media:
    """Create a test media item."""
    media = Media(
        legacy_id=test_legacy.id,
        filename="test-image.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        storage_path=f"legacy/{test_legacy.id}/test-media-id.jpg",
        uploaded_by=test_user.id,
    )
    db_session.add(media)
    await db_session.commit()
    await db_session.refresh(media)
    return media
```

**Step 2: Create test_media_service.py**

```python
# services/core-api/tests/test_media_service.py
"""Tests for media service."""

import pytest
from fastapi import HTTPException

from app.schemas.media import UploadUrlRequest
from app.services import media as media_service


@pytest.mark.asyncio
async def test_validate_upload_request_size_exceeded():
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


@pytest.mark.asyncio
async def test_validate_upload_request_invalid_content_type():
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


@pytest.mark.asyncio
async def test_get_file_extension():
    """Test file extension extraction."""
    assert media_service.get_file_extension("photo.jpg") == ".jpg"
    assert media_service.get_file_extension("photo.JPEG") == ".jpeg"
    assert media_service.get_file_extension("no-extension") == ""
```

**Step 3: Create test_media_api.py**

```python
# services/core-api/tests/test_media_api.py
"""Tests for media API endpoints."""

import pytest
from httpx import AsyncClient

from app.models.legacy import Legacy
from app.models.media import Media
from app.models.user import User


@pytest.mark.asyncio
async def test_request_upload_url(
    client: AsyncClient,
    auth_headers: dict,
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


@pytest.mark.asyncio
async def test_request_upload_url_size_exceeded(
    client: AsyncClient,
    auth_headers: dict,
    test_legacy: Legacy,
):
    """Test upload URL rejected for oversized file."""
    response = await client.post(
        f"/api/legacies/{test_legacy.id}/media/upload-url",
        headers=auth_headers,
        json={
            "filename": "large.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 20 * 1024 * 1024,
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_list_media(
    client: AsyncClient,
    auth_headers: dict,
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


@pytest.mark.asyncio
async def test_get_media_detail(
    client: AsyncClient,
    auth_headers: dict,
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
    assert "download_url" in data
```

**Step 4: Run tests**

```bash
cd services/core-api
pytest tests/test_media_service.py tests/test_media_api.py -v
```

**Step 5: Commit**

```bash
git add services/core-api/tests/
git commit -m "test: add media service and API tests"
```

---

## Task 11: Frontend API Client

**Files:**
- Create: `apps/web/src/lib/api/media.ts`

**Step 1: Create media API client**

```typescript
// apps/web/src/lib/api/media.ts
import { apiGet, apiPost, apiDelete } from './client';

export interface UploadUrlResponse {
  upload_url: string;
  media_id: string;
  storage_path: string;
}

export interface MediaItem {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  download_url: string;
  uploaded_by: string;
  uploader_name: string;
  created_at: string;
}

export interface MediaDetail extends MediaItem {
  legacy_id: string;
  storage_path: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File size exceeds maximum of 10 MB`;
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `File type '${file.type}' not allowed. Use JPEG, PNG, GIF, or WebP.`;
  }
  return null;
}

export async function requestUploadUrl(
  legacyId: string,
  file: File
): Promise<UploadUrlResponse> {
  return apiPost<UploadUrlResponse>(
    `/api/legacies/${legacyId}/media/upload-url`,
    {
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
    }
  );
}

export async function uploadFile(url: string, file: File): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
}

export async function confirmUpload(
  legacyId: string,
  mediaId: string
): Promise<MediaItem> {
  return apiPost<MediaItem>(
    `/api/legacies/${legacyId}/media/${mediaId}/confirm`
  );
}

export async function listMedia(legacyId: string): Promise<MediaItem[]> {
  return apiGet<MediaItem[]>(`/api/legacies/${legacyId}/media`);
}

export async function getMedia(
  legacyId: string,
  mediaId: string
): Promise<MediaDetail> {
  return apiGet<MediaDetail>(`/api/legacies/${legacyId}/media/${mediaId}`);
}

export async function deleteMedia(
  legacyId: string,
  mediaId: string
): Promise<void> {
  return apiDelete(`/api/legacies/${legacyId}/media/${mediaId}`);
}

export async function setProfileImage(
  legacyId: string,
  mediaId: string
): Promise<void> {
  return apiPost(`/api/legacies/${legacyId}/profile-image`, {
    media_id: mediaId,
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api/media.ts
git commit -m "feat: add media API client"
```

---

## Task 12: Frontend Hooks

**Files:**
- Create: `apps/web/src/lib/hooks/useMedia.ts`
- Modify: `apps/web/src/lib/hooks/index.ts`

**Step 1: Create media hooks**

```typescript
// apps/web/src/lib/hooks/useMedia.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listMedia,
  requestUploadUrl,
  uploadFile,
  confirmUpload,
  deleteMedia,
  setProfileImage,
  validateFile,
  type MediaItem,
} from '@/lib/api/media';
import { legacyKeys } from './useLegacies';

export const mediaKeys = {
  all: ['media'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (legacyId: string) => [...mediaKeys.lists(), legacyId] as const,
};

export function useLegacyMedia(legacyId: string | undefined) {
  return useQuery({
    queryKey: mediaKeys.list(legacyId!),
    queryFn: () => listMedia(legacyId!),
    enabled: !!legacyId,
  });
}

export function useMediaUpload(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<MediaItem> => {
      // Validate file
      const error = validateFile(file);
      if (error) {
        throw new Error(error);
      }

      // Step 1: Get upload URL
      const { upload_url, media_id } = await requestUploadUrl(legacyId, file);

      // Step 2: Upload file directly
      await uploadFile(upload_url, file);

      // Step 3: Confirm upload
      return await confirmUpload(legacyId, media_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
    },
  });
}

export function useDeleteMedia(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaId: string) => deleteMedia(legacyId, mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
    },
  });
}

export function useSetProfileImage(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaId: string) => setProfileImage(legacyId, mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.detail(legacyId) });
    },
  });
}
```

**Step 2: Update hooks index**

Add to `apps/web/src/lib/hooks/index.ts`:

```typescript
export * from './useMedia';
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/hooks/useMedia.ts apps/web/src/lib/hooks/index.ts
git commit -m "feat: add media React Query hooks"
```

---

## Task 13: MediaUploader Component

**Files:**
- Create: `apps/web/src/components/MediaUploader.tsx`

**Step 1: Create MediaUploader component**

```tsx
// apps/web/src/components/MediaUploader.tsx
import { useCallback, useState } from 'react';
import { Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { useMediaUpload } from '@/lib/hooks/useMedia';
import { validateFile } from '@/lib/api/media';

interface MediaUploaderProps {
  legacyId: string;
  onSuccess?: () => void;
}

export default function MediaUploader({ legacyId, onSuccess }: MediaUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useMediaUpload(legacyId);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setError(null);
      const file = files[0];

      // Validate before upload
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      try {
        await upload.mutateAsync(file);
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [upload, onSuccess]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
    },
    [handleFiles]
  );

  return (
    <div className="space-y-4">
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-neutral-300 hover:border-neutral-400'}
          ${upload.isPending ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleChange}
          disabled={upload.isPending}
        />

        {upload.isPending ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="size-8 animate-spin text-blue-500" />
            <p className="text-neutral-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="size-8 text-neutral-400" />
            <p className="text-neutral-600">
              Drag and drop an image, or click to select
            </p>
            <p className="text-sm text-neutral-400">
              JPEG, PNG, GIF, or WebP up to 10 MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="size-4" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="ml-auto"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/MediaUploader.tsx
git commit -m "feat: add MediaUploader component"
```

---

## Task 14: MediaGallery Component

**Files:**
- Create: `apps/web/src/components/MediaGallery.tsx`

**Step 1: Create MediaGallery component**

```tsx
// apps/web/src/components/MediaGallery.tsx
import { useState } from 'react';
import { Loader2, Trash2, Image as ImageIcon, Check } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useLegacyMedia, useDeleteMedia, useSetProfileImage } from '@/lib/hooks/useMedia';
import type { MediaItem } from '@/lib/api/media';

interface MediaGalleryProps {
  legacyId: string;
  profileImageId?: string | null;
  canEdit?: boolean;
}

export default function MediaGallery({
  legacyId,
  profileImageId,
  canEdit = false,
}: MediaGalleryProps) {
  const { data: media, isLoading, error } = useLegacyMedia(legacyId);
  const deleteMedia = useDeleteMedia(legacyId);
  const setProfileImage = useSetProfileImage(legacyId);

  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        Failed to load media gallery
      </div>
    );
  }

  if (!media || media.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <ImageIcon className="size-12 mx-auto text-neutral-300 mb-4" />
        <p>No photos yet</p>
        <p className="text-sm">Upload photos to get started</p>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMedia.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleSetProfile = async (mediaId: string) => {
    await setProfileImage.mutateAsync(mediaId);
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {media.map((item) => (
          <div
            key={item.id}
            className="aspect-square rounded-lg overflow-hidden bg-neutral-100 relative group cursor-pointer"
            onClick={() => setSelectedMedia(item)}
          >
            <img
              src={item.download_url}
              alt={item.filename}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            {item.id === profileImageId && (
              <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <Check className="size-3" />
                Profile
              </div>
            )}
            {canEdit && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {item.id !== profileImageId && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetProfile(item.id);
                    }}
                    disabled={setProfileImage.isPending}
                  >
                    Set as Profile
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(item);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className="max-w-4xl">
          {selectedMedia && (
            <>
              <img
                src={selectedMedia.download_url}
                alt={selectedMedia.filename}
                className="w-full max-h-[70vh] object-contain"
              />
              <div className="text-sm text-neutral-500 mt-2">
                <p>{selectedMedia.filename}</p>
                <p>
                  Uploaded by {selectedMedia.uploader_name} on{' '}
                  {new Date(selectedMedia.created_at).toLocaleDateString()}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Photo</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.filename}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMedia.isPending}
            >
              {deleteMedia.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/MediaGallery.tsx
git commit -m "feat: add MediaGallery component"
```

---

## Task 15: Update LegacyProfile Component

**Files:**
- Modify: `apps/web/src/components/LegacyProfile.tsx`

**Step 1: Import new components and hooks**

Replace mock data imports with real ones at top of file:

```typescript
// Remove this line:
// import { mediaItems } from '../lib/mockData';

// Add these imports:
import MediaUploader from './MediaUploader';
import MediaGallery from './MediaGallery';
```

**Step 2: Update media section**

Replace the media section (inside `{activeSection === 'media' && ...}`) with:

```tsx
{activeSection === 'media' && (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-neutral-900">Photo Gallery</h2>
    </div>

    {user && (
      <MediaUploader legacyId={legacyId} />
    )}

    <MediaGallery
      legacyId={legacyId}
      profileImageId={legacy.profile_image_id}
      canEdit={!!user}
    />
  </div>
)}
```

**Step 3: Update profile header to show actual image**

Replace the profile image placeholder (the div with Users icon) with:

```tsx
<div className="size-32 rounded-2xl overflow-hidden bg-neutral-100 flex-shrink-0">
  {legacy.profile_image_url ? (
    <img
      src={legacy.profile_image_url}
      alt={legacy.name}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center">
      <Users className="size-12 text-neutral-400" />
    </div>
  )}
</div>
```

**Step 4: Remove DemoBadge from Media tab**

In the nav section, update the Media button to remove the DemoBadge:

```tsx
<button
  onClick={() => setActiveSection('media')}
  className={`py-4 border-b-2 transition-colors ${
    activeSection === 'media'
      ? 'border-[rgb(var(--theme-primary))] text-neutral-900'
      : 'border-transparent text-neutral-500 hover:text-neutral-900'
  }`}
>
  Media Gallery
</button>
```

**Step 5: Commit**

```bash
git add apps/web/src/components/LegacyProfile.tsx
git commit -m "feat: integrate media upload and gallery in LegacyProfile"
```

---

## Task 16: Update Legacy API Types

**Files:**
- Modify: `apps/web/src/lib/api/legacies.ts`

**Step 1: Add profile_image fields to Legacy interface**

Update the Legacy interface:

```typescript
export interface Legacy {
  id: string;
  name: string;
  birth_date: string | null;
  death_date: string | null;
  biography: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator_email?: string | null;
  creator_name?: string | null;
  members?: LegacyMember[] | null;
  profile_image_id?: string | null;  // Add this
  profile_image_url?: string | null;  // Add this
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api/legacies.ts
git commit -m "feat: add profile_image fields to Legacy type"
```

---

## Task 17: Update Legacy Schema (Backend)

**Files:**
- Modify: `services/core-api/app/schemas/legacy.py`
- Modify: `services/core-api/app/services/legacy.py`

**Step 1: Add profile_image_url to response schemas**

Update legacy schemas to include profile image URL. The service layer should generate the presigned URL when returning legacy data.

Add to LegacyResponse and related schemas:

```python
profile_image_id: UUID | None = None
profile_image_url: str | None = None
```

**Step 2: Update service to include profile image URL**

In the legacy service, when returning a legacy, check if it has a profile_image and generate a download URL using the storage adapter.

**Step 3: Commit**

```bash
git add services/core-api/app/schemas/legacy.py services/core-api/app/services/legacy.py
git commit -m "feat: add profile_image_url to legacy responses"
```

---

## Task 18: End-to-End Testing

**Step 1: Start docker compose**

```bash
cd infra/compose
docker compose up -d
```

**Step 2: Run backend tests**

```bash
cd services/core-api
pytest -v
```

**Step 3: Manual testing**

1. Log in to the app
2. Navigate to a legacy
3. Go to Media Gallery tab
4. Upload an image (verify it appears)
5. Set image as profile (verify it shows in header)
6. Delete an image (verify it's removed)

**Step 4: Final commit**

```bash
git add .
git commit -m "test: verify media upload end-to-end"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Media model |
| 2 | Add profile_image_id to Legacy |
| 3 | Alembic migration |
| 4 | Config updates |
| 5 | Storage adapter |
| 6 | Media schemas |
| 7 | Media service |
| 8 | Media routes |
| 9 | Docker compose volume |
| 10 | Backend tests |
| 11 | Frontend API client |
| 12 | Frontend hooks |
| 13 | MediaUploader component |
| 14 | MediaGallery component |
| 15 | Update LegacyProfile |
| 16 | Update Legacy API types |
| 17 | Update Legacy schema (backend) |
| 18 | End-to-end testing |
