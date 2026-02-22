import MediaUploader from '@/features/media/components/MediaUploader';
import MediaGalleryInline from '@/features/media/components/MediaGalleryInline';

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
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-neutral-900">Photo Gallery</h2>
      </div>

      {isAuthenticated && (
        <MediaUploader legacyId={legacyId} />
      )}

      <MediaGalleryInline
        legacyId={legacyId}
        profileImageId={profileImageId}
        canEdit={isAuthenticated}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}
