import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HeaderUserMenu from './HeaderUserMenu';

// Mock notification hooks
vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 3 } }),
  useNotifications: () => ({ data: [], refetch: vi.fn() }),
  useUpdateNotificationStatus: () => ({ mutate: vi.fn() }),
  useMarkAllAsRead: () => ({ mutate: vi.fn() }),
}));

const mockLogout = vi.fn().mockResolvedValue(undefined);
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

const mockUser = {
  name: 'John Doe',
  email: 'john@example.com',
  avatarUrl: undefined,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('HeaderUserMenu', () => {
  it('renders user avatar with initials', () => {
    renderWithProviders(
      <HeaderUserMenu user={mockUser} />
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('shows notification badge when there are unread notifications', () => {
    renderWithProviders(
      <HeaderUserMenu user={mockUser} />
    );

    // Red dot indicator should be present
    expect(document.querySelector('.bg-red-500')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HeaderUserMenu user={mockUser} />
    );

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      // Notifications text includes unread count: "Notifications (3)"
      expect(screen.getByText(/Notifications/)).toBeInTheDocument();
    });
    expect(screen.getByText('My Legacies')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('calls logout when sign out is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HeaderUserMenu user={mockUser} />
    );

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sign Out'));

    expect(mockLogout).toHaveBeenCalled();
  });
});
