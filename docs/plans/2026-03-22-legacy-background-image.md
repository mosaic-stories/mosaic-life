# Legacy Background Image Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated background image to legacies, with image pickers on create/edit screens and a "Set as Background" button in the media gallery.

**Architecture:** New `background_image_id` FK on the Legacy model (mirrors `profile_image_id`), new PATCH endpoint, new ImagePicker component used on both create/edit forms, updated ProfileHeader display logic.

**Tech Stack:** Python/FastAPI, SQLAlchemy, Alembic, React/TypeScript, TanStack Query

---

### Task 1: Backend — Add background_image_id to Legacy model

**Files:**
- Modify: `services/core-api/app/models/legacy.py:79-110`

**Step 1: Add the column and relationship**

Add after `profile_image_id` (line 84) and `profile_image` relationship (line 110):

```python
# In Legacy class, after profile_image_id column (line 84):
background_image_id: Mapped[UUID | None] = mapped_column(
    PG_UUID(as_uuid=True),
    ForeignKey("media.id", ondelete="SET NULL"),
    nullable=True,
    index=True,
)

# After profile_image relationship (line 110):
background_image: Mapped["Media | None"] = relationship(
    "Media",
    foreign_keys=[background_image_id],
    lazy="joined",
)
```

**Step 2: Run validation**

Run: `cd services/core-api && uv run mypy app/models/legacy.py`
Expected: PASS

**Step 3: Commit**

```bash
git add services/core-api/app/models/legacy.py
git commit -m "feat: add background_image_id to Legacy model"
```

---

### Task 2: Backend — Create Alembic migration

**Files:**
- Create: `services/core-api/alembic/versions/<auto>_add_background_image_id.py`

**Step 1: Generate migration**

```bash
cd services/core-api
uv run alembic revision --autogenerate -m "add background_image_id to legacies"
```

**Step 2: Review generated migration**

The migration should contain:
- `op.add_column("legacies", sa.Column("background_image_id", sa.UUID(), nullable=True))`
- `op.create_index(...)` on `background_image_id`
- `op.create_foreign_key(None, "legacies", "media", ["background_image_id"], ["id"], ondelete="SET NULL")`

And the downgrade should reverse these operations.

Review the file and remove any unrelated changes that autogenerate may have picked up.

**Step 3: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "feat: add migration for background_image_id"
```

---

### Task 3: Backend — Add background image URL helper and update schema

**Files:**
- Modify: `services/core-api/app/services/legacy.py:89-94`
- Modify: `services/core-api/app/schemas/legacy.py:95-97`

**Step 1: Add get_background_image_url helper**

In `services/core-api/app/services/legacy.py`, add after `get_profile_image_url` (line 94):

```python
def get_background_image_url(legacy: Legacy) -> str | None:
    """Get the download URL for a legacy's background image."""
    if not legacy.background_image or not legacy.background_image.storage_path:
        return None
    storage = get_storage_adapter()
    return storage.generate_download_url(legacy.background_image.storage_path)
