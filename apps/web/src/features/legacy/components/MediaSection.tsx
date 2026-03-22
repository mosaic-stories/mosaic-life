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
