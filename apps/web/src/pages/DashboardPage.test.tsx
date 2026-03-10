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
  useLegacies: () => ({
    data: {
      items: [
        {
          id: 'legacy-1',
          name: 'A production length legacy name that should still fit inside the dashboard without forcing horizontal scrolling across the page',
          birth_date: '1950-01-01',
          death_date: '2020-12-31',
          biography: 'Long production biography content that should wrap or clamp instead of widening the dashboard grid and pushing the sidebar off screen.',
          visibility: 'public',
          created_by: 'user-1',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          members: [],
          profile_image_url: null,
          story_count: 4,
        },
      ],
    },
    isLoading: false,
  }),
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

  it('renders a legacy card when legacies exist', () => {
    renderPage();
    expect(
      screen.getByRole('button', {
        name: /a production length legacy name that should still fit inside the dashboard/i,
      }),
    ).toBeInTheDocument();
  });

  it('does NOT render hero or CTA sections', () => {
    renderPage();
    expect(screen.queryByText(/honor the lives and milestones/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/start creating today/i)).not.toBeInTheDocument();
  });

  it('renders "View all" link in the My Legacies header', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'View all' })).toBeInTheDocument();
  });

  it('uses viewport-safe grid constraints for dashboard columns', () => {
    const { container } = renderPage();

    const layoutGrid = container.querySelector('.grid');
    expect(layoutGrid?.className).toContain('lg:grid-cols-[minmax(0,1fr)_340px]');

    const leftColumn = layoutGrid?.children.item(0) as HTMLElement | null;
    const rightColumn = layoutGrid?.children.item(1) as HTMLElement | null;

    expect(leftColumn?.className).toContain('min-w-0');
    expect(rightColumn?.className).toContain('min-w-0');
  });
});
