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
import { useMedia, useDeleteMedia, useSetProfileImage } from '@/lib/hooks/useMedia';
import type { MediaItem } from '@/lib/api/media';
import { rewriteBackendUrlForDev } from '@/lib/url';

interface MediaGalleryInlineProps {
  legacyId: string;
  profileImageId?: string | null;
  canEdit?: boolean;
  isAuthenticated?: boolean;
}

export default function MediaGalleryInline({
  legacyId,
  profileImageId,
  canEdit = false,
  isAuthenticated = false,
}: MediaGalleryInlineProps) {
  // Only fetch media when user is authenticated (media endpoint requires auth)
  const { data: media, isLoading, error } = useMedia(legacyId, { enabled: isAuthenticated });
  const deleteMedia = useDeleteMedia(legacyId);
  const setProfileImage = useSetProfileImage(legacyId);

  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);

  // Show sign-in message for unauthenticated users
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
              src={rewriteBackendUrlForDev(item.download_url)}
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
                src={rewriteBackendUrlForDev(selectedMedia.download_url)}
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
