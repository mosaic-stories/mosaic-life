import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useMyFavorites } from '../hooks/useFavorites';
import type { EntityType, FavoriteItem } from '../api/favorites';

type FilterType = 'all' | EntityType;

function FavoriteCard({ item, onClick }: { item: FavoriteItem; onClick: () => void }) {
  if (!item.entity) return null;

  return (
    <Card
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer p-4 space-y-2"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 capitalize">
          {item.entity_type}
        </span>
        <Heart className="size-3 fill-red-500 text-red-500" />
      </div>

      <h4 className="text-sm font-medium text-neutral-900 line-clamp-1">
        {(item.entity as Record<string, string>).title
          || (item.entity as Record<string, string>).name
          || (item.entity as Record<string, string>).filename
          || 'Untitled'}
      </h4>

      {(item.entity as Record<string, string>).content_preview && (
        <p className="text-xs text-neutral-500 line-clamp-2">
          {(item.entity as Record<string, string>).content_preview}
        </p>
      )}

      {(item.entity as Record<string, string>).biography && (
        <p className="text-xs text-neutral-500 line-clamp-2">
          {(item.entity as Record<string, string>).biography}
        </p>
      )}
    </Card>
  );
}

export default function FavoritesSection() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('all');
  const entityTypeFilter = filter === 'all' ? undefined : filter;
  const { data, isLoading } = useMyFavorites(entityTypeFilter, 8);

  // Don't render section if no favorites
  if (!isLoading && (!data || data.total === 0) && filter === 'all') {
    return null;
  }

  const filters: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Stories', value: 'story' },
    { label: 'Legacies', value: 'legacy' },
    { label: 'Media', value: 'media' },
  ];

  const handleItemClick = (item: FavoriteItem) => {
    const entity = item.entity as Record<string, string> | null;
    const legacyId = entity?.legacy_id;
    switch (item.entity_type) {
      case 'story':
        if (legacyId) {
          navigate(`/legacy/${legacyId}/story/${item.entity_id}`);
        }
        break;
      case 'legacy':
        navigate(`/legacy/${item.entity_id}`);
        break;
      case 'media':
        if (legacyId) {
          navigate(`/legacy/${legacyId}/gallery`);
        }
        break;
    }
  };

  return (
    <section className="bg-neutral-50 py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="space-y-2 mb-6">
          <h2 className="text-neutral-900">My Favorites</h2>
          <p className="text-neutral-600">
            Your saved stories, legacies, and media
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === f.value
                  ? 'bg-theme-primary text-white'
                  : 'border border-neutral-200 hover:border-theme-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {!isLoading && data && data.items.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.items.map(item => (
              <FavoriteCard
                key={item.id}
                item={item}
                onClick={() => handleItemClick(item)}
              />
            ))}
          </div>
        )}

        {!isLoading && data && data.items.length === 0 && filter !== 'all' && (
          <p className="text-center text-neutral-500 py-8">
            No {filter} favorites yet
          </p>
        )}
      </div>
    </section>
  );
}
