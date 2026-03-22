import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelmetProvider } from 'react-helmet-async';
import NotificationHistory from './NotificationHistory';

const mockNavigate = vi.fn();
const mockUpdateStatus = vi.fn();
const mockAcceptRequest = vi.fn();
const mockDeclineRequest = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useNotifications: () => ({
    data: [
      {
        id: 'notif-1',
        type: 'connection_request_received',
        title: 'New connection request',
        message: 'Sarah Chen wants to connect with you',
        link: null,
        actor_id: 'user-2',
        actor_name: 'Sarah Chen',
        actor_avatar_url: null,
        actor_username: 'sarah-chen',
        resource_type: 'connection_request',
        resource_id: 'request-1',
        status: 'unread',
        created_at: '2026-03-18T00:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useUpdateNotificationStatus: () => ({
    mutate: mockUpdateStatus,
  }),
}));

vi.mock('@/features/user-connections/hooks/useUserConnections', () => ({
  useIncomingRequests: () => ({
    data: [
      {
        id: 'request-1',
        from_user_id: 'user-2',
        from_user_name: 'Sarah Chen',
        from_user_username: 'sarah-chen',
        from_user_avatar_url: null,
        to_user_id: 'user-1',
        to_user_name: 'John Doe',
        to_user_username: 'john-doe',
        to_user_avatar_url: null,
        relationship_type: 'friend',
        message: 'Hi',
        status: 'pending',
        created_at: '2026-03-18T00:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useAcceptRequest: () => ({ mutate: mockAcceptRequest, isPending: false }),
  useDeclineRequest: () => ({ mutate: mockDeclineRequest, isPending: false }),
}));

function renderHistory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <MemoryRouter>
          <NotificationHistory />
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  );
}

describe('NotificationHistory', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUpdateStatus.mockReset();
    mockAcceptRequest.mockReset();
    mockDeclineRequest.mockReset();
  });

  it('resolves fallback links for connection request notifications', async () => {
    const user = userEvent.setup();
    renderHistory();

    await user.click(screen.getByRole('button', { name: /new connection request/i }));

    expect(mockUpdateStatus).toHaveBeenCalledWith({
      notificationId: 'notif-1',
      status: 'read',
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/my/conversations?tab=requests&filter=all&focus=incoming&request=request-1'
    );
  });

  it('shows inline accept and decline actions for pending incoming requests', () => {
    renderHistory();

    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('calls accept mutation with the correct resource_id', async () => {
    const user = userEvent.setup();
    renderHistory();

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mockAcceptRequest).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(mockDeclineRequest).not.toHaveBeenCalled();
  });

  it('calls decline mutation with the correct resource_id', async () => {
    const user = userEvent.setup();
    renderHistory();

    await user.click(screen.getByRole('button', { name: 'Decline' }));

    expect(mockDeclineRequest).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(mockAcceptRequest).not.toHaveBeenCalled();
  });
});
