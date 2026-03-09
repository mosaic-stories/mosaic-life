import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({ data: null, isLoading: false }),
  useSocialFeed: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({ data: { items: [] }, isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useMyFavorites: () => ({ data: null, isLoading: false }),
}));

import DashboardPage from './DashboardPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardPage', () => {
  it('renders the contextual greeting', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T10:00:00'));
    renderPage();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/good morning,\s*joe/i);
    vi.useRealTimers();
  });

  it('renders My Legacies section', () => {
    renderPage();
    expect(screen.getByText(/my legacies/i)).toBeInTheDocument();
  });

  it('does NOT render hero or CTA sections', () => {
    renderPage();
    expect(screen.queryByText(/honor the lives and milestones/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/start creating today/i)).not.toBeInTheDocument();
  });

  it('renders "View all" link in the My Legacies header', () => {
    renderPage();
    expect(screen.getByText('View all')).toBeInTheDocument();
  });
});
