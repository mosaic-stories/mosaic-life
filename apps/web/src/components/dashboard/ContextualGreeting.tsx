import { ArrowRight, PenLine } from 'lucide-react';
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
    <section className="bg-gradient-to-b from-theme-background to-transparent">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
          {/* Left: Greeting */}
          <div>
            <h1 className="text-2xl md:text-3xl font-serif font-normal tracking-tight text-neutral-900">
              {greeting}, <span className="italic">{firstName}</span>
            </h1>
            <p className="text-sm text-neutral-500 mt-1.5">
              {unreadCount > 0 ? (
                <button
                  onClick={() => navigate('/notifications')}
                  className="hover:text-theme-primary transition-colors"
                >
                  You have {unreadCount} new{' '}
                  {unreadCount === 1 ? 'notification' : 'notifications'}
                </button>
              ) : (
                'Every story you tell keeps a memory alive.'
              )}
            </p>
          </div>

          {/* Right: Continue Writing CTA card */}
          {recentStory && legacyId && (
            <button
              onClick={() => navigate(`/legacy/${legacyId}/story/${storyId}`)}
              className="flex items-center gap-3.5 bg-white border border-neutral-200 rounded-xl px-5 py-3.5 shadow-sm hover:shadow-md transition-shadow max-w-sm cursor-pointer"
            >
              <div className="size-10 rounded-lg bg-theme-primary/10 flex items-center justify-center shrink-0">
                <PenLine className="size-4 text-theme-primary" />
              </div>
              <div className="min-w-0 text-left">
                <div className="text-xs text-neutral-500">Continue writing</div>
                <div className="text-sm font-medium truncate">
                  {recentStory.title}
                </div>
              </div>
              <ArrowRight className="size-4 text-neutral-400 shrink-0" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
