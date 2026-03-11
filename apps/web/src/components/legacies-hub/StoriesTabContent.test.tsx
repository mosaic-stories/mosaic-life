import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StoriesTabContent from './StoriesTabContent';

const mockStory = {
  id: 'story-1',
  title: 'A Life Well Lived',
  content_preview: 'She was an extraordinary person...',
  author_id: 'user-2',
  author_name: 'Jane Doe',
  visibility: 'private' as const,
  status: 'published' as const,
  shared_from: null,
  legacies: [],
  favorite_count: 0,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const mockUseScopedStories = vi.fn((_scope?: string) => ({
  data: { items: [mockStory], counts: { all: 1, mine: 1, shared: 0 } },
  isLoading: false,
}));

vi.mock('@/features/story/hooks/useStories', () => ({
  useScopedStories: (scope: string) => mockUseScopedStories(scope),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

// Mock StoryCard to avoid FavoriteButton hook cascade in tests
vi.mock('@/features/legacy/components/StoryCard', () => ({
  default: ({ story }: { story: { title: string } }) => (
    <div data-testid="story-card">{story.title}</div>
  ),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({ data: { tracking_enabled: false, items: [] }, isLoading: false }),
}));

vi.mock('@/features/legacy/components/StoryCardList', () => ({
  default: ({ story }: { story: { title: string } }) => (
    <div data-testid="story-card-list">{story.title}</div>
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

function renderContent(activeFilter = 'all', onFilterChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StoriesTabContent activeFilter={activeFilter} onFilterChange={onFilterChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoriesTabContent', () => {
  it('renders all filter option labels', () => {
    renderContent();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my stories/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /favorites/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /public/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /private/i })).toBeInTheDocument();
  });

  it('marks the active filter as pressed', () => {
    renderContent('public');
    expect(screen.getByRole('button', { name: /public/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /my stories/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onFilterChange when a filter is clicked', async () => {
    const onFilterChange = vi.fn();
    renderContent('all', onFilterChange);
    await userEvent.click(screen.getByRole('button', { name: /public/i }));
    expect(onFilterChange).toHaveBeenCalledWith('public');
  });

  it('passes the correct scope to useScopedStories', () => {
    renderContent('public');
    // 'public' filter maps to 'all' API scope, filtered client-side
    expect(mockUseScopedStories).toHaveBeenCalledWith('all');
  });

  it('renders story cards when data is available', () => {
    renderContent();
    expect(screen.getByText('A Life Well Lived')).toBeInTheDocument();
  });

  it('shows favorites empty-state message on favorites filter with no data', () => {
    mockUseScopedStories.mockReturnValueOnce({ data: { items: [], counts: { all: 0, mine: 0, shared: 0 } }, isLoading: false });
    renderContent('favorites');
    expect(screen.getByText(/haven't favorited any stories/i)).toBeInTheDocument();
  });

  it('shows public empty-state message on public filter with no data', () => {
    mockUseScopedStories.mockReturnValueOnce({ data: { items: [], counts: { all: 0, mine: 0, shared: 0 } }, isLoading: false });
    renderContent('public');
    expect(screen.getByText(/no stories found/i)).toBeInTheDocument();
  });

  it('shows mine empty-state message on mine filter with no data', () => {
    mockUseScopedStories.mockReturnValueOnce({ data: { items: [], counts: { all: 0, mine: 0, shared: 0 } }, isLoading: false });
    renderContent('mine');
    expect(screen.getByText(/no stories found/i)).toBeInTheDocument();
  });

  it('shows loading spinner while fetching', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseScopedStories.mockReturnValueOnce({ data: undefined, isLoading: true } as any);
    renderContent();
    // Spinner is rendered but story content is absent
    expect(screen.queryByText('A Life Well Lived')).not.toBeInTheDocument();
  });
});
