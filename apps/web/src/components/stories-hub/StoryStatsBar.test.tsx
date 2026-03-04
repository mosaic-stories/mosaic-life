import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StoryStatsBar from './StoryStatsBar';

vi.mock('@/features/story/hooks/useStories', () => ({
  useStoryStats: () => ({
    data: {
      my_stories_count: 12,
      favorites_given_count: 8,
      stories_evolved_count: 3,
      legacies_written_for_count: 5,
    },
    isLoading: false,
  }),
}));

function renderStatsBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StoryStatsBar />
    </QueryClientProvider>,
  );
}

describe('StoryStatsBar', () => {
  it('renders all four stat items', () => {
    renderStatsBar();
    expect(screen.getByText('My Stories')).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('Evolved')).toBeInTheDocument();
    expect(screen.getByText('Legacies')).toBeInTheDocument();
  });

  it('displays the correct counts', () => {
    renderStatsBar();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
