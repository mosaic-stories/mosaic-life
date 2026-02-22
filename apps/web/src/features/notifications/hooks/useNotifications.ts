// TanStack Query hooks for notifications

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listNotifications,
  getUnreadCount,
  updateNotificationStatus,
  markAllAsRead,
} from '@/features/notifications/api/notifications';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (includeDismissed: boolean) =>
    [...notificationKeys.all, 'list', includeDismissed] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

export function useNotifications(includeDismissed = false) {
  return useQuery({
    queryKey: notificationKeys.list(includeDismissed),
    queryFn: () => listNotifications(includeDismissed),
    staleTime: 0, // Always refetch when dropdown opens
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCount,
    staleTime: 30_000, // Cache for 30 seconds
    refetchOnWindowFocus: true,
  });
}

export function useUpdateNotificationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      notificationId,
      status,
    }: {
      notificationId: string;
      status: 'read' | 'dismissed';
    }) => updateNotificationStatus(notificationId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
