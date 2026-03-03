import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StatsBar from './StatsBar';

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

function renderStatsBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StatsBar />
    </QueryClientProvider>,
  );
}

describe('StatsBar', () => {
  it('renders all four stat items', () => {
    renderStatsBar();
    expect(screen.getByText('Legacies')).toBeInTheDocument();
    expect(screen.getByText('Stories')).toBeInTheDocument();
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });

  it('displays the correct counts', () => {
    renderStatsBar();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