```

**Step 2: Add fields to LegacyResponse schema**

In `services/core-api/app/schemas/legacy.py`, add after `profile_image_url` (line 97):

```python
# Background image
background_image_id: UUID | None = None
background_image_url: str | None = None
```

**Step 3: Run validation**

```bash
cd services/core-api && uv run mypy app/services/legacy.py app/schemas/legacy.py
```
Expected: PASS

**Step 4: Commit**

```bash
git add services/core-api/app/services/legacy.py services/core-api/app/schemas/legacy.py
git commit -m "feat: add background image URL helper and schema fields"
```

---

### Task 4: Backend — Wire background_image fields into all LegacyResponse builders

**Files:**
- Modify: `services/core-api/app/services/legacy.py`

Every place that constructs a `LegacyResponse` needs `background_image_id` and `background_image_url` added. Search for all `LegacyResponse(` calls in the file and add the two fields alongside the existing `profile_image_id`/`profile_image_url` pairs.

There are instances in these functions:
- `create_legacy` (~line 271) — no image at creation, use defaults (None)
- `list_user_legacies` (~line 334) — add `background_image_id=legacy.background_image_id, background_image_url=get_background_image_url(legacy)`
- `list_user_legacies_scoped` (~line 401) — same pattern
- `explore_legacies` (~line 608) — same pattern
- `get_legacy_public` (~line 713) — same pattern
- `get_legacy_detail` (~line 815) — same pattern
- `update_legacy` (~line 1039) — same pattern (note: may need to load background_image relationship)

For functions that use `selectinload`, also add `selectinload(Legacy.background_image)` alongside `selectinload(Legacy.profile_image)`. These are in:
- `list_user_legacies` (~line 309)
- `list_user_legacies_scoped` (~line 381)
- `explore_legacies` (~line 554)
- `get_legacy_public` (~line 671)
- `get_legacy_detail` (~line 764)

For `update_legacy`, add `selectinload(Legacy.background_image)` to the query options (~line 999).

**Step 1: Add selectinload and response fields to all query functions**

For each function, add the selectinload and response fields as described above.

**Step 2: Run validation**

```bash
cd services/core-api && uv run mypy app/services/legacy.py
```
Expected: PASS

**Step 3: Run tests**

```bash
cd services/core-api && uv run pytest tests/test_legacy_api.py tests/test_legacy_service.py -v
```
Expected: PASS

**Step 4: Commit**

```bash
git add services/core-api/app/services/legacy.py
git commit -m "feat: wire background_image into all LegacyResponse builders"
```

---

### Task 5: Backend — Add set_background_image service function and endpoint

**Files:**
- Modify: `services/core-api/app/services/media.py:447+`
- Modify: `services/core-api/app/routes/legacy.py:481+`
- Modify: `services/core-api/app/schemas/media.py:129+`

**Step 1: Add SetBackgroundImageRequest schema**

In `services/core-api/app/schemas/media.py`, add after `SetProfileImageRequest` (line 131):

```python
class SetBackgroundImageRequest(BaseModel):
    """Request to set legacy background image."""

    media_id: UUID
```

**Step 2: Add set_background_image service function**

In `services/core-api/app/services/media.py`, add after the `set_profile_image` function (after ~line 515). Copy the `set_profile_image` function and change:
- Function name: `set_background_image`
- Set `legacy.background_image_id = media_id` instead of `profile_image_id`
- Log event: `"legacy.background_image_set"`

```python
async def set_background_image(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> None:
    """Set legacy background image from existing media."""
    # Check user is creator or editor
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role.in_(["creator", "editor"]),
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="Must be creator or editor to set background image",
        )

    # Verify media is associated with this legacy
    assoc_result = await db.execute(
        select(MediaLegacy).where(
            MediaLegacy.media_id == media_id,
            MediaLegacy.legacy_id == legacy_id,
        )
    )
    association = assoc_result.scalar_one_or_none()

    if not association:
        raise HTTPException(
            status_code=404,
            detail="Media not found in this legacy",
        )

    # Update legacy
    legacy_result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
    legacy = legacy_result.scalar_one()
    legacy.background_image_id = media_id

    await db.commit()

    logger.info(
        "legacy.background_image_set",
        extra={
            "legacy_id": str(legacy_id),
            "media_id": str(media_id),
            "user_id": str(user_id),
        },
    )
```

**Step 3: Add the route**

In `services/core-api/app/routes/legacy.py`, add after the `set_profile_image` endpoint (after line 504):

```python
@router.patch(
    "/{legacy_id}/background-image",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set background image",
    description="Set legacy background image from existing media. User must be creator or editor.",
)
async def set_background_image(
    legacy_id: UUID,
    data: SetBackgroundImageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Set legacy background image from existing media."""
    session = require_auth(request)
    await media_service.set_background_image(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=data.media_id,
    )
```

Update the import at the top of the routes file to also import `SetBackgroundImageRequest`:

```python
from ..schemas.media import SetProfileImageRequest, SetBackgroundImageRequest
```

**Step 4: Run validation**

```bash
cd services/core-api && just validate-backend
```
Expected: PASS

**Step 5: Run tests**

```bash
cd services/core-api && uv run pytest tests/test_legacy_api.py -v
```
Expected: PASS (existing tests should still pass)

**Step 6: Commit**

```bash
git add services/core-api/app/services/media.py services/core-api/app/routes/legacy.py services/core-api/app/schemas/media.py
git commit -m "feat: add PATCH /api/legacies/{id}/background-image endpoint"
```

---

### Task 6: Backend — Write tests for background image endpoint

**Files:**
- Create: `services/core-api/tests/test_background_image.py`

**Step 1: Write integration tests**

Follow the pattern from `tests/test_legacy_api.py`. Tests needed:

```python
"""Tests for legacy background image endpoint."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.media import Media
from app.models.associations import MediaLegacy
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestSetBackgroundImage:
    """Tests for PATCH /api/legacies/{id}/background-image."""

    @pytest.mark.asyncio
    async def test_set_background_image_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        db_session: AsyncSession,
    ):
        """Creator can set background image from associated media."""
        # Create legacy
        resp = await client.post(
            "/api/legacies/",
            json={"name": "Test Legacy"},
            headers=auth_headers,
        )
        legacy_id = resp.json()["id"]

        # Create media and associate
        media = Media(
            filename="bg.jpg",
            content_type="image/jpeg",
            size_bytes=1000,
            storage_path="test/bg.jpg",
            uploaded_by=test_user.id,
            status="confirmed",
        )
        db_session.add(media)
        await db_session.flush()

        assoc = MediaLegacy(
            media_id=media.id,
            legacy_id=legacy_id,
            role="primary",
        )
        db_session.add(assoc)
        await db_session.commit()

        # Set background image
        resp = await client.patch(
            f"/api/legacies/{legacy_id}/background-image",
            json={"media_id": str(media.id)},
            headers=auth_headers,
        )
        assert resp.status_code == 204

        # Verify it was set
        resp = await client.get(
            f"/api/legacies/{legacy_id}",
            headers=auth_headers,
        )
        assert resp.json()["background_image_id"] == str(media.id)

    @pytest.mark.asyncio
    async def test_set_background_image_requires_auth(
        self,
        client: AsyncClient,
    ):
        """Setting background image requires authentication."""
        import uuid
        resp = await client.patch(
            f"/api/legacies/{uuid.uuid4()}/background-image",
            json={"media_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_set_background_image_unassociated_media(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        db_session: AsyncSession,
    ):
        """Cannot set background from media not associated with legacy."""
        # Create legacy
        resp = await client.post(
            "/api/legacies/",
            json={"name": "Test Legacy"},
            headers=auth_headers,
        )
        legacy_id = resp.json()["id"]

        # Create media but don't associate
        media = Media(
            filename="bg.jpg",
            content_type="image/jpeg",
            size_bytes=1000,
            storage_path="test/bg.jpg",
            uploaded_by=test_user.id,
            status="confirmed",
        )
        db_session.add(media)
        await db_session.commit()

        resp = await client.patch(
            f"/api/legacies/{legacy_id}/background-image",
            json={"media_id": str(media.id)},
            headers=auth_headers,
        )
        assert resp.status_code == 404
```

**Step 2: Run tests**

```bash
cd services/core-api && uv run pytest tests/test_background_image.py -v
```
Expected: PASS

**Step 3: Commit**

```bash
git add services/core-api/tests/test_background_image.py
git commit -m "test: add integration tests for background image endpoint"
```

---

### Task 7: Frontend — Add background image fields to API types and functions

**Files:**
- Modify: `apps/web/src/features/legacy/api/legacies.ts:16-36`
- Modify: `apps/web/src/features/media/api/media.ts:145-152`
- Modify: `apps/web/src/features/media/hooks/useMedia.ts:117-126`

**Step 1: Add fields to Legacy type**

In `apps/web/src/features/legacy/api/legacies.ts`, add after `profile_image_url` (line 32):

```typescript
background_image_id?: string | null;
background_image_url?: string | null;
```

**Step 2: Add setBackgroundImage API function**

In `apps/web/src/features/media/api/media.ts`, add after `setProfileImage` (line 152):

```typescript
export async function setBackgroundImage(
  legacyId: string,
  mediaId: string
): Promise<void> {
  return apiPatch(`/api/legacies/${legacyId}/background-image`, {
    media_id: mediaId,
  });
}
```

**Step 3: Add useSetBackgroundImage hook**

In `apps/web/src/features/media/hooks/useMedia.ts`, add after `useSetProfileImage` (line 126):

```typescript
export function useSetBackgroundImage(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaId: string) => setBackgroundImage(legacyId, mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.detail(legacyId) });
    },
  });
}
```

Also add `setBackgroundImage` to the imports from the media API at the top of the hooks file.

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/api/legacies.ts apps/web/src/features/media/api/media.ts apps/web/src/features/media/hooks/useMedia.ts
git commit -m "feat: add background image API types, function, and hook"
```

