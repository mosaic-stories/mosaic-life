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
