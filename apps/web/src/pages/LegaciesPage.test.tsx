import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

vi.mock('@/features/settings/hooks/useSettings', () => ({
  useStats: () => ({
    data: {
      legacies_count: 3,
      stories_count: 5,
      legacy_links_count: 72,
      favorites_count: 2,
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({
    data: { tracking_enabled: false, items: [] },
    isLoading: false,
  }),
  useSocialFeed: () => ({
    data: { items: [], next_cursor: null, has_more: false },
    isLoading: false,
  }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({
    data: { items: [], counts: { all: 0, created: 0, connected: 0 } },
    isLoading: false,
  }),
}));

vi.mock('@/features/story/hooks/useStories', () => ({
  useScopedStories: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

vi.mock('@/components/Footer', () => ({
  default: () => <footer data-testid="footer" />,
}));

import LegaciesPage from './LegaciesPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegaciesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LegaciesPage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Legacies' })).toBeInTheDocument();
  });

  it('renders the New Legacy button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /new legacy/i })).toBeInTheDocument();
  });

  it('renders stats bar', () => {
    renderPage();
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
  });

  it('renders tab triggers', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /stories/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });
});
