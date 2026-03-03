import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';
import { useUnreadCount } from '@/features/notifications/hooks/useNotifications';

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function getFirstName(name?: string): string {
  if (!name) return '';
  return name.split(' ')[0];
}

export default function ContextualGreeting() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: recentStories } = useRecentlyViewed('story', 1);
  const { data: unreadData } = useUnreadCount();

  const hour = new Date().getHours();
  const greeting = getGreeting(hour);
  const firstName = getFirstName(user?.name || user?.email);

  // Priority 1: Resume editing a recent story
  const recentStory = recentStories?.items?.[0]?.entity;
  const storyId = recentStories?.items?.[0]?.entity_id;
  const legacyId = recentStory?.legacy_id;

  // Priority 2: Unread notifications
  const unreadCount = unreadData?.count ?? 0;

  return (
    <section className="max-w-7xl mx-auto px-6 pt-8 pb-4">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">
        {greeting}, {firstName}
      </h1>

      <div className="mt-2">
        {recentStory && legacyId ? (
          <button
            onClick={() => navigate(`/legacy/${legacyId}/story/${storyId}`)}
            className="text-neutral-600 hover:text-theme-primary transition-colors inline-flex items-center gap-1 group"
          >
            Continue editing &ldquo;{recentStory.title}&rdquo;
            <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : unreadCount > 0 ? (
          <button
            onClick={() => navigate('/notifications')}
            className="text-neutral-600 hover:text-theme-primary transition-colors"
          >
            You have {unreadCount} new {unreadCount === 1 ? 'notification' : 'notifications'}
          </button>
        ) : (
          <p className="text-neutral-500">What would you like to work on today?</p>
        )}
      </div>
    </section>
  );
}
