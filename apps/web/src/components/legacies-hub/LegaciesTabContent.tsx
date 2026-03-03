import { useNavigate } from 'react-router-dom';
import { Loader2, BookHeart, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import LegacyCard from '@/components/legacy/LegacyCard';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import type { LegacyScope } from '@/features/legacy/api/legacies';
import QuickFilters from './QuickFilters';
import type { FilterOption } from './QuickFilters';

interface LegaciesTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export default function LegaciesTabContent({ activeFilter, onFilterChange }: LegaciesTabContentProps) {
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
          {data.items.map((legacy) => (
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

          {/* Create New Legacy Card */}
          <Card
            className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group border-2 border-dashed border-neutral-300 hover:border-theme-primary bg-neutral-50 hover:bg-white"
            onClick={() => navigate('/legacy/new')}
          >
            <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-theme-gradient-from to-theme-gradient-to">
              <div className="text-center space-y-3">
                <div className="size-16 rounded-full bg-white/80 flex items-center justify-center mx-auto">
                  <Plus className="size-8 text-theme-primary" />
                </div>
                <p className="text-neutral-700">Create New Legacy</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <h3 className="text-neutral-900 text-center">Start a New Tribute</h3>
              <p className="text-sm text-neutral-600 text-center">Honor someone special with a digital legacy</p>
            </div>
          </Card>
        </div>
      )}

      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-center py-12">
          <BookHeart className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">
            {activeFilter === 'favorites'
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
