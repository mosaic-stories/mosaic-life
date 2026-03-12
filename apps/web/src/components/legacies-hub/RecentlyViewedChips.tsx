import { useNavigate } from 'react-router-dom';
import { Users, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';
import { rewriteBackendUrlForDev } from '@/lib/url';
import type { EnrichedRecentItem } from '@/features/activity/api/activity';

export interface ChipItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  timeAgo: string;
}

interface RecentChipRowProps {
  title: string;
  icon: LucideIcon;
  items: ChipItem[];
  onItemClick: (id: string) => void;
}

export function RecentChipRow({ title, icon: Icon, items, onItemClick }: RecentChipRowProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold tracking-wider uppercase text-neutral-400 mb-2.5 flex items-center gap-1.5">
        <Icon className="size-3.5" />
        {title}
      </h3>
      <div className="flex gap-2.5 flex-wrap">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick(item.id)}
            className="flex items-center gap-2.5 bg-white px-3.5 py-2 rounded-xl border border-stone-200 hover:border-stone-300 transition-colors cursor-pointer"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="size-7 rounded-full object-cover border-[1.5px] border-stone-200"
              />
            ) : (
              <div className="size-7 rounded-full bg-stone-100 flex items-center justify-center">
                <Users className="size-3.5 text-neutral-300" />
              </div>
            )}
            <div className="text-left">
              <div className="text-sm font-medium text-neutral-900 leading-tight max-w-[180px] truncate">
                {item.name}
              </div>
              <div className="text-xs text-neutral-400">{item.timeAgo}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function RecentlyViewedChips() {
  const navigate = useNavigate();
  const { data, isLoading } = useRecentlyViewed('legacy', 6);

  if (isLoading) return null;
  if (!data || !data.tracking_enabled || data.items.length === 0) return null;

  const chipItems: ChipItem[] = data.items
    .filter((item: EnrichedRecentItem) => item.entity)
    .map((item: EnrichedRecentItem) => ({
      id: item.entity_id,
      name: item.entity?.name || item.entity?.title || 'Unknown',
      imageUrl: item.entity?.profile_image_url ? rewriteBackendUrlForDev(item.entity.profile_image_url) : null,
      timeAgo: formatDistanceToNow(new Date(item.last_activity_at), { addSuffix: true }),
    }));

  return (
    <RecentChipRow
      title="Recently Viewed"
      icon={Clock}
      items={chipItems}
      onItemClick={(id) => navigate(`/legacy/${id}`)}
    />
  );
}