---

### Task 8: Frontend — Update ProfileHeader to display background image

**Files:**
- Modify: `apps/web/src/features/legacy/components/ProfileHeader.tsx:15-51`
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx:182-192`

**Step 1: Update ProfileHeader**

In `ProfileHeader.tsx`, the component already receives `legacy` prop. Add background image resolution:

After line 38 (`const profileImageUrl = ...`), add:

```typescript
const backgroundImageUrl = legacy.background_image_url
  ? rewriteBackendUrlForDev(legacy.background_image_url)
  : null;
```

Replace the cover image background section (lines 44-51):

```tsx
{/* Cover image background */}
{backgroundImageUrl ? (
  <img
    src={backgroundImageUrl}
    alt=""
    className="absolute inset-0 w-full h-full object-cover opacity-30"
  />
) : profileImageUrl ? (
  <img
    src={profileImageUrl}
    alt=""
    className="absolute inset-0 w-full h-full object-cover opacity-15 blur-sm"
  />
) : null}
```

**Step 2: Verify no changes needed in LegacyProfile**

`LegacyProfile` passes `legacy` to `ProfileHeader`, and `legacy` already includes `background_image_url` from the API. No changes needed here.

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/components/ProfileHeader.tsx
git commit -m "feat: display dedicated background image in ProfileHeader"
```

