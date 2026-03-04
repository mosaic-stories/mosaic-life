import { Loader2, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ActivityFeedItem from '@/features/activity/components/ActivityFeedItem';
import { useSocialFeed } from '@/features/activity/hooks/useActivity';
import { useAuth } from '@/contexts/AuthContext';
import type { SocialFeedItem } from '@/features/activity/api/activity';
import QuickFilters from '@/components/legacies-hub/QuickFilters';
import type { FilterOption } from '@/components/legacies-hub/QuickFilters';

interface ConnectionsActivityTabContentProps {
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

const filterOptions: FilterOption[] = [
  { key: 'all', label: 'All Activity' },
  { key: 'mine', label: 'My Activity' },
];

export default function ConnectionsActivityTabContent({ activeFilter, onFilterChange }: ConnectionsActivityTabContentProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: feedData, isLoading } = useSocialFeed(20);

  const currentUserId = user?.id ?? '';

  // Filter to connection-relevant events
  const items = feedData?.items?.filter((item: SocialFeedItem) => {
    // Filter by entity type: conversations and legacy membership events
    const isConnectionEvent =
      item.entity_type === 'conversation' ||
      item.action === 'ai_conversation_started' ||
      item.action === 'ai_story_evolved' ||
      item.action === 'joined' ||
      item.action === 'invited';

    if (!isConnectionEvent) return false;

    if (activeFilter === 'mine') {
      return item.actor.id === currentUserId;
    }
    return true;
  }) ?? [];

  const handleActivityClick = (item: SocialFeedItem) => {
    if (item.entity_type === 'legacy') {
      navigate(`/legacy/${item.entity_id}`);
    } else if (item.entity_type === 'story') {
      const legacyId = (item.metadata as Record<string, unknown> | null)?.legacy_id;
      if (legacyId) {
        navigate(`/legacy/${String(legacyId)}/story/${item.entity_id}`);
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
          {items.map((item: SocialFeedItem) => (
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
          <p className="text-neutral-600">No connection activity to show yet.</p>
        </div>
      )}
    </div>
  );
}
