import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LegaciesTabContent from './LegaciesTabContent';

const mockLegacy = {
  id: 'legacy-1',
  name: 'Margaret Chen',
  birth_date: '1930-01-01',
  death_date: '2010-06-15',
  biography: 'A wonderful life.',
  visibility: 'private' as const,
  created_by: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  creator_email: 'user@example.com',
  creator_name: 'Joe Smith',
  person_id: null,
  profile_image_id: null,
  profile_image_url: null,
  favorite_count: 0,
};

const mockScopedData = {
  items: [mockLegacy],
  counts: { all: 3, created: 1, connected: 2 },
};

const mockUseLegacies = vi.fn(() => ({ data: mockScopedData, isLoading: false }));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => mockUseLegacies(),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

// Mock LegacyCard to avoid the FavoriteButton hook tree in tests
vi.mock('@/components/legacy/LegacyCard', () => ({
  default: ({ legacy }: { legacy: { name: string } }) => (
    <div data-testid="legacy-card">{legacy.name}</div>
  ),
}));

// Mock FavoriteButton since it is wired into LegacyCard trailingAction
vi.mock('@/features/favorites/components/FavoriteButton', () => ({
  default: () => null,
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({ data: { tracking_enabled: false, items: [] }, isLoading: false }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
})

function renderContent(activeFilter = 'all', onFilterChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegaciesTabContent
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
          viewMode="grid"
          onViewModeChange={vi.fn()}
          sortBy="recent"
          onSortChange={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LegaciesTabContent', () => {
  it('renders all filter options', () => {
    renderContent();
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my legacies/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connected/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /favorites/i })).toBeInTheDocument();
  });

  it('renders scope counts on filter pills', () => {
    renderContent();
    // counts: all=3, created=1, connected=2
    expect(screen.getByRole('button', { name: /all.*3/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my legacies.*1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connected.*2/i })).toBeInTheDocument();
  });

  it('calls onFilterChange when a filter is clicked', async () => {
    const onFilterChange = vi.fn();
    renderContent('all', onFilterChange);
    await userEvent.click(screen.getByRole('button', { name: /connected/i }));
    expect(onFilterChange).toHaveBeenCalledWith('connected');
  });

  it('shows legacy cards for each item', () => {
    renderContent();
    expect(screen.getByText('Margaret Chen')).toBeInTheDocument();
  });

});

describe('LegaciesTabContent (empty state)', () => {
  const emptyData = { items: [], counts: { all: 0, created: 0, connected: 0 } };

  it('shows favorites empty-state message on favorites filter', () => {
    mockUseLegacies.mockReturnValueOnce({ data: emptyData, isLoading: false });
    renderContent('favorites');
    expect(screen.getByText(/haven't favorited any legacies/i)).toBeInTheDocument();
  });

  it('shows connected empty-state message on connected filter', () => {
    mockUseLegacies.mockReturnValueOnce({ data: emptyData, isLoading: false });
    renderContent('connected');
    expect(screen.getByText(/haven't joined any legacies/i)).toBeInTheDocument();
  });

  it('shows generic message on all filter', () => {
    mockUseLegacies.mockReturnValueOnce({ data: emptyData, isLoading: false });
    renderContent('all');
    expect(screen.getByText(/no legacies found/i)).toBeInTheDocument();
  });
});
