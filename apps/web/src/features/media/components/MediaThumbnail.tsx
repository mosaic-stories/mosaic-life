import { Heart } from 'lucide-react';
import { getMediaContentUrl, type MediaItem } from '@/features/media/api/media';
import { rewriteBackendUrlForDev } from '@/lib/url';

interface MediaThumbnailProps {
  media: MediaItem;
  isSelected: boolean;
  isProfile: boolean;
  isFavorited: boolean;
  onClick: () => void;
}

export default function MediaThumbnail({
  media,
  isSelected,
  isProfile,
  isFavorited,
  onClick,
}: MediaThumbnailProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`relative block w-full rounded-xl overflow-hidden cursor-pointer aspect-square transition-all duration-200 text-left bg-transparent border-0 p-0 ${
        isSelected
          ? 'ring-[3px] ring-stone-700 shadow-lg shadow-stone-300/40'
          : 'ring-[3px] ring-transparent shadow-sm hover:shadow-md'
      }`}
    >
      <img
        src={rewriteBackendUrlForDev(getMediaContentUrl(media.id))}
        alt={media.caption || media.filename}
        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
      />

      {/* Caption overlay on selected */}
      {isSelected && media.caption && (
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 to-transparent flex flex-col justify-end p-3">
          <p className="text-white text-xs leading-relaxed line-clamp-2">
            {media.caption}
          </p>
        </div>
      )}

      {/* Badges */}
      <div className="absolute top-2 right-2 flex gap-1.5">
        {isProfile && (
          <span className="bg-stone-700/85 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Profile
          </span>
        )}
        {isFavorited && (
          <div className="bg-white/90 backdrop-blur-sm rounded-full size-6 flex items-center justify-center">
            <Heart size={12} fill="#C85A5A" className="text-red-400" />
          </div>
        )}
      </div>
    </button>
  );
}
