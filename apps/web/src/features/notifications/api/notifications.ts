// Notification API client functions

import { apiGet, apiPatch, apiPost } from './client';

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  resource_type: string | null;
  resource_id: string | null;
  status: 'unread' | 'read' | 'dismissed';
  created_at: string;
}

export interface UnreadCountResponse {
  count: number;
}

export interface NotificationUpdateRequest {
  status: 'read' | 'dismissed';
}

export async function listNotifications(
  includeDismissed = false,
  limit = 50,
  offset = 0
): Promise<NotificationResponse[]> {
  const params = new URLSearchParams({
    include_dismissed: String(includeDismissed),
    limit: String(limit),
    offset: String(offset),
  });
  return apiGet<NotificationResponse[]>(`/api/notifications?${params}`);
}

export async function getUnreadCount(): Promise<UnreadCountResponse> {
  return apiGet<UnreadCountResponse>('/api/notifications/unread-count');
}

export async function updateNotificationStatus(
  notificationId: string,
  status: 'read' | 'dismissed'
): Promise<NotificationResponse> {
  return apiPatch<NotificationResponse>(`/api/notifications/${notificationId}`, {
    status,
  });
}

export async function markAllAsRead(): Promise<{ message: string; count: number }> {
  return apiPost<{ message: string; count: number }>('/api/notifications/mark-all-read');
}