---

### Task 9: Frontend — Add "Set as Background" button to MediaDetailPanel

**Files:**
- Modify: `apps/web/src/features/media/components/MediaDetailPanel.tsx:74-83, 93-102, 155-161, 252-336`

**Step 1: Add backgroundImageId prop and hook**

Add `backgroundImageId` to the props interface (line 78):

```typescript
backgroundImageId?: string | null;
```

Add the hook import and instantiation. In the imports (line 14), add `useSetBackgroundImage`:

```typescript
import {
  useSetProfileImage,
  useSetBackgroundImage,
  // ... rest
} from '@/features/media/hooks/useMedia';
```

In the component body, after `useSetProfileImage` (line 161):

```typescript
const setBackgroundImage = useSetBackgroundImage(legacyId);
```

Add a handler after `handleSetProfile` (line 253):

```typescript
const handleSetBackground = () => {
  setBackgroundImage.mutate(media.id);
};
```

Add state:

```typescript
const isBackgroundImage = media.id === backgroundImageId;
```

**Step 2: Add "Set as Background" button in the action bar**

In the action bar area (after the "Set as Profile" / "Profile Photo" block, around line 336), add:

```tsx
{isAuthenticated && (
  isBackgroundImage ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/20 rounded-md px-2.5 py-1.5">
      <Star size={12} className="fill-emerald-300" />
      Background
    </span>
  ) : (
    <button
      onClick={handleSetBackground}
      disabled={setBackgroundImage.isPending}
      className="inline-flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
    >
      <Star size={13} />
      Set as Background
    </button>
  )
)}
```

**Step 3: Update callers to pass backgroundImageId**

In `apps/web/src/features/legacy/components/MediaSection.tsx`, find where `MediaDetailPanel` is rendered and add the `backgroundImageId` prop. The `MediaSection` component receives `profileImageId` — it also needs `backgroundImageId`.

Update the `MediaSection` props to accept `backgroundImageId`:
- Add prop: `backgroundImageId?: string | null`
- Pass it through to `MediaDetailPanel`

In `LegacyProfile.tsx`, where `<MediaSection>` is rendered (~line 237), add:
```tsx
backgroundImageId={legacy.background_image_id}
```

**Step 4: Commit**

```bash
git add apps/web/src/features/media/components/MediaDetailPanel.tsx apps/web/src/features/legacy/components/MediaSection.tsx apps/web/src/features/legacy/components/LegacyProfile.tsx
git commit -m "feat: add Set as Background button to media detail panel"
```

---

### Task 10: Frontend — Create ImagePicker component

**Files:**
- Create: `apps/web/src/features/media/components/ImagePicker.tsx`

**Step 1: Create the component**

