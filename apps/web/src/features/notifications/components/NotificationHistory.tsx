import {
  useNotifications,
  useUpdateNotificationStatus,
} from '@/features/notifications/hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Bell } from 'lucide-react';
import { SEOHead } from '@/components/seo';

export default function NotificationHistory() {
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useNotifications(true); // Include dismissed
  const updateStatus = useUpdateNotificationStatus();

  const handleNotificationClick = (notification: {
    id: string;
    link: string | null;
    status: string;
  }) => {
    if (notification.status === 'unread') {
      updateStatus.mutate({ notificationId: notification.id, status: 'read' });
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleDismiss = (notificationId: string) => {
    updateStatus.mutate({ notificationId, status: 'dismissed' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))]">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-neutral-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))]">
      <SEOHead
        title="Notification History"
        description="View your notification history"
        noIndex={true}
      />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-neutral-900 mb-6">
          Notification History
        </h1>

        {!notifications || notifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="size-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-500">No notifications yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {notifications.map((notification) => {
              const initials =
                notification.actor_name
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase() || '?';
              const isUnread = notification.status === 'unread';
              const isDismissed = notification.status === 'dismissed';
              const timeAgo = formatDistanceToNow(
                new Date(notification.created_at),
                {
                  addSuffix: true,
                }
              );

              return (
                <div
                  key={notification.id}
                  className={`relative flex gap-4 p-4 ${
                    isUnread
                      ? 'bg-blue-50/50'
                      : isDismissed
                        ? 'opacity-60'
                        : ''
                  }`}
                >
                  <button
                    onClick={() => handleNotificationClick(notification)}
                    className="flex gap-4 flex-1 text-left"
                    disabled={isDismissed}
                  >
                    <Avatar className="size-10 flex-shrink-0">
                      <AvatarImage
                        src={notification.actor_avatar_url || undefined}
                      />
                      <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {notification.title}
                      </p>
                      <p className="text-sm text-neutral-600 mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-neutral-500 mt-2">{timeAgo}</p>
                    </div>
                  </button>
                  {!isDismissed && (
                    <button
                      onClick={() => handleDismiss(notification.id)}
                      className="p-1 hover:bg-neutral-200 rounded-full transition-colors self-start"
                      aria-label="Dismiss notification"
                    >
                      <X className="size-4 text-neutral-400" />
                    </button>
                  )}
                  {isUnread && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 size-2 bg-blue-500 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
