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
