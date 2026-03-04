import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConnectionsPage from './ConnectionsPage';

// Mock all hooks used by the page and its children
vi.mock('@/features/connections/hooks/useConnections', () => ({
  useConnectionsStats: () => ({ data: null, isLoading: false }),
  useTopConnections: () => ({ data: null, isLoading: false }),
  useFavoritePersonas: () => ({ data: null, isLoading: false }),
  usePeople: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/ai-chat/hooks/useAIChat', () => ({
  useConversationList: () => ({ data: null, isLoading: false }),
  usePersonas: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useSocialFeed: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConnectionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ConnectionsPage', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByText('Connections')).toBeInTheDocument();
  });

  it('renders the page subtitle', () => {
    renderPage();
    expect(screen.getByText('Your personas, people, and conversations.')).toBeInTheDocument();
  });

  it('renders the New Chat button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('renders tab triggers', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /personas/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /people/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });
});
