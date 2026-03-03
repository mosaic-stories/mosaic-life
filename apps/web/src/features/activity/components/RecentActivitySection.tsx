import { AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocialFeed } from '../hooks/useActivity';
import type { SocialFeedItem } from '../api/activity';
import ActivityFeedItem from './ActivityFeedItem';

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

export default function RecentActivitySection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, isError } = useSocialFeed(5);

  if (!isLoading && !isError && (!data || data.items.length === 0)) {
    return null;
  }

  const handleClick = (item: SocialFeedItem) => {
    const route = getActivityRoute(item);
    if (route) navigate(route);
  };

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="space-y-2 mb-6">
          <h2 className="text-neutral-900">Recent Activity</h2>
          <p className="text-neutral-600">
            What&apos;s been happening across your legacies
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-sm text-neutral-500 py-8">
            <AlertCircle className="size-4" />
            <span>Unable to load recent activity</span>
          </div>
        )}

        {!isLoading && !isError && data && data.items.length > 0 && (
          <div className="divide-y divide-neutral-100">
            {data.items.map((item) => (
              <ActivityFeedItem
                key={item.id}
                item={item}
                currentUserId={user?.id || ''}
                onClick={() => handleClick(item)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
