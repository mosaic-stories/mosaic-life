import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

vi.mock('@/features/story/hooks/useStories', async () => {
  const actual = await vi.importActual<typeof import('@/features/story/hooks/useStories')>(
    '@/features/story/hooks/useStories',
  );

  return {
    ...actual,
    useStoryStats: () => ({
      data: {
        my_stories_count: 12,
        favorites_given_count: 8,
        stories_evolved_count: 3,
        legacies_written_for_count: 5,
      },
      isLoading: false,
    }),
    useTopLegacies: () => ({
      data: [],
      isLoading: false,
    }),
    useScopedStories: () => ({
      data: { items: [], counts: { all: 0, mine: 0, shared: 0 } },
      isLoading: false,
    }),
    useCreateStory: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

vi.mock('@/features/activity/hooks/useActivity', () => ({
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

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

vi.mock('@/components/Footer', () => ({
  default: () => <footer data-testid="footer" />,
}));

import StoriesPage from './StoriesPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoriesPage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Stories' })).toBeInTheDocument();
  });

  it('renders the Write a Story button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /write a story/i })).toBeInTheDocument();
  });

  it('renders stats bar', () => {
    renderPage();
    expect(screen.getAllByText('My Stories').length).toBeGreaterThan(0);
    expect(screen.getByText('Evolved')).toBeInTheDocument();
  });

  it('renders tab triggers', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /all stories/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /drafts/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });
});
