import { useState, useMemo, useRef } from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { useMedia, useDeleteMedia } from '@/features/media/hooks/useMedia';
import { type MediaItem } from '@/features/media/api/media';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import MediaUploader from '@/features/media/components/MediaUploader';
import MediaGalleryHeader from '@/features/media/components/MediaGalleryHeader';
import MediaThumbnail from '@/features/media/components/MediaThumbnail';
import MediaDetailPanel from '@/features/media/components/MediaDetailPanel';
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

export interface MediaSectionProps {
  legacyId: string;
  profileImageId: string | null | undefined;
  isAuthenticated: boolean;
}

export default function MediaSection({
  legacyId,
  profileImageId,
  isAuthenticated,
}: MediaSectionProps) {
  const { data: media, isLoading, error } = useMedia(legacyId, { enabled: isAuthenticated });
  const deleteMedia = useDeleteMedia(legacyId);

  const mediaIds = media?.map(m => m.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('media', isAuthenticated ? mediaIds : []);

  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const uploaderRef = useRef<HTMLDivElement>(null);

  const selectedMedia = useMemo(
    () => media?.find(m => m.id === selectedMediaId) ?? null,
    [media, selectedMediaId]
  );

  // Count unique uploaders
  const contributorCount = useMemo(() => {
    if (!media) return 0;
    return new Set(media.map(m => m.uploaded_by)).size;
  }, [media]);

  const handlePhotoClick = (mediaId: string) => {
    setSelectedMediaId(mediaId === selectedMediaId ? null : mediaId);
  };

  const handleNavigate = (mediaId: string) => {
    setSelectedMediaId(mediaId);
  };

  const handleUploadClick = () => {
    setShowUploader(true);
    setTimeout(() => uploaderRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === selectedMediaId) setSelectedMediaId(null);
    await deleteMedia.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
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
      <MediaGalleryHeader
        photoCount={media?.length ?? 0}
        contributorCount={contributorCount}
        onUploadClick={handleUploadClick}
      />

      {/* Upload zone */}
      {showUploader && (
        <div ref={uploaderRef} className="mb-6">
          <MediaUploader legacyId={legacyId} />
        </div>
      )}

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
          {media && media.length > 0 ? (
            media.map((item) => (
              <MediaThumbnail
                key={item.id}
                media={item}
                isSelected={item.id === selectedMediaId}
                isProfile={item.id === profileImageId}
                isFavorited={favoriteData?.favorites[item.id] ?? false}
                onClick={() => handlePhotoClick(item.id)}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-neutral-500">
              <ImageIcon className="size-12 mx-auto text-neutral-300 mb-4" />
              <p>No photos yet</p>
              <p className="text-sm">Upload photos to get started</p>
            </div>
          )}
        </div>

        {/* Desktop detail panel */}
        {selectedMedia && (
          <div className="hidden lg:block">
            <MediaDetailPanel
              media={selectedMedia}
              allMedia={media ?? []}
              legacyId={legacyId}
              profileImageId={profileImageId}
              onClose={() => setSelectedMediaId(null)}
              onNavigate={handleNavigate}
              isAuthenticated={isAuthenticated}
              onRequestDelete={(mediaId) => {
                const mediaItem = media?.find((item) => item.id === mediaId);
                if (mediaItem) {
                  setDeleteTarget(mediaItem);
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Mobile detail panel (Sheet) */}
      <Sheet open={!!selectedMedia} onOpenChange={(open) => { if (!open) setSelectedMediaId(null); }}>
        <SheetContent side="bottom" className="lg:hidden h-[85vh] overflow-y-auto p-0">
          {selectedMedia && (
            <MediaDetailPanel
              media={selectedMedia}
              allMedia={media ?? []}
              legacyId={legacyId}
              profileImageId={profileImageId}
              onClose={() => setSelectedMediaId(null)}
              onNavigate={handleNavigate}
              isAuthenticated={isAuthenticated}
              onRequestDelete={(mediaId) => {
                const mediaItem = media?.find((item) => item.id === mediaId);
                if (mediaItem) {
                  setDeleteTarget(mediaItem);
                }
              }}
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
