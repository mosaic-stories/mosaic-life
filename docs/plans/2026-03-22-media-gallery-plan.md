# My Media Gallery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a cross-legacy media gallery at `/my/media` with stats bar, browsable grid, and detail panel — extracted from a shared `MediaBrowser` component.

**Architecture:** Extract the grid + side panel + mobile sheet + delete dialog pattern from `MediaSection` into a reusable `MediaBrowser`. Then use it in both `MediaSection` (legacy detail) and `MyMediaPage` (cross-legacy). Add a `MediaStatsBar` for aggregate counts.

**Tech Stack:** React, TypeScript, TanStack Query, Tailwind CSS, Lucide icons, Radix Sheet/Dialog

**Design doc:** `docs/plans/2026-03-22-media-gallery-design.md`

---

### Task 1: Add `badge` prop to MediaThumbnail ✅

**Files:**
- Modify: `apps/web/src/features/media/components/MediaThumbnail.tsx`
- Test: `apps/web/src/features/media/components/MediaThumbnail.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/features/media/components/MediaThumbnail.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MediaItem } from '@/features/media/api/media';
import MediaThumbnail from './MediaThumbnail';

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

const mediaItem: MediaItem = {
  id: 'media-1',
  filename: 'family-photo.jpg',
  content_type: 'image/jpeg',
  size_bytes: 1024,
  download_url: '/download/media-1',
  uploaded_by: 'user-1',
  uploader_name: 'Pat Doe',
  uploader_username: 'pat-doe',
  uploader_avatar_url: null,
  legacies: [],
  created_at: '2026-03-11T00:00:00Z',
  favorite_count: 0,
  caption: 'Family photo',
  date_taken: null,
  location: null,
  era: null,
  tags: [],
  people: [],
};

describe('MediaThumbnail', () => {
  it('renders a custom badge in the bottom-left when provided', () => {
    render(
      <MediaThumbnail
        media={mediaItem}
        isSelected={false}
        isProfile={false}
        isFavorited={false}
        onClick={vi.fn()}
        badge={<span data-testid="legacy-badge">Rose Legacy</span>}
      />
    );

    expect(screen.getByTestId('legacy-badge')).toBeInTheDocument();
    expect(screen.getByTestId('legacy-badge')).toHaveTextContent('Rose Legacy');
  });

  it('does not render badge area when badge is not provided', () => {
    const { container } = render(
      <MediaThumbnail
        media={mediaItem}
        isSelected={false}
        isProfile={false}
        isFavorited={false}
        onClick={vi.fn()}
      />
    );

    expect(container.querySelector('[data-slot="badge"]')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaThumbnail.test.tsx`
Expected: FAIL — `badge` prop doesn't exist yet

**Step 3: Add the `badge` prop to MediaThumbnail**

In `apps/web/src/features/media/components/MediaThumbnail.tsx`:

Add `badge?: React.ReactNode` to the `MediaThumbnailProps` interface. Destructure it in the component. Add this JSX before the closing `</button>`, after the existing badges `<div>`:

```tsx
{/* Custom badge — bottom left */}
{badge && (
  <div data-slot="badge" className="absolute bottom-2 left-2">
    {badge}
  </div>
)}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaThumbnail.test.tsx`
Expected: PASS

**Step 5: Run existing MediaAccessibility tests to verify no regression**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaAccessibility.test.tsx`
Expected: PASS — existing tests unchanged

**Step 6: Commit**

```bash
git add apps/web/src/features/media/components/MediaThumbnail.tsx apps/web/src/features/media/components/MediaThumbnail.test.tsx
git commit -m "feat(web): add badge prop to MediaThumbnail"
```

---

### Task 2: Make `legacyId` optional in MediaDetailPanel ✅

**Files:**
- Modify: `apps/web/src/features/media/components/MediaDetailPanel.tsx:75-105`
- Test: `apps/web/src/features/media/components/MediaDetailPanel.test.tsx`

**Step 1: Write the failing test**

Add to the existing test file `apps/web/src/features/media/components/MediaDetailPanel.test.tsx`, inside the existing describe block:

```tsx
it('hides set-as-profile and set-as-background buttons when legacyId is omitted', () => {
  render(
    <MemoryRouter>
      <MediaDetailPanel
        media={singleMedia}
        allMedia={[singleMedia]}
        onClose={mocks.onClose}
        onNavigate={mocks.onNavigate}
        isAuthenticated={true}
        onRequestDelete={mocks.onRequestDelete}
      />
    </MemoryRouter>
  );

  expect(screen.queryByText('Set as Profile')).not.toBeInTheDocument();
  expect(screen.queryByText('Set as Background')).not.toBeInTheDocument();
  expect(screen.queryByText('Profile Photo')).not.toBeInTheDocument();
  expect(screen.queryByText('Background')).not.toBeInTheDocument();
});

