import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { useMyFavorites } from '@/features/favorites/hooks/useFavorites';
import type { EntityType, FavoriteItem } from '@/features/favorites/api/favorites';

type FilterType = 'all' | EntityType;

export default function SidebarFavorites() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('all');
  const entityTypeFilter = filter === 'all' ? undefined : filter;
  const { data, isLoading } = useMyFavorites(entityTypeFilter, 4);

  if (!isLoading && (!data || data.total === 0) && filter === 'all') return null;

  const filters: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Stories', value: 'story' },
    { label: 'Legacies', value: 'legacy' },
    { label: 'Media', value: 'media' },
  ];

  const handleItemClick = (item: FavoriteItem) => {
    const entity = item.entity;
    const legacyId = entity?.legacy_id as string | undefined;
    switch (item.entity_type) {
      case 'story':
        if (legacyId) navigate(`/legacy/${legacyId}/story/${item.entity_id}`);
        break;
      case 'legacy':
        navigate(`/legacy/${item.entity_id}`);
        break;
      case 'media':
        if (legacyId) navigate(`/legacy/${legacyId}/gallery`);
        break;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4">
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          My Favorites
        </h3>
        <button
          onClick={() => navigate('/favorites')}
          className="text-xs text-theme-primary hover:underline"
        >
          See all
        </button>
      </div>
      <div className="flex rounded-lg overflow-hidden border border-neutral-100 mb-3.5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-1 py-1.5 text-[11px] font-medium capitalize transition-colors ${
              filter === f.value
                ? 'bg-theme-primary text-white'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-theme-primary" />
        </div>
      )}
      {!isLoading && data && data.items.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.items.slice(0, 3).map((item) => {
            const entity = item.entity;
            if (!entity) return null;
            const title =
              (entity.title as string) ||
              (entity.name as string) ||
              (entity.filename as string) ||
              'Untitled';
            const legacyName = entity.legacy_name as string | undefined;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
              >
                <Heart className="size-3 text-theme-primary opacity-70 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{title}</div>
                  <div className="text-[11px] text-neutral-400">
                    {item.entity_type}
                    {legacyName ? ` \u00b7 ${legacyName}` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {!isLoading && data && data.items.length === 0 && filter !== 'all' && (
        <p className="text-xs text-neutral-400 text-center py-4">
          No {filter} favorites yet
        </p>
      )}
    </div>
  );
}
