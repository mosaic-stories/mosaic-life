# Media Upload Feature Design

**Date:** 2025-01-29
**Status:** Approved

## Overview

Add media upload capability to Mosaic Life, allowing users to upload images to legacies and set profile images. Uses direct-to-storage upload pattern with presigned URLs.

## Decisions

| Decision | Choice |
|----------|--------|
| Upload flow | Direct-to-storage with presigned URLs |
| Data model | Separate `media` table + `profile_image_id` on Legacy |
| File types | Images only (JPEG, PNG, GIF, WebP) |
| Size limit | 10 MB |
| URL expiry | 5 min upload, 15 min download |
| Local dev storage | Backend serves files from mounted volume |
| Production storage | S3 with existing bucket and IAM role |

## Data Model

### New `media` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `legacy_id` | UUID (FK) | References `legacies.id`, required |
| `filename` | VARCHAR(255) | Original filename from upload |
| `content_type` | VARCHAR(100) | MIME type (image/jpeg, image/png, etc.) |
| `size_bytes` | BIGINT | File size in bytes |
| `storage_path` | VARCHAR(500) | Path in storage: `legacy/{legacy_id}/{uuid}.{ext}` |
| `uploaded_by` | UUID (FK) | References `users.id` |
| `created_at` | TIMESTAMP | Upload timestamp |

### Legacy table addition

| Column | Type | Description |
|--------|------|-------------|
| `profile_image_id` | UUID (FK, nullable) | References `media.id` |

### Constraints

- Cascade delete: when a legacy is deleted, its media records are deleted
- `profile_image_id` set to NULL if referenced media is deleted

## Backend API

### Media Routes (`app/routes/media.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/legacies/{legacy_id}/media/upload-url` | Request presigned upload URL |
| `POST` | `/api/legacies/{legacy_id}/media/{media_id}/confirm` | Confirm upload completed |
| `GET` | `/api/legacies/{legacy_id}/media` | List media for a legacy (paginated) |
| `GET` | `/api/legacies/{legacy_id}/media/{media_id}` | Get single media item with download URL |
| `DELETE` | `/api/legacies/{legacy_id}/media/{media_id}` | Delete media (file + record) |
| `PATCH` | `/api/legacies/{legacy_id}/profile-image` | Set legacy's profile image |

### Local Storage Routes (dev only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/media/{path:path}` | Serve files from local storage |
| `PUT` | `/media/{path:path}` | Accept file upload to local storage |

### Upload Flow

1. Frontend calls `POST /upload-url` with `{ filename, content_type, size_bytes }`
2. Backend validates (size <= 10MB, allowed content type), creates pending media record
3. Backend returns `{ upload_url, media_id, storage_path }`
4. Frontend uploads directly to URL (S3 or local `/media/{path}`)
5. Frontend calls `POST /confirm` to finalize
6. Backend verifies file exists, marks record as confirmed

## Storage Adapter

### New `app/adapters/storage.py`

```python
class StorageAdapter(Protocol):
    def generate_upload_url(self, path: str, content_type: str, expires_in: int) -> str: ...
    def generate_download_url(self, path: str, expires_in: int) -> str: ...
    def file_exists(self, path: str) -> bool: ...
    def delete_file(self, path: str) -> None: ...

class LocalStorageAdapter:
    # Uses mounted volume at /app/media
    # Returns URLs like http://localhost:8080/media/legacy/{id}/file.jpg

class S3StorageAdapter:
    # Uses boto3 presigned URLs
    # Returns URLs like https://bucket.s3.amazonaws.com/legacy/{id}/file.jpg
```

### Configuration

| Setting | Local | Production |
|---------|-------|------------|
| `STORAGE_BACKEND` | `"local"` | `"s3"` |
| `LOCAL_MEDIA_PATH` | `"/app/media"` | N/A |
| `S3_MEDIA_BUCKET` | N/A | `"mosaic-prod-media-..."` |

## Infrastructure

### Docker Compose

Add to `infra/compose/docker-compose.yml`:

```yaml
core-api:
  volumes:
    - media-data:/app/media

volumes:
  media-data:
    driver: local
```

### Environment Variables

Local (`.env`):
```
STORAGE_BACKEND=local
LOCAL_MEDIA_PATH=/app/media
```

Production (Helm):
```yaml
STORAGE_BACKEND: s3
S3_MEDIA_BUCKET: mosaic-prod-media-{account}
```

### CDK

No changes needed. S3 bucket and IAM permissions already exist.

## Frontend

### API Client (`apps/web/src/lib/api/media.ts`)

- `requestUploadUrl(legacyId, file)` - get presigned URL + media ID
- `uploadFile(url, file)` - PUT to presigned URL
- `confirmUpload(legacyId, mediaId)` - finalize upload
- `listMedia(legacyId)` - get gallery items with download URLs
- `deleteMedia(legacyId, mediaId)` - remove media
- `setProfileImage(legacyId, mediaId)` - set legacy's profile image

### Hooks (`apps/web/src/lib/hooks/useMedia.ts`)

- `useMediaUpload()` - mutation for 3-step upload flow
- `useLegacyMedia(legacyId)` - query for gallery listing
- `useDeleteMedia()` - mutation for deletion
- `useSetProfileImage()` - mutation for profile image

### Component Changes

| File | Change |
|------|--------|
| `LegacyProfile.tsx` | Replace mock data with `useLegacyMedia`, wire up upload |
| New: `MediaUploader.tsx` | File picker, drag-drop, progress, error handling |
| New: `MediaGallery.tsx` | Grid display, lightbox, delete, "Set as profile" |
| `LegacyProfile.tsx` header | Show actual profile image |

## Validation & Security

### Backend Validation

| Check | Rule |
|-------|------|
| File size | <= 10 MB |
| Content type | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| Filename | Sanitize, max 255 chars |
| Authorization | User must be member of legacy |

### Storage Path

```
legacy/{legacy_id}/{media_id}.{ext}
```

- Uses media UUID, not user filename (prevents path traversal)
- Original filename stored in database only

### Local Storage Security

- `/media/{path}` validates path doesn't escape media directory
- Only enabled when `STORAGE_BACKEND=local`

## Storage Organization

As specified in requirements:

- App media: `app/` directory
- Legacy media: `legacy/{legacy_id}/`

## File Structure

```
services/core-api/app/
├── adapters/
│   └── storage.py          # NEW: StorageAdapter implementations
├── models/
│   └── media.py            # NEW: Media SQLAlchemy model
├── routes/
│   └── media.py            # NEW: Media API endpoints
├── schemas/
│   └── media.py            # NEW: Pydantic schemas
└── services/
    └── media.py            # NEW: Media service logic

apps/web/src/
├── lib/
│   ├── api/
│   │   └── media.ts        # NEW: Media API client
│   └── hooks/
│       └── useMedia.ts     # NEW: Media React Query hooks
└── components/
    ├── MediaUploader.tsx   # NEW: Upload component
    ├── MediaGallery.tsx    # NEW: Gallery component
    └── LegacyProfile.tsx   # MODIFIED: Use real media data
```
