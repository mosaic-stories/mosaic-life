import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, BookHeart, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import LegacyCard from '@/components/legacy/LegacyCard';
import LegacyCardList from '@/components/legacy/LegacyCardList';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';
import { rewriteBackendUrlForDev } from '@/lib/url';
import type { LegacyScope } from '@/features/legacy/api/legacies';
import Toolbar from './Toolbar';
import type { SortOption } from './Toolbar';
import type { ViewMode } from './Toolbar';
import type { FilterOption } from './QuickFilters';
import { RecentChipRow } from './RecentlyViewedChips';
import type { ChipItem } from './RecentlyViewedChips';

interface LegaciesTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export default function LegaciesTabContent({
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
}: LegaciesTabContentProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useLegacies(activeFilter as LegacyScope);

  const legacyIds = data?.items?.map((l) => l.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('legacy', legacyIds);

  const filterOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: data?.counts?.all },
    { key: 'created', label: 'My Legacies', count: data?.counts?.created },
    { key: 'connected', label: 'Connected', count: data?.counts?.connected },
    { key: 'favorites', label: 'Favorites' },
  ];

  const sortOptions: SortOption[] = [
    { value: 'recent', label: 'Most Recent' },
    { value: 'stories', label: 'Most Stories' },
    { value: 'members', label: 'Most Members' },
    { value: 'alpha', label: 'Alphabetical' },
  ];

  const filteredAndSorted = useMemo(() => {
    if (!data?.items) return [];
    let items = [...data.items];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        l.biography?.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case 'stories': items.sort((a, b) => (b.story_count ?? 0) - (a.story_count ?? 0)); break;
      case 'members': items.sort((a, b) => (b.members?.length ?? 0) - (a.members?.length ?? 0)); break;
      case 'alpha': items.sort((a, b) => a.name.localeCompare(b.name)); break;
      default: items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    return items;
  }, [data?.items, searchQuery, sortBy]);

  const { data: recentlyViewedData } = useRecentlyViewed('legacy', 6);

  const recentChips: ChipItem[] = (recentlyViewedData?.items ?? [])
    .filter((item) => item.entity)
    .map((item) => ({
      id: item.entity_id,
      name: item.entity?.name || item.entity?.title || 'Unknown',
      imageUrl: item.entity?.profile_image_url ? rewriteBackendUrlForDev(item.entity.profile_image_url) : null,
      timeAgo: formatDistanceToNow(new Date(item.last_activity_at), { addSuffix: true }),
    }));

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
        searchPlaceholder="Search legacies..."
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />

      <RecentChipRow
        title="Recently Viewed"
        icon={Clock}
        items={recentChips}
        onItemClick={(id) => navigate(`/legacy/${id}`)}
      />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && filteredAndSorted.length > 0 && (
        viewMode === 'grid' ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSorted.map((legacy) => (
              <LegacyCard
                key={legacy.id}
                legacy={legacy}
                trailingAction={
                  <FavoriteButton
                    entityType="legacy"
                    entityId={legacy.id}
                    isFavorited={favoriteData?.favorites[legacy.id] ?? false}
                    favoriteCount={legacy.favorite_count ?? 0}
                  />
                }
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden border border-stone-200">
            {filteredAndSorted.map((legacy) => (
              <LegacyCardList
                key={legacy.id}
                legacy={legacy}
                trailingAction={
                  <FavoriteButton
                    entityType="legacy"
                    entityId={legacy.id}
                    isFavorited={favoriteData?.favorites[legacy.id] ?? false}
                    favoriteCount={legacy.favorite_count ?? 0}
                  />
                }
              />
            ))}
          </div>
        )
      )}

      {!isLoading && filteredAndSorted.length === 0 && (
        <div className="text-center py-12">
          <BookHeart className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {searchQuery.trim()
              ? 'No legacies match your search.'
              : activeFilter === 'favorites'
                ? "You haven't favorited any legacies yet."
                : activeFilter === 'connected'
                  ? "You haven't joined any legacies yet."
                  : 'No legacies found.'}
          </p>
        </div>
      )}
    </div>
  );
}
