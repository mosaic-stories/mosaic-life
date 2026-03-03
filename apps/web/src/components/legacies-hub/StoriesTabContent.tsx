import { Loader2, BookOpen } from 'lucide-react';
import StoryCard from '@/features/legacy/components/StoryCard';
import { useScopedStories } from '@/features/story/hooks/useStories';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import type { StoryScope } from '@/features/story/api/stories';
import QuickFilters from './QuickFilters';
import type { FilterOption } from './QuickFilters';

interface StoriesTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

const filterOptions: FilterOption[] = [
  { key: 'mine', label: 'My Stories' },
  { key: 'shared', label: 'Shared' },
  { key: 'favorites', label: 'Favorites' },
];

export default function StoriesTabContent({ activeFilter, onFilterChange }: StoriesTabContentProps) {
  const { data: stories, isLoading } = useScopedStories(activeFilter as StoryScope);

  const storyIds = stories?.items?.map((s) => s.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('story', storyIds);

  return (
    <div className="space-y-6">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && stories && stories.items.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stories.items.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              isFavorited={favoriteData?.favorites[story.id] ?? false}
            />
          ))}
        </div>
      )}

      {!isLoading && (!stories || stories.items.length === 0) && (
        <div className="text-center py-12">
          <BookOpen className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter === 'favorites'
              ? "You haven't favorited any stories yet."
              : activeFilter === 'shared'
                ? 'No shared stories from your connected legacies.'
                : "You haven't written any stories yet."}
          </p>
        </div>
      )}
    </div>
  );
}
