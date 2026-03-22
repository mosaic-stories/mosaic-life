import type { NotificationResponse } from '@/features/notifications/api/notifications';

export function resolveNotificationLink(
  notification: Pick<NotificationResponse, 'type' | 'link' | 'resource_id'>
): string | null {
  if (notification.link) {
    return notification.link;
  }

  switch (notification.type) {
    case 'connection_request_received':
      return notification.resource_id
        ? `/my/conversations?tab=requests&filter=all&focus=incoming&request=${notification.resource_id}`
        : '/my/conversations?tab=requests&filter=all&focus=incoming';
    case 'connection_request_accepted':
      return notification.resource_id
        ? `/my/conversations?tab=my-connections&filter=all&connection=${notification.resource_id}`
        : '/my/conversations?tab=my-connections&filter=all';
    case 'connection_request_declined':
      return '/my/conversations?tab=requests&filter=all&focus=outgoing';
    default:
      return null;
  }
}