it('derives legacyId from media.legacies[0] when legacyId prop is omitted', () => {
  const mediaWithLegacy = {
    ...singleMedia,
    legacies: [{ legacy_id: 'derived-legacy', legacy_name: 'Rose', role: 'primary' as const, position: 0 }],
  };

  render(
    <MemoryRouter>
      <MediaDetailPanel
        media={mediaWithLegacy}
        allMedia={[mediaWithLegacy]}
        onClose={mocks.onClose}
        onNavigate={mocks.onNavigate}
        isAuthenticated={true}
      />
    </MemoryRouter>
  );

  // Hooks should be called with the derived legacy ID
  expect(mocks.useUpdateMedia).toHaveBeenCalledWith('derived-legacy');
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaDetailPanel.test.tsx`
Expected: FAIL — `legacyId` is currently required in props interface

**Step 3: Update MediaDetailPanel**

In `apps/web/src/features/media/components/MediaDetailPanel.tsx`:

1. Change `legacyId: string` to `legacyId?: string` in `MediaDetailPanelProps` (line 78).

2. At the top of the component function body (after destructuring props, around line 106), add:

```tsx
const effectiveLegacyId = legacyId ?? media.legacies[0]?.legacy_id ?? '';
const showLegacyActions = !!legacyId;
```

3. Replace all uses of `legacyId` in hooks with `effectiveLegacyId`:
   - `useUpdateMedia(legacyId)` → `useUpdateMedia(effectiveLegacyId || undefined)`
   - `useTagPerson(legacyId)` → `useTagPerson(effectiveLegacyId || undefined)`
   - `useUntagPerson(legacyId)` → `useUntagPerson(effectiveLegacyId || undefined)`
   - `useAddTag(legacyId)` → `useAddTag(effectiveLegacyId || undefined)`
   - `useRemoveTag(legacyId)` → `useRemoveTag(effectiveLegacyId || undefined)`
   - `useSetProfileImage(legacyId)` → `useSetProfileImage(effectiveLegacyId)` (keep as-is since it requires string — guarded by `showLegacyActions`)
   - `useSetBackgroundImage(legacyId)` → `useSetBackgroundImage(effectiveLegacyId)` (same)
   - `useLegacyTags(legacyId)` → `useLegacyTags(effectiveLegacyId || undefined)`
   - `useSearchPersons(personSearch, legacyId)` → `useSearchPersons(personSearch, effectiveLegacyId || undefined)`

4. Also update the `addTag.mutate` call that passes `legacyId` in the payload:
   - `{ mediaId: media.id, name: tagInput.trim(), legacyId }` → `{ mediaId: media.id, name: tagInput.trim(), legacyId: effectiveLegacyId }`
   - Same for `handleAddTag`

5. Wrap "Set as Profile" and "Set as Background" buttons with `showLegacyActions`:
   - Replace `{isAuthenticated && (isProfileImage ? ...` with `{showLegacyActions && isAuthenticated && (isProfileImage ? ...`
   - Replace `{isAuthenticated && (isBackgroundImage ? ...` with `{showLegacyActions && isAuthenticated && (isBackgroundImage ? ...`

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaDetailPanel.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/features/media/components/MediaDetailPanel.tsx apps/web/src/features/media/components/MediaDetailPanel.test.tsx
git commit -m "refactor(web): make legacyId optional in MediaDetailPanel"
```

---

### Task 3: Extract MediaBrowser component ✅

**Files:**
- Create: `apps/web/src/features/media/components/MediaBrowser.tsx`
- Test: `apps/web/src/features/media/components/MediaBrowser.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/features/media/components/MediaBrowser.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { MediaItem } from '@/features/media/api/media';

const mocks = vi.hoisted(() => ({
  useDeleteMedia: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  favoriteCheck: vi.fn(() => ({ data: { favorites: {} } })),
}));

vi.mock('@/features/media/hooks/useMedia', async () => {
  const actual = await vi.importActual<typeof import('@/features/media/hooks/useMedia')>(
    '@/features/media/hooks/useMedia'
  );
  return { ...actual, useDeleteMedia: mocks.useDeleteMedia };
});

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: mocks.favoriteCheck,
}));

vi.mock('./MediaDetailPanel', () => ({
  default: ({ media }: { media: MediaItem }) => (
    <div data-testid="detail-panel">{media.filename}</div>
  ),
}));

vi.mock('./MediaThumbnail', () => ({
  default: ({ media, onClick, badge }: { media: MediaItem; onClick: () => void; badge?: React.ReactNode }) => (
    <button data-testid={`thumb-${media.id}`} onClick={onClick}>
      {media.filename}
      {badge}
    </button>
  ),
}));

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

import MediaBrowser from './MediaBrowser';

const makeMedia = (id: string, filename: string): MediaItem => ({
  id,
  filename,
  content_type: 'image/jpeg',
  size_bytes: 1024,
  download_url: `/download/${id}`,
  uploaded_by: 'user-1',
  uploader_name: 'Pat Doe',
  uploader_username: 'pat-doe',
  uploader_avatar_url: null,
  legacies: [{ legacy_id: 'leg-1', legacy_name: 'Rose Legacy', role: 'primary', position: 0 }],
  created_at: '2026-03-11T00:00:00Z',
  favorite_count: 0,
  caption: null,
  date_taken: null,
  location: null,
  era: null,
  tags: [],
  people: [],
});

const media = [makeMedia('m1', 'photo1.jpg'), makeMedia('m2', 'photo2.jpg')];

describe('MediaBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a loading spinner when isLoading is true', () => {
    render(
      <MemoryRouter>
        <MediaBrowser media={[]} isLoading={true} error={null} isAuthenticated={true} />
      </MemoryRouter>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error message when error is provided', () => {
    render(
      <MemoryRouter>
        <MediaBrowser media={[]} isLoading={false} error={new Error('fail')} isAuthenticated={true} />
      </MemoryRouter>
    );
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('renders empty state when media is empty', () => {
    render(
      <MemoryRouter>
        <MediaBrowser media={[]} isLoading={false} error={null} isAuthenticated={true} />
      </MemoryRouter>
    );
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(
      <MemoryRouter>
        <MediaBrowser
          media={[]}
          isLoading={false}
          error={null}
          isAuthenticated={true}
          emptyMessage="Nothing here"
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders thumbnails for all media items', () => {
    render(
      <MemoryRouter>
        <MediaBrowser media={media} isLoading={false} error={null} isAuthenticated={true} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('thumb-m1')).toBeInTheDocument();
    expect(screen.getByTestId('thumb-m2')).toBeInTheDocument();
  });

  it('opens the detail panel when a thumbnail is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MediaBrowser media={media} isLoading={false} error={null} isAuthenticated={true} />
      </MemoryRouter>
    );

    await user.click(screen.getByTestId('thumb-m1'));
    expect(screen.getByTestId('detail-panel')).toHaveTextContent('photo1.jpg');
  });

  it('passes renderThumbnailBadge output as badge prop', () => {
    render(
      <MemoryRouter>
        <MediaBrowser
          media={media}
          isLoading={false}
          error={null}
          isAuthenticated={true}
          renderThumbnailBadge={(m) => <span data-testid={`badge-${m.id}`}>{m.legacies[0]?.legacy_name}</span>}
        />
      </MemoryRouter>
    );
    expect(screen.getByTestId('badge-m1')).toHaveTextContent('Rose Legacy');
    expect(screen.getByTestId('badge-m2')).toHaveTextContent('Rose Legacy');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaBrowser.test.tsx`
Expected: FAIL — module not found

**Step 3: Create MediaBrowser component**

Create `apps/web/src/features/media/components/MediaBrowser.tsx`:

```tsx
import { useState, useMemo, useEffect } from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { type MediaItem } from '@/features/media/api/media';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useDeleteMedia } from '@/features/media/hooks/useMedia';
import MediaThumbnail from './MediaThumbnail';
import MediaDetailPanel from './MediaDetailPanel';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface MediaBrowserProps {
  media: MediaItem[];
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  legacyId?: string;
  profileImageId?: string | null;
  backgroundImageId?: string | null;
  emptyMessage?: string;
  emptySubMessage?: string;
  renderThumbnailBadge?: (media: MediaItem) => React.ReactNode;
}

export default function MediaBrowser({
  media,
  isLoading,
  error,
  isAuthenticated,
  legacyId,
  profileImageId,
  backgroundImageId,
  emptyMessage = 'No photos yet',
  emptySubMessage,
  renderThumbnailBadge,
}: MediaBrowserProps) {
  const deleteMedia = useDeleteMedia(legacyId);

  const mediaIds = media.map((m) => m.id);
  const { data: favoriteData } = useFavoriteCheck('media', isAuthenticated ? mediaIds : []);

  // Desktop breakpoint detection
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mql.matches);
    setIsDesktop(mql.matches);

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }

    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);

  const selectedMedia = useMemo(
    () => media.find((m) => m.id === selectedMediaId) ?? null,
    [media, selectedMediaId]
  );

  const handlePhotoClick = (mediaId: string) => {
    setSelectedMediaId(mediaId === selectedMediaId ? null : mediaId);
  };

  const handleNavigate = (mediaId: string) => {
    setSelectedMediaId(mediaId);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === selectedMediaId) setSelectedMediaId(null);
    await deleteMedia.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleRequestDelete = (mediaId: string) => {
    const mediaItem = media.find((item) => item.id === mediaId);
    if (mediaItem) {
      setDeleteTarget(mediaItem);
    }
  };

  // Derive legacyId for detail panel from selected media if not provided
  const detailLegacyId = legacyId ?? selectedMedia?.legacies[0]?.legacy_id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <Loader2 className="size-8 animate-spin text-stone-500" />
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

  return (
    <>
      {/* Main grid: gallery + optional detail panel */}
      <div
        className={`grid gap-7 transition-all duration-300 ${
          selectedMedia
            ? 'grid-cols-1 lg:grid-cols-[1fr_400px]'
            : 'grid-cols-1'
        }`}
      >
        {/* Photo grid */}
        <div
          className={`grid gap-3 ${
            selectedMedia
              ? 'grid-cols-2 md:grid-cols-3'
              : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
          }`}
        >
          {media.length > 0 ? (
            media.map((item) => (
              <MediaThumbnail
                key={item.id}
                media={item}
                isSelected={item.id === selectedMediaId}
                isProfile={item.id === profileImageId}
                isFavorited={favoriteData?.favorites[item.id] ?? false}
                onClick={() => handlePhotoClick(item.id)}
                badge={renderThumbnailBadge?.(item)}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-neutral-500">
              <ImageIcon className="size-12 mx-auto text-neutral-300 mb-4" />
              <p>{emptyMessage}</p>
              {emptySubMessage && (
                <p className="text-sm">{emptySubMessage}</p>
              )}
            </div>
          )}
        </div>

        {/* Desktop detail panel */}
        {selectedMedia && (
          <div className="hidden lg:block">
            <MediaDetailPanel
              media={selectedMedia}
              allMedia={media}
              legacyId={detailLegacyId}
              profileImageId={profileImageId}
              backgroundImageId={backgroundImageId}
              onClose={() => setSelectedMediaId(null)}
              onNavigate={handleNavigate}
              isAuthenticated={isAuthenticated}
              onRequestDelete={handleRequestDelete}
            />
          </div>
        )}
      </div>

      {/* Mobile detail panel (Sheet) */}
      <Sheet
        open={!isDesktop && !!selectedMedia}
        onOpenChange={(open) => {
          if (!open) setSelectedMediaId(null);
        }}
      >
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto p-0">
          {selectedMedia && (
            <MediaDetailPanel
              media={selectedMedia}
              allMedia={media}
              legacyId={detailLegacyId}
              profileImageId={profileImageId}
              backgroundImageId={backgroundImageId}
              onClose={() => setSelectedMediaId(null)}
              onNavigate={handleNavigate}
              isAuthenticated={isAuthenticated}
              onRequestDelete={handleRequestDelete}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Photo</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.filename}&rdquo;? This
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

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaBrowser.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/features/media/components/MediaBrowser.tsx apps/web/src/features/media/components/MediaBrowser.test.tsx
git commit -m "feat(web): extract MediaBrowser shared component"
```

---

### Task 4: Refactor MediaSection to use MediaBrowser

**Files:**
- Modify: `apps/web/src/features/legacy/components/MediaSection.tsx`

**Step 1: Run existing tests as baseline**

Run: `cd apps/web && npx vitest run src/features/media/`
Expected: All PASS — record current state

**Step 2: Refactor MediaSection**

Replace `apps/web/src/features/legacy/components/MediaSection.tsx` with a simplified version that delegates to `MediaBrowser`:

```tsx
import { useState, useMemo, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useMedia } from '@/features/media/hooks/useMedia';
import MediaUploader from '@/features/media/components/MediaUploader';
import MediaGalleryHeader from '@/features/media/components/MediaGalleryHeader';
import MediaBrowser from '@/features/media/components/MediaBrowser';
import { ApiError } from '@/lib/api/client';

export interface MediaSectionProps {
  legacyId: string;
  profileImageId: string | null | undefined;
  backgroundImageId: string | null | undefined;
  isAuthenticated: boolean;
  canUploadMedia?: boolean;
}

export default function MediaSection({
  legacyId,
  profileImageId,
  backgroundImageId,
  isAuthenticated,
  canUploadMedia = true,
}: MediaSectionProps) {
  const { data: media, isLoading, error } = useMedia(legacyId, { enabled: isAuthenticated });
  const showEmptyForRestrictedPublicViewer =
    !canUploadMedia && error instanceof ApiError && error.status === 403;

  const [showUploader, setShowUploader] = useState(false);
  const uploaderRef = useRef<HTMLDivElement>(null);

  // Count unique uploaders
  const contributorCount = useMemo(() => {
    if (!media) return 0;
    return new Set(media.map((m) => m.uploaded_by)).size;
  }, [media]);

  const handleUploadClick = () => {
    setShowUploader(true);
    setTimeout(() => uploaderRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  // Auth gate
  if (!isAuthenticated) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <ImageIcon className="size-12 mx-auto text-neutral-300 mb-4" />
        <p>Sign in to view photos</p>
        <p className="text-sm">Photos are only visible to authenticated users</p>
      </div>
    );
  }

  return (
    <>
      <MediaGalleryHeader
        photoCount={media?.length ?? 0}
        contributorCount={contributorCount}
        onUploadClick={handleUploadClick}
        canUpload={canUploadMedia}
      />

      {/* Upload zone */}
      {showUploader && (
        <div ref={uploaderRef} className="mb-6">
          <MediaUploader legacyId={legacyId} />
        </div>
      )}

      <MediaBrowser
        media={media ?? []}
        isLoading={isLoading}
        error={showEmptyForRestrictedPublicViewer ? null : (error as Error | null)}
        isAuthenticated={isAuthenticated}
        legacyId={legacyId}
        profileImageId={profileImageId}
        backgroundImageId={backgroundImageId}
        emptySubMessage={
          canUploadMedia ? 'Upload photos to get started' : 'No public photos are available to view'
        }
      />
    </>
  );
}
```

**Step 3: Run all media tests to verify no regression**

Run: `cd apps/web && npx vitest run src/features/media/`
Expected: All PASS

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/MediaSection.tsx
git commit -m "refactor(web): simplify MediaSection to use MediaBrowser"
```

---

### Task 5: Create MediaStatsBar component

**Files:**
- Create: `apps/web/src/features/media/components/MediaStatsBar.tsx`
- Test: `apps/web/src/features/media/components/MediaStatsBar.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/features/media/components/MediaStatsBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MediaItem } from '@/features/media/api/media';
import MediaStatsBar from './MediaStatsBar';

const makeMedia = (id: string, contentType: string): MediaItem => ({
  id,
  filename: `file-${id}`,
  content_type: contentType,
  size_bytes: 1024,
  download_url: `/download/${id}`,
  uploaded_by: 'user-1',
  uploader_name: 'Pat',
  uploader_username: 'pat',
  uploader_avatar_url: null,
  legacies: [],
  created_at: '2026-03-11T00:00:00Z',
  favorite_count: 0,
  caption: null,
  date_taken: null,
  location: null,
  era: null,
  tags: [],
  people: [],
});

describe('MediaStatsBar', () => {
  it('renders correct counts for each media type', () => {
    const media = [
      makeMedia('1', 'image/jpeg'),
      makeMedia('2', 'image/png'),
      makeMedia('3', 'video/mp4'),
      makeMedia('4', 'audio/mpeg'),
      makeMedia('5', 'application/pdf'),
    ];

    render(<MediaStatsBar media={media} />);

    // Total
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();

    // Images
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();

    // Videos
    expect(screen.getByText('Videos')).toBeInTheDocument();

    // Audio
    expect(screen.getByText('Audio')).toBeInTheDocument();

    // Documents
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('renders all zeros for empty media', () => {
    render(<MediaStatsBar media={[]} />);

    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaStatsBar.test.tsx`
Expected: FAIL — module not found

**Step 3: Create MediaStatsBar component**

Create `apps/web/src/features/media/components/MediaStatsBar.tsx`:

```tsx
import { useMemo } from 'react';
import { LayoutGrid, Image, Video, Music, FileText } from 'lucide-react';
import { type MediaItem } from '@/features/media/api/media';

interface MediaStatsBarProps {
  media: MediaItem[];
}

interface StatConfig {
  label: string;
  icon: typeof LayoutGrid;
  count: number;
}

export default function MediaStatsBar({ media }: MediaStatsBarProps) {
  const stats = useMemo((): StatConfig[] => {
    let images = 0;
    let videos = 0;
    let audio = 0;
    let documents = 0;

    for (const item of media) {
      const ct = item.content_type;
      if (ct.startsWith('image/')) images++;
      else if (ct.startsWith('video/')) videos++;
      else if (ct.startsWith('audio/')) audio++;
      else documents++;
    }

    return [
      { label: 'Total', icon: LayoutGrid, count: media.length },
      { label: 'Images', icon: Image, count: images },
      { label: 'Videos', icon: Video, count: videos },
      { label: 'Audio', icon: Music, count: audio },
      { label: 'Documents', icon: FileText, count: documents },
    ];
  }, [media]);

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const isZero = stat.count === 0;

        return (
          <div
            key={stat.label}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${
              isZero
                ? 'border-stone-100 bg-stone-50/50 text-stone-300'
                : 'border-stone-200 bg-white text-stone-700 shadow-sm'
            }`}
          >
            <Icon size={16} className={isZero ? 'text-stone-300' : 'text-stone-500'} />
            <span className={`text-lg font-semibold tabular-nums ${isZero ? 'text-stone-300' : 'text-stone-800'}`}>
              {stat.count}
            </span>
            <span className={`text-xs font-medium ${isZero ? 'text-stone-300' : 'text-stone-500'}`}>
              {stat.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/features/media/components/MediaStatsBar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/features/media/components/MediaStatsBar.tsx apps/web/src/features/media/components/MediaStatsBar.test.tsx
git commit -m "feat(web): add MediaStatsBar component"
```

---

### Task 6: Implement MyMediaPage

**Files:**
- Modify: `apps/web/src/pages/MyMediaPage.tsx`
- Test: `apps/web/src/pages/MyMediaPage.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/pages/MyMediaPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MediaItem } from '@/features/media/api/media';

const mockMedia: MediaItem[] = [
  {
    id: 'm1',
    filename: 'photo.jpg',
    content_type: 'image/jpeg',
    size_bytes: 1024,
    download_url: '/download/m1',
    uploaded_by: 'user-1',
    uploader_name: 'Pat',
    uploader_username: 'pat',
    uploader_avatar_url: null,
    legacies: [{ legacy_id: 'leg-1', legacy_name: 'Rose Legacy', role: 'primary', position: 0 }],
    created_at: '2026-03-11T00:00:00Z',
    favorite_count: 0,
    caption: null,
    date_taken: null,
    location: null,
    era: null,
    tags: [],
    people: [],
  },
];

const mocks = vi.hoisted(() => ({
  useMedia: vi.fn(() => ({ data: mockMedia, isLoading: false, error: null })),
}));

vi.mock('@/features/media/hooks/useMedia', async () => {
  const actual = await vi.importActual<typeof import('@/features/media/hooks/useMedia')>(
    '@/features/media/hooks/useMedia'
  );
  return { ...actual, useMedia: mocks.useMedia };
});

vi.mock('@/features/media/components/MediaBrowser', () => ({
  default: ({ media }: { media: MediaItem[] }) => (
    <div data-testid="media-browser">{media.length} items</div>
  ),
}));

vi.mock('@/features/media/components/MediaStatsBar', () => ({
  default: ({ media }: { media: MediaItem[] }) => (
    <div data-testid="stats-bar">{media.length} stats</div>
  ),
}));

import MyMediaPage from './MyMediaPage';

describe('MyMediaPage', () => {
  it('renders the page title', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );
    expect(screen.getByText('My Media')).toBeInTheDocument();
  });

  it('renders the stats bar with media data', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('stats-bar')).toHaveTextContent('1 stats');
  });

  it('renders the media browser', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('media-browser')).toHaveTextContent('1 items');
  });

  it('calls useMedia with no legacyId to fetch all media', () => {
    render(
      <MemoryRouter>
        <MyMediaPage />
      </MemoryRouter>
    );
    expect(mocks.useMedia).toHaveBeenCalledWith();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/pages/MyMediaPage.test.tsx`
Expected: FAIL — current placeholder doesn't render stats bar or browser

**Step 3: Implement MyMediaPage**

Replace `apps/web/src/pages/MyMediaPage.tsx`:

```tsx
import { Image } from 'lucide-react';
import { useMedia } from '@/features/media/hooks/useMedia';
import MediaStatsBar from '@/features/media/components/MediaStatsBar';
import MediaBrowser from '@/features/media/components/MediaBrowser';

export default function MyMediaPage() {
  const { data: media, isLoading, error } = useMedia();

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Image className="size-6 text-theme-primary" />
        <h1 className="text-2xl font-serif font-medium">My Media</h1>
      </div>

      <MediaStatsBar media={media ?? []} />

      <MediaBrowser
        media={media ?? []}
        isLoading={isLoading}
        error={error as Error | null}
        isAuthenticated={true}
        emptyMessage="No media yet"
        emptySubMessage="Upload photos on your legacy pages to see them here"
        renderThumbnailBadge={(item) => {
          const legacyName = item.legacies[0]?.legacy_name;
          if (!legacyName) return null;
          return (
            <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full truncate max-w-[120px]">
              {legacyName}
            </span>
          );
        }}
      />
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/pages/MyMediaPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/pages/MyMediaPage.tsx apps/web/src/pages/MyMediaPage.test.tsx
git commit -m "feat(web): implement My Media page with stats and gallery"
```

---

### Task 7: Update exports and run full test suite

**Files:**
- Modify: `apps/web/src/features/media/index.ts`

**Step 1: Update exports**

In `apps/web/src/features/media/index.ts`, add:

```tsx
export { default as MediaBrowser } from './components/MediaBrowser';
export { default as MediaStatsBar } from './components/MediaStatsBar';
```

**Step 2: Run the full media test suite**

Run: `cd apps/web && npx vitest run src/features/media/`
Expected: All PASS

**Step 3: Run the full frontend test suite**

Run: `cd apps/web && npx vitest run`
Expected: All PASS

**Step 4: Run build to verify no type errors**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/features/media/index.ts
git commit -m "chore(web): export MediaBrowser and MediaStatsBar"
```

---

### Task 8: Manual smoke test

**Steps:**
1. Start the dev server: `cd apps/web && npm run dev`
2. Navigate to `/my/media`
3. Verify: stats bar shows with all 5 stat categories
4. Verify: gallery grid displays all user media with legacy name badges
5. Verify: clicking a thumbnail opens the detail panel on desktop
6. Verify: detail panel shows media info, caption, tags, people sections
7. Verify: arrow key navigation works between photos
8. Verify: resize to mobile width and verify bottom sheet opens instead
9. Navigate to a legacy detail page
10. Verify: media section still works identically (no regression)