```tsx
import { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, X, Loader2, Grid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMedia, useMediaUpload } from '@/features/media/hooks/useMedia';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { getMediaContentUrl } from '@/features/media/api/media';

interface ImagePickerProps {
  label: string;
  currentImageUrl?: string | null;
  currentImageId?: string | null;
  legacyId?: string;
  onImageSelected: (mediaId: string, imageUrl: string) => void;
  onImageRemoved: () => void;
}

export default function ImagePicker({
  label,
  currentImageUrl,
  currentImageId,
  legacyId,
  onImageSelected,
  onImageRemoved,
}: ImagePickerProps) {
  const [showGallery, setShowGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useMediaUpload(legacyId);
  const { data: media } = useMedia(legacyId, { enabled: !!legacyId });

  const imageUrl = currentImageUrl
    ? rewriteBackendUrlForDev(currentImageUrl)
    : null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await upload.mutateAsync(
        legacyId
          ? { file, legacies: [{ legacy_id: legacyId, role: 'primary' as const }] }
          : { file }
      );
      const url = rewriteBackendUrlForDev(getMediaContentUrl(result.id));
      onImageSelected(result.id, url);
    } catch (err) {
      console.error('Upload failed:', err);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGallerySelect = (mediaId: string) => {
    const url = rewriteBackendUrlForDev(getMediaContentUrl(mediaId));
    onImageSelected(mediaId, url);
    setShowGallery(false);
  };

  // Filter to only image types for gallery
  const imageMedia = media?.filter((m) =>
    m.content_type.startsWith('image/')
  ) ?? [];

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {imageUrl && currentImageId ? (
        <div className="relative w-full h-32 rounded-lg overflow-hidden border border-neutral-200">
          <img
            src={imageUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={onImageRemoved}
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
            aria-label={`Remove ${label.toLowerCase()}`}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-neutral-200 bg-neutral-50">
          <ImageIcon className="size-8 text-neutral-300" />
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={upload.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {upload.isPending ? (
            <Loader2 className="size-4 mr-1.5 animate-spin" />
          ) : (
            <Upload className="size-4 mr-1.5" />
          )}
          Upload
        </Button>

        {legacyId && imageMedia.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowGallery(true)}
          >
            <Grid className="size-4 mr-1.5" />
            Choose from Gallery
          </Button>
        )}
      </div>

      {upload.isError && (
        <p className="text-xs text-red-500">
          Upload failed. Please try again.
        </p>
      )}

      <Dialog open={showGallery} onOpenChange={setShowGallery}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose {label}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto p-1">
            {imageMedia.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleGallerySelect(item.id)}
                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all hover:border-theme-primary ${
                  item.id === currentImageId
                    ? 'border-theme-primary ring-2 ring-theme-primary/30'
                    : 'border-transparent'
                }`}
              >
                <img
                  src={rewriteBackendUrlForDev(getMediaContentUrl(item.id))}
                  alt={item.caption ?? item.filename}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/features/media/components/ImagePicker.tsx
git commit -m "feat: create ImagePicker component for profile/background images"
```

---

### Task 11: Frontend — Add ImagePicker to LegacyEdit form

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyEdit.tsx`

**Step 1: Add state and imports**

Import `ImagePicker` and the API functions:

```typescript
import ImagePicker from '@/features/media/components/ImagePicker';
import { setProfileImage, setBackgroundImage } from '@/features/media/api/media';
```

Add state for the images (after the existing state declarations, ~line 37):

```typescript
const [profileImageId, setProfileImageId] = useState<string | null>(null);
const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
const [backgroundImageId, setBackgroundImageId] = useState<string | null>(null);
const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
```

Initialize from legacy data in the `useEffect` (~line 53-63), add:

```typescript
setProfileImageId(legacy.profile_image_id ?? null);
setProfileImageUrl(legacy.profile_image_url ?? null);
setBackgroundImageId(legacy.background_image_id ?? null);
setBackgroundImageUrl(legacy.background_image_url ?? null);
```

**Step 2: Add image pickers to the form**

In the form JSX, inside the `{isCreator && (<>...</>)}` block, add after the visibility section (~before the My Relationship section, around line 358):

