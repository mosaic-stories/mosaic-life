import {
  useNotifications,
  useUpdateNotificationStatus,
} from '@/features/notifications/hooks/useNotifications';
import {
  useAcceptRequest,
  useDeclineRequest,
  useIncomingRequests,
} from '@/features/user-connections/hooks/useUserConnections';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Bell, UserPlus, UserCheck, UserX, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/seo';
import UserLink from '@/components/UserLink';
import { resolveNotificationLink } from '@/features/notifications/utils/notificationRouting';

function getNotificationIcon(type: string) {
  switch (type) {
    case 'connection_request_received':
      return <UserPlus className="size-4" />;
    case 'connection_request_accepted':
      return <UserCheck className="size-4" />;
    case 'connection_request_declined':
      return <UserX className="size-4" />;
    case 'legacy_access_request_received':
    case 'legacy_access_request_approved':
    case 'legacy_access_request_declined':
      return <KeyRound className="size-4" />;
    default:
      return null;
  }
}

export default function NotificationHistory() {
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useNotifications(true); // Include dismissed
  const { data: incomingRequests } = useIncomingRequests();
  const updateStatus = useUpdateNotificationStatus();
  const acceptRequest = useAcceptRequest();
  const declineRequest = useDeclineRequest();

  const markReadIfNeeded = (notification: {
    id: string;
    status: string;
  }) => {
    if (notification.status === 'unread') {
      updateStatus.mutate({ notificationId: notification.id, status: 'read' });
    }
  };

  const handleNotificationClick = (notification: {
    id: string;
    link: string | null;
    type: string;
    resource_id: string | null;
    status: string;
  }) => {
    markReadIfNeeded(notification);
    const href = resolveNotificationLink(notification);
    if (href) {
      navigate(href);
    }
  };

  const handleAccept = (notification: {
    id: string;
    resource_id: string | null;
    status: string;
  }) => {
    if (!notification.resource_id) {
      return;
    }

    acceptRequest.mutate(notification.resource_id, {
      onSuccess: (connection) => {
        markReadIfNeeded(notification);
        navigate(
          `/connections?tab=my-connections&filter=all&connection=${connection.id}`
        );
      },
    });
  };

  const handleDecline = (notification: {
    id: string;
    resource_id: string | null;
    status: string;
  }) => {
    if (!notification.resource_id) {
      return;
    }

    declineRequest.mutate(notification.resource_id, {
      onSuccess: () => {
        markReadIfNeeded(notification);
      },
    });
  };

  const handleDismiss = (notificationId: string) => {
    updateStatus.mutate({ notificationId, status: 'dismissed' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-theme-background">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-neutral-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-background">
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
              const hasInlineActions =
                !isDismissed &&
                notification.type === 'connection_request_received' &&
                !!notification.resource_id &&
                (incomingRequests ?? []).some(
                  (request) => request.id === notification.resource_id
                );
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
                  <div className="relative flex-shrink-0">
                    <Avatar className="size-10">
                      <AvatarImage
                        src={notification.actor_avatar_url || undefined}
                      />
                      <AvatarFallback className="bg-theme-primary text-white text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {getNotificationIcon(notification.type) && (
                      <span className="absolute -bottom-1 -right-1 size-5 bg-white rounded-full flex items-center justify-center shadow-sm border text-neutral-600">
                        {getNotificationIcon(notification.type)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {notification.actor_username && notification.actor_name && (
                      <UserLink
                        username={notification.actor_username}
                        displayName={notification.actor_name}
                        className="text-sm font-medium text-neutral-900 mb-1"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className="w-full text-left"
                      disabled={isDismissed}
                    >
                      <p className="text-sm font-medium text-neutral-900">
                        {notification.title}
                      </p>
                      <p className="text-sm text-neutral-600 mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-neutral-500 mt-2">{timeAgo}</p>
                    </button>
                    {hasInlineActions && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(notification)}
                          disabled={acceptRequest.isPending}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecline(notification)}
                          disabled={declineRequest.isPending}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
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
