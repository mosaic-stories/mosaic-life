import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppHeader from './AppHeader';
import { HeaderProvider } from './HeaderContext';

// Mock useIsMobile hook
vi.mock('@/components/ui/use-mobile', () => ({
  useIsMobile: () => false,
}));

// Mock notification hooks
vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
  useNotifications: () => ({ data: [], refetch: vi.fn() }),
  useUpdateNotificationStatus: () => ({ mutate: vi.fn() }),
  useMarkAllAsRead: () => ({ mutate: vi.fn() }),
}));

// Mock auth
let mockUser: { id: string; name: string; email: string; avatar_url?: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, login: vi.fn(), logout: vi.fn() }),
}));

vi.mock('@/lib/hooks/useAuthModal', () => ({
  useAuthModal: (selector: (s: { open: () => void }) => unknown) =>
    selector({ open: vi.fn() }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HeaderProvider>{ui}</HeaderProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppHeader', () => {
  it('renders logo', () => {
    mockUser = null;
    renderWithProviders(<AppHeader />);

    expect(screen.getByRole('button', { name: /mosaic life/i })).toBeInTheDocument();
  });

  it('shows sign in button when not logged in', () => {
    mockUser = null;
    renderWithProviders(<AppHeader />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows user menu when logged in', () => {
    mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' };
    renderWithProviders(<AppHeader />);

    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });
});
