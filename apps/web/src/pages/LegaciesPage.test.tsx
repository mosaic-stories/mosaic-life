import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
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
  useScopedStories: () => ({ data: { items: [], counts: { all: 0, mine: 0, shared: 0 } }, isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

vi.mock('@/components/Footer', () => ({
  default: () => <footer data-testid="footer" />,
}));

import LegaciesPage from './LegaciesPage';

function LocationSearchProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function renderPage(initialEntry = '/legacies') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LegaciesPage />
        <LocationSearchProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LegaciesPage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Your Legacies' })).toBeInTheDocument();
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
    // Tabs are custom buttons with role="tab" for proper accessibility
    expect(screen.getByRole('tab', { name: /legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /stories/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
    // Active tab has aria-selected=true
    expect(screen.getByRole('tab', { name: /legacies/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('hydrates stories controls from the URL', () => {
    renderPage('/legacies?tab=stories&filter=public&view=list&sort=alpha&search=jane');

    expect(screen.getByRole('tab', { name: /stories/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /public/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox')).toHaveValue('alpha');
    expect(screen.getByPlaceholderText('Search stories...')).toHaveValue('jane');
    expect(screen.getByRole('button', { name: /list view/i })).toHaveClass('bg-stone-100');
    expect(screen.getByTestId('location-search')).toHaveTextContent(
      '?tab=stories&filter=public&view=list&sort=alpha&search=jane',
    );
  });

  it('persists toolbar changes in the URL while preserving existing params', async () => {
    const user = userEvent.setup();
    renderPage('/legacies?tab=legacies&filter=connected&foo=bar');

    await user.click(screen.getByRole('button', { name: /list view/i }));
    await user.selectOptions(screen.getByRole('combobox'), 'alpha');
    await user.type(screen.getByPlaceholderText('Search legacies...'), 'margaret');

    expect(screen.getByTestId('location-search')).toHaveTextContent(
      '?tab=legacies&filter=connected&foo=bar&view=list&sort=alpha&search=margaret',
    );
  });
});
