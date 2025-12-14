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
vi.mock('@/lib/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
  useNotifications: () => ({ data: [], refetch: vi.fn() }),
  useUpdateNotificationStatus: () => ({ mutate: vi.fn() }),
  useMarkAllAsRead: () => ({ mutate: vi.fn() }),
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
    renderWithProviders(
      <AppHeader
        user={null}
        onNavigate={() => {}}
        onAuthClick={() => {}}
        onSignOut={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /mosaic life/i })).toBeInTheDocument();
  });

  it('shows sign in button when not logged in', () => {
    renderWithProviders(
      <AppHeader
        user={null}
        onNavigate={() => {}}
        onAuthClick={() => {}}
        onSignOut={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows user menu when logged in', () => {
    renderWithProviders(
      <AppHeader
        user={{ name: 'John Doe', email: 'john@example.com' }}
        onNavigate={() => {}}
        onAuthClick={() => {}}
        onSignOut={() => {}}
      />
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });
});
