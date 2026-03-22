# Media Gallery — My Media Page Design

**Date:** 2026-03-22
**Status:** Approved
**Route:** `/my/media`

## Overview

Implement a full media gallery at `/my/media` that shows all media a user has uploaded across all legacies. The page displays aggregate stats (total artifacts, images, videos, audio, documents) and a browsable gallery grid with a detail panel.

The implementation extracts a shared `MediaBrowser` component from the existing `MediaSection` (legacy detail page) to avoid duplicating the grid + side panel + mobile sheet + delete confirmation pattern.

## Decisions

- **Stats:** Client-side counts derived from `content_type` prefixes (no new backend endpoint)
- **Detail view:** Side panel on desktop, bottom sheet on mobile (same pattern as legacy detail)
- **Gallery layout:** Flat gallery — all media in one grid with legacy name badges on thumbnails
- **Architecture:** Extract shared `MediaBrowser` from `MediaSection` (Approach 3)

## Components

### 1. `MediaBrowser` (new, extracted from `MediaSection`)

Shared browsable gallery component used by both `MediaSection` and `MyMediaPage`.

**Props:**
```typescript
interface MediaBrowserProps {
  media: MediaItem[];
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  // Optional legacy context — omitted for cross-legacy views
  legacyId?: string;
  profileImageId?: string | null;
  backgroundImageId?: string | null;
  // Customization
  emptyIcon?: React.ReactNode;
  emptyMessage?: string;
  emptySubMessage?: string;
  renderThumbnailBadge?: (media: MediaItem) => React.ReactNode;
}
```

**Encapsulates:**
- Selected media state management
- Responsive grid layout (adjusts columns when detail panel is open)
- Desktop: `MediaDetailPanel` as right sidebar (400px)
- Mobile: `MediaDetailPanel` inside bottom `Sheet` (85vh)
- `matchMedia` listener for desktop/mobile detection
- Favorite check integration for all visible media
- Delete confirmation dialog with `useDeleteMedia`
- Keyboard navigation (arrows, escape) via `MediaDetailPanel`

**Does NOT own (stays in consumer):**
- Data fetching (`media` passed as prop)
- Upload UI
- Header / stats bar
- Auth gate messaging

### 2. `MediaStatsBar` (new)

Horizontal stats bar for `MyMediaPage`.

**Stats displayed:**
| Stat | Icon | Derived from |
|------|------|-------------|
| Total | `LayoutGrid` | `media.length` |
| Images | `Image` | `content_type.startsWith('image/')` |
| Videos | `Video` | `content_type.startsWith('video/')` |
| Audio | `Music` | `content_type.startsWith('audio/')` |
| Documents | `FileText` | everything else |

Each stat: icon + count + label in a rounded card. Muted styling for zero-count stats. Responsive: wraps on small screens.

### 3. `MediaThumbnail` enhancement

Add optional `badge` prop (`React.ReactNode`). When provided, renders in the bottom-left corner of the thumbnail (e.g., legacy name pill). Existing `isProfile` and `isFavorited` badges remain in top-right.

### 4. `MediaDetailPanel` changes

Make `legacyId` optional:
- When omitted, derive from `media.legacies[0]?.legacy_id`
- Hide "Set as Profile" and "Set as Background" buttons when no `legacyId` prop is provided (no legacy context for cross-legacy view)
- Tags, people, and metadata editing still work using the derived legacy ID

### 5. `MyMediaPage` (replace placeholder)

```
┌─────────────────────────────────────────────┐
│  [icon] My Media                            │
├─────────────────────────────────────────────┤
│  [Total: 42] [Images: 42] [Videos: 0]      │
│  [Audio: 0]  [Documents: 0]                │
├─────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌───────────┐ │
│  │ img  │ │ img  │ │ img  │ │           │ │
│  │Legacy│ │Legacy│ │Legacy│ │  Detail   │ │
│  └──────┘ └──────┘ └──────┘ │  Panel    │ │
│  ┌──────┐ ┌──────┐ ┌──────┐ │           │ │
│  │ img  │ │ img  │ │ img  │ │           │ │
│  │Legacy│ │Legacy│ │Legacy│ │           │ │
│  └──────┘ └──────┘ └──────┘ └───────────┘ │
└─────────────────────────────────────────────┘
```

- Calls `useMedia()` with no `legacyId` to fetch all user media
- Renders `MediaStatsBar` above the gallery
- Renders `MediaBrowser` with `renderThumbnailBadge` that shows `media.legacies[0]?.legacy_name` as a small pill
- No upload button (upload happens on legacy pages)
- No auth gate needed (route is already under `/my/` which requires auth)

### 6. `MediaSection` refactor

Replace the inline grid/panel/sheet/delete-dialog logic with `<MediaBrowser>`. Keep:
- `MediaGalleryHeader` (legacy-specific stats + upload button)
- `MediaUploader` toggle
- Auth gate messaging
- Legacy-specific props (`profileImageId`, `backgroundImageId`, `legacyId`)

## File Changes

| File | Action |
|------|--------|
| `features/media/components/MediaBrowser.tsx` | **New** — extracted from `MediaSection` |
| `features/media/components/MediaStatsBar.tsx` | **New** — stats bar component |
| `features/media/components/MediaThumbnail.tsx` | **Modify** — add optional `badge` prop |
| `features/media/components/MediaDetailPanel.tsx` | **Modify** — make `legacyId` optional, hide profile/bg buttons |
| `features/legacy/components/MediaSection.tsx` | **Refactor** — use `MediaBrowser` internally |
| `pages/MyMediaPage.tsx` | **Replace** — full implementation |
| `features/media/index.ts` | **Modify** — export new components |
