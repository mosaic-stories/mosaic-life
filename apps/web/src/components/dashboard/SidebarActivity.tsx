import { AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocialFeed } from '@/features/activity/hooks/useActivity';
import ActivityFeedItem from '@/features/activity/components/ActivityFeedItem';
import type { SocialFeedItem } from '@/features/activity/api/activity';

function getActivityRoute(item: SocialFeedItem): string | null {
  switch (item.entity_type) {
    case 'legacy':
      return `/legacy/${item.entity_id}`;
    case 'story': {
      const legacyId =
        item.entity?.legacy_id ??
        (item.metadata as { legacy_id?: string } | null)?.legacy_id;
      return legacyId
        ? `/legacy/${legacyId}/story/${item.entity_id}`
        : null;
    }
    case 'media': {
      const legacyId =
        item.entity?.legacy_id ??
        (item.metadata as { legacy_id?: string } | null)?.legacy_id;
      return legacyId ? `/legacy/${legacyId}/gallery` : null;
    }
    default:
      return null;
  }
}

export default function SidebarActivity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, isError } = useSocialFeed(4);

  if (!isLoading && !isError && (!data || data.items.length === 0))
    return null;

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3.5">
        Recent Activity
      </h3>
      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-theme-primary" />
        </div>
      )}
      {isError && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 py-4">
          <AlertCircle className="size-3.5" />
          <span>Unable to load activity</span>
        </div>
      )}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="divide-y divide-neutral-100">
          {data.items.map((item) => (
            <ActivityFeedItem
              key={item.id}
              item={item}
              currentUserId={user?.id || ''}
              onClick={() => {
                const route = getActivityRoute(item);
                if (route) navigate(route);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
