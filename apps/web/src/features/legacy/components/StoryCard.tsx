import { Globe, Lock } from 'lucide-react';
import type { StorySummary } from '@/features/story/api/stories';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';

export interface StoryCardProps {
  story: StorySummary;
  onClick?: () => void;
  isFavorited?: boolean;
}

export default function StoryCard({ story, onClick, isFavorited = false }: StoryCardProps) {
  const authorInitials = story.author_name
    ? story.author_name.split(' ').map(n => n[0]).join('')
    : '?';
  const formattedDate = new Date(story.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const visibilityLabel =
    story.visibility === 'public' ? 'Public' :
    story.visibility === 'personal' ? 'Personal' : 'Members only';

  return (
    <div
      className="rounded-xl border border-stone-200 bg-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <div className="p-5">
        {/* Title + favorite */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-serif text-[17px] font-semibold text-neutral-900 leading-snug line-clamp-2">
            {story.title}
          </h3>
          {!story.shared_from && (
            <FavoriteButton
              entityType="story"
              entityId={story.id}
              isFavorited={isFavorited}
              favoriteCount={story.favorite_count}
            />
          )}
        </div>

        {/* Content preview */}
        {story.content_preview && (
          <p className="text-sm text-neutral-500 line-clamp-3 leading-relaxed">
            {story.content_preview}
          </p>
        )}

        {/* Status badges */}
        <div className="flex gap-1.5 mt-3">
          {story.status === 'draft' && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Draft
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-stone-100 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-theme-primary flex items-center justify-center text-[9px] font-semibold text-white">
            {authorInitials}
          </div>
          <span className="text-xs text-neutral-500">{story.author_name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-neutral-400 flex items-center gap-1">
            {story.visibility === 'public' ? <Globe size={11} /> : <Lock size={11} />}
            {visibilityLabel}
          </span>
          <span className="text-[11px] text-neutral-400">{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
