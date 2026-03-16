import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TopConnectionsChips from './TopConnectionsChips';

vi.mock('@/features/connections/hooks/useConnections', () => ({
  useTopConnections: () => ({
    data: [
      { user_id: '1', display_name: 'Sarah Chen', username: 'sarah-x1y2', avatar_url: null, shared_legacy_count: 3 },
      { user_id: '2', display_name: 'James Torres', username: 'james-a3b4', avatar_url: null, shared_legacy_count: 2 },
    ],
    isLoading: false,
  }),
}));

function renderChips() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TopConnectionsChips />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('TopConnectionsChips', () => {
  it('renders section title', () => {
    renderChips();
    expect(screen.getByText('Top Connections')).toBeInTheDocument();
  });

  it('renders chips with display names', () => {
    renderChips();
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('James Torres')).toBeInTheDocument();
  });

  it('renders shared legacy count badges', () => {
    renderChips();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
