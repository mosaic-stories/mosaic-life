# Legacy Background Image — Design

**Date:** 2026-03-22
**Status:** Approved

## Summary

Add a dedicated background image field to legacies, separate from the profile image. Both images are selectable from the add/edit legacy screen via upload or gallery picker. The legacy detail page shows the background image (when set) or falls back to the current blurred profile image behavior.

## Decisions

- **Approach:** New `background_image_id` FK column on legacies table + dedicated endpoint (mirrors existing `profile_image_id` pattern)
- **Image picker UI:** Thumbnail preview + "Upload" and "Choose from gallery" buttons
- **Background display:** Full bleed at 30-40% opacity, no blur (when set); falls back to blurred profile image at 15% opacity
- **Availability:** Image pickers on both create and edit screens. Create screen has upload only (no gallery since legacy doesn't exist yet). Edit screen has upload + gallery.

## Data Model & API

### Database

- Add `background_image_id` (UUID, FK to `media.id`, nullable, `ON DELETE SET NULL`) to `legacies` table
- Add index on `background_image_id`
- Alembic migration mirrors existing `profile_image_id` migration

### Legacy Model

- Add `background_image_id` column
- Add `background_image` relationship (lazy="joined", same as profile_image)

### Legacy Service

- Add `get_background_image_url()` function (mirrors `get_profile_image_url()`)
- Include `background_image_url` in all legacy response serialization

### New Endpoint

- `PATCH /api/legacies/{id}/background-image` — accepts `{ media_id: UUID }`, sets `background_image_id`
- Same auth/validation as existing profile-image endpoint

### Legacy Response (addition)

```json
{
  "background_image_id": "uuid | null",
  "background_image_url": "string | null"
}
```

## Frontend — ImagePicker Component

### New reusable component

Location: `apps/web/src/features/media/components/ImagePicker.tsx`

**Props:**
- `label` — "Profile Image" or "Background Image"
- `currentImageUrl` — current image URL (for preview thumbnail)
- `currentImageId` — current media ID
- `legacyId` — optional, only present on edit (enables "Choose from gallery")
- `onImageSelected(mediaId: string, imageUrl: string)` — callback when image is picked
- `onImageRemoved()` — callback to clear the image

**Behavior:**
- Shows thumbnail preview if an image is set, with a remove button
- Shows placeholder icon if no image
- "Upload" button — triggers existing presigned URL upload flow, then calls `onImageSelected`
- "Choose from gallery" button — only visible when `legacyId` is provided (edit mode). Opens modal showing legacy's associated media as thumbnail grid. Clicking one calls `onImageSelected`

### Used in

- `LegacyCreation.tsx` — two ImagePicker instances (profile + background), upload only
- `LegacyEdit.tsx` — two ImagePicker instances with full upload + gallery

### Create flow

- User uploads image via ImagePicker → media is created and confirmed via existing upload flow
- On form submit, legacy is created first, then PATCH calls set the profile/background images
- If creation fails, uploaded media is orphaned (acceptable — cleanup later)

## Frontend — ProfileHeader Changes

### Display logic

```
if (backgroundImageUrl) → full bleed, 30% opacity, no blur
else if (profileImageUrl) → full bleed, 15% opacity, blur (current behavior)
else → no image, solid background
```

### Props change

- Add `backgroundImageUrl?: string | null` prop to ProfileHeader
- LegacyProfile passes `legacy.background_image_url` down

## Frontend — Media Gallery Integration

### MediaDetailPanel changes

- Add "Set as Background" button alongside existing "Set as Profile" button
- Show "Background Photo" badge when image is the current background image
- New hook: `useSetBackgroundImage(legacyId)` — calls `PATCH /api/legacies/{id}/background-image`

### Two paths to set images

1. From the add/edit form — via ImagePicker (upload or gallery)
2. From the media gallery — via "Set as Background" button on any image
