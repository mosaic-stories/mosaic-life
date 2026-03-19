import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUpdateNotificationStatus } from '@/features/notifications/hooks/useNotifications';
import {
  useAcceptRequest,
  useDeclineRequest,
  useIncomingRequests,
} from '@/features/user-connections/hooks/useUserConnections';
import { resolveNotificationLink } from '@/features/notifications/utils/notificationRouting';
import type { NotificationResponse } from '@/features/notifications/api/notifications';

/**
 * Centralises notification action logic (mark-read, click navigation, inline
 * accept/decline for connection requests) so it can be shared between
 * HeaderUserMenu and NotificationHistory without duplicating state or handlers.
 *
 * Per-notification pending state is tracked with a Set so that accepting or
 * declining one request does not disable action buttons on unrelated rows.
 *
 * `useIncomingRequests` is only fetched when the notification list actually
 * contains a connection_request_received notification.
 */
export function useNotificationActions(
  notifications: NotificationResponse[] | undefined
) {
  const navigate = useNavigate();
  const updateStatus = useUpdateNotificationStatus();
  const acceptRequest = useAcceptRequest();
  const declineRequest = useDeclineRequest();

  const [pendingAcceptIds, setPendingAcceptIds] = useState<Set<string>>(
    new Set()
  );
  const [pendingDeclineIds, setPendingDeclineIds] = useState<Set<string>>(
    new Set()
  );

  const hasIncomingRequestNotification = (notifications ?? []).some(
    (n) => n.type === 'connection_request_received'
  );

  const { data: incomingRequests } = useIncomingRequests({
    enabled: hasIncomingRequestNotification,
  });

  const markReadIfNeeded = (
    notification: Pick<NotificationResponse, 'id' | 'status'>
  ) => {
    if (notification.status === 'unread') {
      updateStatus.mutate({ notificationId: notification.id, status: 'read' });
    }
  };

  const handleNotificationClick = (
    notification: Pick<
      NotificationResponse,
      'id' | 'link' | 'type' | 'resource_id' | 'status'
    >
  ) => {
    markReadIfNeeded(notification);
    const href = resolveNotificationLink(notification);
    if (href) {
      navigate(href);
    }
  };

  const handleAccept = (
    notification: Pick<NotificationResponse, 'id' | 'resource_id' | 'status'>
  ) => {
    if (!notification.resource_id) {
      return;
    }
    const resourceId = notification.resource_id;

    setPendingAcceptIds((prev) => new Set(prev).add(resourceId));

    acceptRequest.mutate(resourceId, {
      onSuccess: (connection) => {
        setPendingAcceptIds((prev) => {
          const next = new Set(prev);
          next.delete(resourceId);
          return next;
        });
        markReadIfNeeded(notification);
        navigate(
          `/connections?tab=my-connections&filter=all&connection=${connection.id}`
        );
      },
      onError: () => {
        setPendingAcceptIds((prev) => {
          const next = new Set(prev);
          next.delete(resourceId);
          return next;
        });
      },
    });
  };

  const handleDecline = (
    notification: Pick<NotificationResponse, 'id' | 'resource_id' | 'status'>
  ) => {
    if (!notification.resource_id) {
      return;
    }
    const resourceId = notification.resource_id;

    setPendingDeclineIds((prev) => new Set(prev).add(resourceId));

    declineRequest.mutate(resourceId, {
      onSuccess: () => {
        setPendingDeclineIds((prev) => {
          const next = new Set(prev);
          next.delete(resourceId);
          return next;
        });
        markReadIfNeeded(notification);
      },
      onError: () => {
        setPendingDeclineIds((prev) => {
          const next = new Set(prev);
          next.delete(resourceId);
          return next;
        });
      },
    });
  };

  return {
    incomingRequests,
    handleNotificationClick,
    handleAccept,
    handleDecline,
    isAcceptPending: (resourceId: string) => pendingAcceptIds.has(resourceId),
    isDeclinePending: (resourceId: string) => pendingDeclineIds.has(resourceId),
  };
}
