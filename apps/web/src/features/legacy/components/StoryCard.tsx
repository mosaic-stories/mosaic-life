import { Globe, Link2, Lock } from 'lucide-react';
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

  return (
    <div
      className="rounded-xl border border-stone-200 bg-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 group cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="size-5 rounded-full bg-stone-200 shrink-0" />
          <span className="text-xs font-medium text-neutral-500 truncate">
            {story.legacies[0]?.legacy_name ?? 'Unknown Legacy'}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-base font-semibold text-neutral-900 line-clamp-1">{story.title}</h3>
          {!story.shared_from && (
            <FavoriteButton
              entityType="story"
              entityId={story.id}
              isFavorited={isFavorited}
              favoriteCount={story.favorite_count}
            />
          )}
        </div>
        {story.content_preview && (
          <p className="text-sm text-neutral-500 line-clamp-3 mt-2">{story.content_preview}</p>
        )}
        <div className="flex gap-1.5 mt-3">
          {story.status === 'draft' && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Draft
            </span>
          )}
          {story.shared_from && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              <Link2 className="size-3" />Shared
            </span>
          )}
        </div>
      </div>
      <div className="border-t border-stone-100 bg-stone-50 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-theme-primary flex items-center justify-center text-[9px] font-semibold text-white">
            {authorInitials}
          </div>
          <span className="text-xs text-neutral-500">{story.author_name}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-neutral-400 flex items-center gap-1">
            {story.visibility === 'public' ? <Globe className="size-2.5" /> : <Lock className="size-2.5" />}
            {story.visibility === 'private' ? 'Members only' : story.visibility === 'personal' ? 'Personal' : 'Public'}
          </span>
          <span className="text-xs text-neutral-400">{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
