import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';
import { rewriteBackendUrlForDev } from '@/lib/url';
import type { EnrichedRecentItem } from '@/features/activity/api/activity';

function Chip({ item, onClick }: { item: EnrichedRecentItem; onClick: () => void }) {
  const entity = item.entity;
  if (!entity) return null;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 min-w-0 group"
    >
      <div className="size-12 rounded-full overflow-hidden bg-neutral-100 ring-2 ring-transparent group-hover:ring-theme-primary transition-all">
        {entity.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(entity.profile_image_url)}
            alt={entity.name || ''}
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full flex items-center justify-center">
            <Users className="size-5 text-neutral-300" />
          </div>
        )}
      </div>
      <span className="text-xs text-neutral-600 truncate max-w-[72px]">
        {entity.name?.split(' ')[0] || 'Unknown'}
      </span>
    </button>
  );
}

export default function RecentlyViewedChips() {
  const navigate = useNavigate();
  const { data, isLoading } = useRecentlyViewed('legacy', 6);

  if (isLoading) return null;
  if (!data || !data.tracking_enabled || data.items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-500">Recently Viewed</h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.items.map((item) => (
          <Chip
            key={item.entity_id}
            item={item}
            onClick={() => navigate(`/legacy/${item.entity_id}`)}
          />
        ))}
      </div>
    </div>
  );
}
