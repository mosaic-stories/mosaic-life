import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { NotificationResponse } from '@/features/notifications/api/notifications';
import { formatDistanceToNow } from 'date-fns';

interface NotificationItemProps {
  notification: NotificationResponse;
  onClick: () => void;
  onDismiss: () => void;
}

export default function NotificationItem({
  notification,
  onClick,
  onDismiss,
}: NotificationItemProps) {
  const initials =
    notification.actor_name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase() || '?';

  const isUnread = notification.status === 'unread';
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  return (
    <div
      className={`relative flex gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors ${
        isUnread ? 'bg-blue-50/50' : ''
      }`}
    >
      <button onClick={onClick} className="flex gap-3 flex-1 text-left">
        <Avatar className="size-9 flex-shrink-0">
          <AvatarImage src={notification.actor_avatar_url || undefined} />
          <AvatarFallback className="bg-theme-primary text-white text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-900 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-neutral-500 mt-1">{timeAgo}</p>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="p-1 hover:bg-neutral-200 rounded-full transition-colors self-start"
        aria-label="Dismiss notification"
      >
        <X className="size-4 text-neutral-400" />
      </button>
      {isUnread && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 size-2 bg-blue-500 rounded-full" />
      )}
    </div>
  );
}
