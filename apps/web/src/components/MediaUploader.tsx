import { useCallback, useState } from 'react';
import { Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { useMediaUpload } from '@/lib/hooks/useMedia';
import { validateFile } from '@/lib/api/media';

interface MediaUploaderProps {
  legacyId: string;
  onSuccess?: () => void;
}

export default function MediaUploader({ legacyId, onSuccess }: MediaUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useMediaUpload(legacyId);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setError(null);
      const file = files[0];

      // Validate before upload
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      try {
        await upload.mutateAsync(file);
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [upload, onSuccess]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      // Check if files were dropped
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
        return;
      }

      // Check if this is an external URL drag (from another website)
      const urlData = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      const htmlData = e.dataTransfer.getData('text/html');

      if (urlData || htmlData) {
        // User dragged an image from another website - we can't directly upload these
        setError(
          'Cannot upload images dragged from other websites. Please save the image to your device first, then upload it.'
        );
        return;
      }

      // No files and no URL data - unclear what was dropped
      setError('No valid image found. Please drop an image file from your device.');
    },
    [handleFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
    },
    [handleFiles]
  );

  return (
    <div className="space-y-4">
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-neutral-300 hover:border-neutral-400'}
          ${upload.isPending ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleChange}
          disabled={upload.isPending}
        />

        {upload.isPending ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="size-8 animate-spin text-blue-500" />
            <p className="text-neutral-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="size-8 text-neutral-400" />
            <p className="text-neutral-600">
              Drag and drop an image, or click to select
            </p>
            <p className="text-sm text-neutral-400">
              JPEG, PNG, GIF, or WebP up to 10 MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="size-4" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="ml-auto"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
