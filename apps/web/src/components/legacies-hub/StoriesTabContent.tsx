import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, BookOpen, PenLine } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import StoryCard from '@/features/legacy/components/StoryCard';
import StoryCardList from '@/features/legacy/components/StoryCardList';
import { useScopedStories } from '@/features/story/hooks/useStories';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';
import type { StoryScope } from '@/features/story/api/stories';
import Toolbar from './Toolbar';
import type { SortOption } from './Toolbar';
import type { ViewMode } from './Toolbar';
import type { FilterOption } from './QuickFilters';
import { RecentChipRow } from './RecentlyViewedChips';
import type { ChipItem } from './RecentlyViewedChips';

interface StoriesTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

const filterOptions: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My Stories' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'public', label: 'Public' },
  { key: 'private', label: 'Private' },
];

const sortOptions: SortOption[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'edited', label: 'Recently Edited' },
  { value: 'loved', label: 'Most Loved' },
  { value: 'longest', label: 'Longest' },
  { value: 'alpha', label: 'Alphabetical' },
];

export default function StoriesTabContent({
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
}: StoriesTabContentProps) {
  const navigate = useNavigate();

  // Map filter to API scope
  const apiScope: StoryScope = (() => {
    if (activeFilter === 'public' || activeFilter === 'private') return 'all';
    return activeFilter as StoryScope;
  })();

  const { data: stories, isLoading } = useScopedStories(apiScope);

  const storyIds = stories?.items?.map((s) => s.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('story', storyIds);

  const { data: recentlyViewedData } = useRecentlyViewed('story', 6);

  const recentStoryLegacyMap = new Map<string, string>(
    (recentlyViewedData?.items ?? [])
      .filter((item) => item.entity?.legacy_id)
      .map((item) => [item.entity_id, item.entity!.legacy_id!]),
  );

  const recentChips: ChipItem[] = (recentlyViewedData?.items ?? [])
    .filter((item) => item.entity?.legacy_id)
    .map((item) => ({
      id: item.entity_id,
      name: item.entity?.title || 'Untitled',
      imageUrl: null,
      timeAgo: formatDistanceToNow(new Date(item.last_activity_at), { addSuffix: true }),
    }));

  const filteredAndSorted = useMemo(() => {
    if (!stories?.items) return [];
    let items = [...stories.items];

    // Visibility filter
    if (activeFilter === 'public') items = items.filter((s) => s.visibility === 'public');
    if (activeFilter === 'private') items = items.filter((s) => s.visibility !== 'public');

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.content_preview?.toLowerCase().includes(q) ||
          s.author_name?.toLowerCase().includes(q),
      );
    }

    // Sort
    switch (sortBy) {
      case 'edited':
        items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
      case 'loved':
        items.sort((a, b) => (b.favorite_count ?? 0) - (a.favorite_count ?? 0));
        break;
      case 'longest':
        items.sort((a, b) => (b.content_preview?.length ?? 0) - (a.content_preview?.length ?? 0));
        break;
      case 'alpha':
        items.sort((a, b) => a.title.localeCompare(b.title));
        break;
      default:
        items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return items;
  }, [stories?.items, activeFilter, searchQuery, sortBy]);

  return (
    <div className="space-y-6">
      <Toolbar
        filterOptions={filterOptions}
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
        sortOptions={sortOptions}
        sortValue={sortBy}
        onSortChange={onSortChange}
        searchValue={searchQuery}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search stories..."
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />

      {recentChips.length > 0 && (
        <RecentChipRow
          title="Recently Viewed"
          icon={PenLine}
          items={recentChips}
          onItemClick={(id) => {
            const legacyId = recentStoryLegacyMap.get(id);
            if (legacyId) navigate(`/legacy/${legacyId}/story/${id}`);
          }}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && filteredAndSorted.length > 0 &&
        (viewMode === 'grid' ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSorted.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                onClick={() =>
                  navigate(`/legacy/${story.legacies[0]?.legacy_id}/story/${story.id}`)
                }
                isFavorited={favoriteData?.favorites[story.id] ?? false}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden border border-stone-200">
            {filteredAndSorted.map((story) => (
              <StoryCardList
                key={story.id}
                story={story}
                onClick={() =>
                  navigate(`/legacy/${story.legacies[0]?.legacy_id}/story/${story.id}`)
                }
                isFavorited={favoriteData?.favorites[story.id] ?? false}
              />
            ))}
          </div>
        ))}

      {!isLoading && filteredAndSorted.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {searchQuery.trim()
              ? 'No stories match your search.'
              : activeFilter === 'favorites'
                ? "You haven't favorited any stories yet."
                : 'No stories found.'}
          </p>
        </div>
      )}
    </div>
  );
}
