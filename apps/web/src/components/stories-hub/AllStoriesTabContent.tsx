import { useNavigate } from 'react-router-dom';
import { Loader2, BookOpen } from 'lucide-react';
import StoryCard from '@/features/legacy/components/StoryCard';
import { useScopedStories } from '@/features/story/hooks/useStories';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import type { StoryScope } from '@/features/story/api/stories';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface AllStoriesTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export default function AllStoriesTabContent({ activeFilter, onFilterChange }: AllStoriesTabContentProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useScopedStories(activeFilter as StoryScope);

  const storyIds = data?.items?.map((s) => s.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('story', storyIds);

  const filterOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: data?.counts?.all },
    { key: 'mine', label: 'My Stories', count: data?.counts?.mine },
    { key: 'shared', label: 'Shared', count: data?.counts?.shared },
    { key: 'favorites', label: 'Favorites' },
  ];

  const handleStoryClick = (storyId: string, legacyId?: string) => {
    if (legacyId) {
      navigate(`/legacy/${legacyId}/story/${storyId}`);
    }
  };

  return (
    <div className="space-y-6">
      <QuickFilters options={filterOptions} activeKey={activeFilter} onChange={onFilterChange} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.items.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onClick={() => handleStoryClick(story.id, story.legacies[0]?.legacy_id)}
              isFavorited={favoriteData?.favorites[story.id] ?? false}
            />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-center py-12">
          <BookOpen className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter === 'favorites'
              ? "You haven't favorited any stories yet."
              : activeFilter === 'shared'
                ? 'No shared stories from your connected legacies.'
                : activeFilter === 'mine'
                  ? "You haven't written any stories yet."
                  : 'No stories found.'}
          </p>
        </div>
      )}
    </div>
  );
}
