import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecentlyViewedChips from './RecentlyViewedChips';

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({
    data: {
      tracking_enabled: true,
      items: [
        {
          entity_id: '1',
          entity_type: 'legacy',
          last_action: 'viewed',
          last_activity_at: '2026-01-01',
          metadata: null,
          entity: { name: 'Margaret Chen', profile_image_url: null },
        },
        {
          entity_id: '2',
          entity_type: 'legacy',
          last_action: 'viewed',
          last_activity_at: '2026-01-02',
          metadata: null,
          entity: { name: 'Captain Torres', profile_image_url: null },
        },
      ],
    },
    isLoading: false,
  }),
}));

function renderChips() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RecentlyViewedChips />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RecentlyViewedChips', () => {
  it('renders recently viewed section title', () => {
    renderChips();
    expect(screen.getByText('Recently Viewed')).toBeInTheDocument();
  });

  it('renders chips for each item', () => {
    renderChips();
    expect(screen.getByText('Margaret')).toBeInTheDocument();
    expect(screen.getByText('Captain')).toBeInTheDocument();
  });
});
