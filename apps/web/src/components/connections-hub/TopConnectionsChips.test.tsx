import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TopConnectionsChips from './TopConnectionsChips';

vi.mock('@/features/connections/hooks/useConnections', () => ({
  useTopConnections: () => ({
    data: [
      { user_id: '1', display_name: 'Sarah Chen', avatar_url: null, shared_legacy_count: 3 },
      { user_id: '2', display_name: 'James Torres', avatar_url: null, shared_legacy_count: 2 },
    ],
    isLoading: false,
  }),
}));

function renderChips() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TopConnectionsChips />
    </QueryClientProvider>,
  );
}

describe('TopConnectionsChips', () => {
  it('renders section title', () => {
    renderChips();
    expect(screen.getByText('Top Connections')).toBeInTheDocument();
  });

  it('renders chips with first names', () => {
    renderChips();
    expect(screen.getByText('Sarah')).toBeInTheDocument();
    expect(screen.getByText('James')).toBeInTheDocument();
  });

  it('renders shared legacy count badges', () => {
    renderChips();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
