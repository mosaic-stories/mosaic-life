import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Joe Smith', email: 'joe@example.com' },
  }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({ data: [], isLoading: false }),
  useExploreLegacies: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

vi.mock('@/components/Footer', () => ({
  default: () => <footer data-testid="footer" />,
}));

import LegaciesPage from './LegaciesPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegaciesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LegaciesPage', () => {
  it('renders My Legacies section', () => {
    renderPage();
    expect(screen.getByText(/my legacies/i)).toBeInTheDocument();
  });

  it('renders Explore Legacies section', () => {
    renderPage();
    expect(screen.getByText(/explore legacies/i)).toBeInTheDocument();
  });

  it('renders visibility filter buttons', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /public/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /private/i })).toBeInTheDocument();
  });
});
