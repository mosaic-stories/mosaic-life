import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock auth — always unauthenticated for this page
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, login: vi.fn(), logout: vi.fn() }),
}));

vi.mock('@/lib/hooks/useAuthModal', () => ({
  useAuthModal: (selector: (s: { open: () => void }) => unknown) =>
    selector({ open: vi.fn() }),
}));

vi.mock('@/lib/hooks/useTheme', () => ({
  useTheme: () => ({ currentTheme: 'warm-amber', setTheme: vi.fn() }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useExploreLegacies: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavoriteCheck: () => ({ data: { favorites: {} } }),
}));

// Mock SEO and Header components to avoid requiring their context providers
vi.mock('@/components/seo', () => ({
  SEOHead: () => null,
  getOrganizationSchema: () => ({}),
}));

vi.mock('@/components/header', () => ({
  HeaderSlot: () => null,
}));

vi.mock('@/components/ThemeSelector', () => ({
  default: () => null,
}));

vi.mock('@/components/Footer', () => ({
  default: () => <footer data-testid="footer" />,
}));

import PublicHomePage from './PublicHomePage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicHomePage', () => {
  it('renders the hero section', () => {
    renderPage();
    expect(screen.getByText(/honor the lives and milestones/i)).toBeInTheDocument();
  });

  it('renders the Explore Legacies section', () => {
    renderPage();
    expect(screen.getByText(/explore legacies/i)).toBeInTheDocument();
  });

  it('renders the CTA section', () => {
    renderPage();
    expect(screen.getByText(/start creating today/i)).toBeInTheDocument();
  });

  it('does NOT render authenticated sections (My Legacies, Recently Viewed)', () => {
    renderPage();
    expect(screen.queryByText(/my legacies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recently viewed/i)).not.toBeInTheDocument();
  });
});
