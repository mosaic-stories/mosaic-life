import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConnectionsStatsBar from './ConnectionsStatsBar';

vi.mock('@/features/connections/hooks/useConnections', () => ({
  useConnectionsStats: () => ({
    data: {
      conversations_count: 42,
      people_count: 7,
      shared_legacies_count: 5,
      personas_used_count: 2,
    },
    isLoading: false,
  }),
}));

function renderStatsBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectionsStatsBar />
    </QueryClientProvider>,
  );
}

describe('ConnectionsStatsBar', () => {
  it('renders all four stat items', () => {
    renderStatsBar();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Shared Legacies')).toBeInTheDocument();
    expect(screen.getByText('Personas Used')).toBeInTheDocument();
  });

  it('displays the correct counts', () => {
    renderStatsBar();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
