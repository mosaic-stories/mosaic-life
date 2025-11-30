import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useUnreadCount,
  useNotifications,
  useUpdateNotificationStatus,
  useMarkAllAsRead,
} from '@/lib/hooks/useNotifications';
import NotificationItem from './NotificationItem';
import { Button } from '@/components/ui/button';

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: unreadData } = useUnreadCount();
  const { data: notifications, refetch } = useNotifications(false);
  const updateStatus = useUpdateNotificationStatus();
  const markAllRead = useMarkAllAsRead();

  const unreadCount = unreadData?.count ?? 0;

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      refetch();
    }
  };

  const handleNotificationClick = (notification: {
    id: string;
    link: string | null;
  }) => {
    // Mark as read
    updateStatus.mutate({ notificationId: notification.id, status: 'read' });

    // Navigate if there's a link
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  const handleDismiss = (notificationId: string) => {
    updateStatus.mutate({ notificationId, status: 'dismissed' });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-full hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:ring-offset-2 transition-all"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="size-5 text-neutral-600" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 size-2 bg-red-500 rounded-full" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs h-auto py-1"
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500">
              No notifications
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
                onDismiss={() => handleDismiss(notification.id)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
