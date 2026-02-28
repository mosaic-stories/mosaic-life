import { useState } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { useMediaUpload, useMedia } from '@/features/media/hooks/useMedia';
import { getMediaContentUrl } from '@/features/media/api/media';

interface MediaToolProps {
  legacyId: string;
}

export function MediaTool({ legacyId }: MediaToolProps) {
  const { data: mediaItems } = useMedia(legacyId);
  const uploadMutation = useMediaUpload(legacyId);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await uploadMutation.mutateAsync(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadMutation.mutateAsync(file);
      e.target.value = '';
    }
  };

  return (
    <div className="p-3 space-y-4">
      {/* Upload zone */}
      <label
        className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragging
            ? 'border-theme-primary bg-theme-primary/5'
            : 'border-neutral-200 hover:border-neutral-300'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-6 w-6 text-neutral-400 mb-2" />
        <span className="text-sm text-neutral-500">
          {uploadMutation.isPending ? 'Uploading...' : 'Drop media here or click to upload'}
        </span>
        <input
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          disabled={uploadMutation.isPending}
        />
      </label>

      {/* Legacy media grid */}
      {mediaItems && mediaItems.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Legacy Media
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {mediaItems.map((item) => (
              <div
                key={item.id}
                className="aspect-square rounded-md overflow-hidden border cursor-pointer hover:ring-2 hover:ring-theme-primary/50 transition-shadow"
                title="Click to insert into story"
              >
                {item.download_url ? (
                  <img
                    src={getMediaContentUrl(item.id)}
                    alt={item.filename || 'Media'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-100">
                    <ImageIcon className="h-6 w-6 text-neutral-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400 mt-2">Click to insert into story</p>
        </section>
      )}
    </div>
  );
}