```tsx
{/* Images */}
<div className="grid grid-cols-2 gap-4">
  <ImagePicker
    label="Profile Image"
    currentImageUrl={profileImageUrl}
    currentImageId={profileImageId}
    legacyId={legacyId}
    onImageSelected={(mediaId, url) => {
      setProfileImageId(mediaId);
      setProfileImageUrl(url);
    }}
    onImageRemoved={() => {
      setProfileImageId(null);
      setProfileImageUrl(null);
    }}
  />
  <ImagePicker
    label="Background Image"
    currentImageUrl={backgroundImageUrl}
    currentImageId={backgroundImageId}
    legacyId={legacyId}
    onImageSelected={(mediaId, url) => {
      setBackgroundImageId(mediaId);
      setBackgroundImageUrl(url);
    }}
    onImageRemoved={() => {
      setBackgroundImageId(null);
      setBackgroundImageUrl(null);
    }}
  />
</div>
```

**Step 3: Update handleSubmit to save images**

In the `handleSubmit` function, after the legacy update succeeds (inside the `if (isCreator)` block), add image saving:

```typescript
// Save images if changed
if (profileImageId !== legacy.profile_image_id) {
  if (profileImageId) {
    await setProfileImage(legacyId, profileImageId);
  }
}
if (backgroundImageId !== legacy.background_image_id) {
  if (backgroundImageId) {
    await setBackgroundImage(legacyId, backgroundImageId);
  }
}
```

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyEdit.tsx
git commit -m "feat: add image pickers to legacy edit form"
```

---

### Task 12: Frontend — Add ImagePicker to LegacyCreation form

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyCreation.tsx`

**Step 1: Add state and imports**

Import `ImagePicker` and API functions:

```typescript
import ImagePicker from '@/features/media/components/ImagePicker';
import { setProfileImage, setBackgroundImage } from '@/features/media/api/media';
```

Add state (after existing state, ~line 31):

```typescript
const [profileImageId, setProfileImageId] = useState<string | null>(null);
const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
const [backgroundImageId, setBackgroundImageId] = useState<string | null>(null);
const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
```

**Step 2: Add image pickers to the form**

In the form JSX, after the visibility section and before the My Relationship section (~line 312):

```tsx
{/* Images */}
<div className="grid grid-cols-2 gap-4">
  <ImagePicker
    label="Profile Image"
    currentImageUrl={profileImageUrl}
    currentImageId={profileImageId}
    onImageSelected={(mediaId, url) => {
      setProfileImageId(mediaId);
      setProfileImageUrl(url);
    }}
    onImageRemoved={() => {
      setProfileImageId(null);
      setProfileImageUrl(null);
    }}
  />
  <ImagePicker
    label="Background Image"
    currentImageUrl={backgroundImageUrl}
    currentImageId={backgroundImageId}
    onImageSelected={(mediaId, url) => {
      setBackgroundImageId(mediaId);
      setBackgroundImageUrl(url);
    }}
    onImageRemoved={() => {
      setBackgroundImageId(null);
      setBackgroundImageUrl(null);
    }}
  />
</div>
```

Note: no `legacyId` prop passed — upload only, no gallery picker (legacy doesn't exist yet).

**Step 3: Update handleSubmit to save images after creation**

In `handleSubmit`, after the legacy is created (~line 62-70), before the relationship profile save:

```typescript
// Set images if uploaded
if (profileImageId) {
  try {
    await setProfileImage(legacy.id, profileImageId);
  } catch (err) {
    console.error('Failed to set profile image:', err);
  }
}
if (backgroundImageId) {
  try {
    await setBackgroundImage(legacy.id, backgroundImageId);
  } catch (err) {
    console.error('Failed to set background image:', err);
  }
}
```

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyCreation.tsx
git commit -m "feat: add image pickers to legacy creation form"
```

---

### Task 13: Validation — Full backend validation and frontend build

**Files:** None (validation only)

**Step 1: Run full backend validation**

```bash
cd services/core-api && just validate-backend
```
Expected: PASS

**Step 2: Run all backend tests**

```bash
cd services/core-api && uv run pytest -v
```
Expected: PASS

**Step 3: Build frontend**

```bash
cd apps/web && npm run build
```
Expected: PASS

**Step 4: Run frontend tests**

```bash
cd apps/web && npm run test
```
Expected: PASS

**Step 5: Commit any fixes needed, then final commit**

```bash
git add -A
git commit -m "chore: validation fixes for background image feature"
```

(Only if there were fixes needed — skip if everything passed clean.)
