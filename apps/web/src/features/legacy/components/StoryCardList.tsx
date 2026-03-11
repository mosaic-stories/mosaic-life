import { ChevronRight, Globe, Lock } from 'lucide-react';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import type { StorySummary } from '@/features/story/api/stories';

export interface StoryCardListProps {
  story: StorySummary;
  onClick?: () => void;
  isFavorited?: boolean;
}

export default function StoryCardList({ story, onClick, isFavorited = false }: StoryCardListProps) {
  const formattedDate = new Date(story.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="flex items-start gap-4 px-5 py-4 border-b border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div
        className={`w-[3px] min-h-[48px] rounded-full self-stretch ${isFavorited ? 'bg-red-400' : 'bg-stone-300'}`}
      />

      <div className="size-10 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
        <span className="text-sm text-stone-400 font-medium">
          {story.legacies[0]?.legacy_name?.[0] ?? '?'}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-serif text-base font-semibold text-neutral-900 truncate">{story.title}</h3>
        <div className="text-xs text-neutral-400 mt-0.5">
          {story.legacies[0]?.legacy_name ?? 'Unknown'} · {story.author_name} · {formattedDate}
        </div>
        {story.content_preview && (
          <p className="text-sm text-neutral-500 truncate mt-1">{story.content_preview}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0 pt-1">
        <span className="text-xs text-neutral-400 flex items-center gap-1">
          {story.visibility === 'public' ? <Globe className="size-3" /> : <Lock className="size-3" />}
        </span>
        {!story.shared_from && (
          <FavoriteButton
            entityType="story"
            entityId={story.id}
            isFavorited={isFavorited}
            favoriteCount={story.favorite_count}
          />
        )}
        <ChevronRight className="size-4 text-neutral-300" />
      </div>
    </div>
  );
}
