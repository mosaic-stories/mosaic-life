import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PeopleSearch from './PeopleSearch';

const mockNavigate = vi.fn();
const mockUseUserSearch = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../hooks/useUserSearch', () => ({
  useUserSearch: (query: string) => mockUseUserSearch(query),
}));

vi.mock('@/lib/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

function renderSearch(variant: 'full' | 'compact' = 'full') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PeopleSearch variant={variant} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PeopleSearch', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseUserSearch.mockReset();
    mockUseUserSearch.mockReturnValue({ data: [], isLoading: false });
  });

  it('gives the input an accessible name', () => {
    renderSearch();
    expect(screen.getByRole('textbox', { name: /find people/i })).toBeInTheDocument();
  });

  it('navigates to the selected profile when the result has a username', async () => {
    const user = userEvent.setup();
    mockUseUserSearch.mockReturnValue({
      data: [
        {
          id: 'user-1',
          name: 'Sarah Chen',
          avatar_url: null,
          username: 'sarah-chen',
        },
      ],
      isLoading: false,
    });

    renderSearch();

    await user.type(screen.getByRole('textbox', { name: /find people/i }), 'sar');
    await user.click(screen.getByRole('button', { name: /sarah chen/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/u/sarah-chen');
  });

  it('renders results without usernames as disabled and does not navigate', async () => {
    const user = userEvent.setup();
    mockUseUserSearch.mockReturnValue({
      data: [
        {
          id: 'user-2',
          name: 'Pat Doe',
          avatar_url: null,
          username: null,
        },
      ],
      isLoading: false,
    });

    renderSearch();

    await user.type(screen.getByRole('textbox', { name: /find people/i }), 'pat');

    const result = screen.getByRole('button', { name: /pat doe/i });
    expect(result).toBeDisabled();
    expect(screen.getByText(/profile unavailable/i)).toBeInTheDocument();

    await user.click(result);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
