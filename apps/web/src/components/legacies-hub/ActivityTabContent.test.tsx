import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActivityTabContent from './ActivityTabContent';

const CURRENT_USER_ID = 'user-me';

const feedItems = [
  {
    id: 'feed-1',
    action: 'created',
    entity_type: 'legacy',
    entity_id: 'legacy-1',
    created_at: '2026-01-01T00:00:00Z',
    metadata: null,
    actor: { id: CURRENT_USER_ID, name: 'Joe Smith', avatar_url: null },
    entity: { name: 'Margaret Chen', profile_image_url: null },
  },
  {
    id: 'feed-2',
    action: 'created',
    entity_type: 'legacy',
    entity_id: 'legacy-2',
    created_at: '2026-01-02T00:00:00Z',
    metadata: null,
    actor: { id: 'user-other', name: 'Alice Jones', avatar_url: null },
    entity: { name: 'Captain Torres', profile_image_url: null },
  },
];

const mockUseSocialFeed = vi.fn(() => ({
  data: { items: feedItems, next_cursor: null, has_more: false },
  isLoading: false,
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useSocialFeed: () => mockUseSocialFeed(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: CURRENT_USER_ID, name: 'Joe Smith' } }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ActivityFeedItem just needs to render something identifiable
vi.mock('@/features/activity/components/ActivityFeedItem', () => ({
  default: ({ item, onClick }: { item: { id: string; actor: { name: string } }; onClick: () => void }) => (
    <div data-testid={`feed-item-${item.id}`} onClick={onClick}>
      {item.actor.name}
    </div>
  ),
}));

function renderContent(activeFilter = 'all', onFilterChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ActivityTabContent activeFilter={activeFilter} onFilterChange={onFilterChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ActivityTabContent', () => {
  it('renders all filter option labels', () => {
    renderContent();
    expect(screen.getByRole('button', { name: /all activity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my activity/i })).toBeInTheDocument();
  });

  it('marks the active filter as pressed', () => {
    renderContent('mine');
    expect(screen.getByRole('button', { name: /my activity/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /all activity/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onFilterChange when a filter is clicked', async () => {
    const onFilterChange = vi.fn();
    renderContent('all', onFilterChange);
    await userEvent.click(screen.getByRole('button', { name: /my activity/i }));
    expect(onFilterChange).toHaveBeenCalledWith('mine');
  });

  it('shows all items when filter is "all"', () => {
    renderContent('all');
    expect(screen.getByTestId('feed-item-feed-1')).toBeInTheDocument();
    expect(screen.getByTestId('feed-item-feed-2')).toBeInTheDocument();
  });

  it('shows only the current user\'s items when filter is "mine"', () => {
    renderContent('mine');
    expect(screen.getByTestId('feed-item-feed-1')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-item-feed-2')).not.toBeInTheDocument();
  });

  it('navigates to legacy page when a legacy feed item is clicked', async () => {
    renderContent('all');
    await userEvent.click(screen.getByTestId('feed-item-feed-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/legacy/legacy-1');
  });

  it('shows empty state when feed is empty', () => {
    mockUseSocialFeed.mockReturnValueOnce({
      data: { items: [], next_cursor: null, has_more: false },
      isLoading: false,
    });
    renderContent();
    expect(screen.getByText(/activity feed/i)).toBeInTheDocument();
  });

  it('shows loading spinner while fetching', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseSocialFeed.mockReturnValueOnce({ data: undefined, isLoading: true } as any);
    renderContent();
    expect(screen.queryByTestId('feed-item-feed-1')).not.toBeInTheDocument();
  });
});
