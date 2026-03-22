import { Image } from 'lucide-react';
import { useMedia } from '@/features/media/hooks/useMedia';
import MediaStatsBar from '@/features/media/components/MediaStatsBar';
import MediaBrowser from '@/features/media/components/MediaBrowser';
import Footer from '@/components/Footer';

export default function MyMediaPage() {
  const { data: media, isLoading, error } = useMedia();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
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
      <Footer />
    </div>
  );
}
