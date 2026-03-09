import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SidebarFavorites from './SidebarFavorites';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  favoritesData: {
    items: [
      {
        id: 'favorite-1',
        entity_type: 'story',
        entity_id: 'story-1',
        created_at: '2026-03-09T10:00:00Z',
        entity: { title: 'Sunday Supper', legacy_id: 'legacy-1', legacy_name: 'Margaret Chen' },
      },
    ],
    total: 1,
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/features/favorites/hooks/useFavorites', () => ({
  useMyFavorites: () => ({ data: mocks.favoritesData, isLoading: false }),
}));

function renderFavorites() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SidebarFavorites />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SidebarFavorites', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
  });

  it('renders the favorites header', () => {
    renderFavorites();
    expect(screen.getByText(/my favorites/i)).toBeInTheDocument();
  });

  it('navigates to the selected favorite item', async () => {
    renderFavorites();
    await userEvent.click(screen.getByRole('button', { name: /sunday supper/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/legacy/legacy-1/story/story-1');
  });
});