import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TopLegaciesChips from './TopLegaciesChips';

vi.mock('@/features/story/hooks/useStories', () => ({
  useTopLegacies: () => ({
    data: [
      { legacy_id: '1', legacy_name: 'Margaret Chen', profile_image_url: null, story_count: 7 },
      { legacy_id: '2', legacy_name: 'James Torres', profile_image_url: null, story_count: 4 },
    ],
    isLoading: false,
  }),
}));

function renderChips() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TopLegaciesChips />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TopLegaciesChips', () => {
  it('renders section title', () => {
    renderChips();
    expect(screen.getByText('Top Legacies')).toBeInTheDocument();
  });

  it('renders chips with first names', () => {
    renderChips();
    expect(screen.getByText('Margaret')).toBeInTheDocument();
    expect(screen.getByText('James')).toBeInTheDocument();
  });

  it('renders story count badges', () => {
    renderChips();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
