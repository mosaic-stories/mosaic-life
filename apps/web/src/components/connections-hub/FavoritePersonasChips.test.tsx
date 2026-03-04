import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FavoritePersonasChips from './FavoritePersonasChips';

vi.mock('@/features/connections/hooks/useConnections', () => ({
  useFavoritePersonas: () => ({
    data: [
      { persona_id: 'biographer', persona_name: 'The Biographer', persona_icon: 'BookOpen', conversation_count: 28 },
      { persona_id: 'friend', persona_name: 'The Friend', persona_icon: 'Heart', conversation_count: 14 },
    ],
    isLoading: false,
  }),
}));

function renderChips(onPersonaClick?: (id: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FavoritePersonasChips onPersonaClick={onPersonaClick} />
    </QueryClientProvider>,
  );
}

describe('FavoritePersonasChips', () => {
  it('renders section title', () => {
    renderChips();
    expect(screen.getByText('Favorite Personas')).toBeInTheDocument();
  });

  it('renders persona names without "The" prefix', () => {
    renderChips();
    expect(screen.getByText('Biographer')).toBeInTheDocument();
    expect(screen.getByText('Friend')).toBeInTheDocument();
  });

  it('renders conversation count badges', () => {
    renderChips();
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('calls onPersonaClick when clicked', async () => {
    const onClick = vi.fn();
    renderChips(onClick);
    await userEvent.click(screen.getByText('Biographer'));
    expect(onClick).toHaveBeenCalledWith('biographer');
  });
});
