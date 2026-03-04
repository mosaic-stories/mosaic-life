import { Loader2, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ActivityFeedItem from '@/features/activity/components/ActivityFeedItem';
import { useSocialFeed } from '@/features/activity/hooks/useActivity';
import { useAuth } from '@/contexts/AuthContext';
import type { SocialFeedItem } from '@/features/activity/api/activity';
import QuickFilters from './QuickFilters';
import type { FilterOption } from './QuickFilters';

interface ActivityTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

const filterOptions: FilterOption[] = [
  { key: 'all', label: 'All Activity' },
  { key: 'mine', label: 'My Activity' },
];

export default function ActivityTabContent({ activeFilter, onFilterChange }: ActivityTabContentProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: feedData, isLoading } = useSocialFeed(20);

  const currentUserId = user?.id ?? '';

  // Filter items based on scope
  const items = feedData?.items?.filter((item) => {
    if (activeFilter === 'mine') {
      return item.actor.id === currentUserId;
    }
    return true; // 'all' shows everything
  }) ?? [];

  const handleActivityClick = (item: SocialFeedItem) => {
    if (item.entity_type === 'legacy') {
      navigate(`/legacy/${item.entity_id}`);
    } else if (item.entity_type === 'story') {
      // Check metadata for legacy_id since EntitySummary doesn't have it
      const legacyId = (item.metadata as Record<string, string> | null)?.legacy_id;
      if (legacyId) {
        navigate(`/legacy/${legacyId}/story/${item.entity_id}`);
      }
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

      {!isLoading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <ActivityFeedItem
              key={item.id}
              item={item}
              currentUserId={currentUserId}
              onClick={() => handleActivityClick(item)}
            />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-12">
          <Activity className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">No activity to show yet.</p>
        </div>
      )}
    </div>
  );
}
