import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LegacyPickerDialog from './LegacyPickerDialog';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({
    data: {
      items: [
        { id: '1', name: 'Margaret Chen', profile_image_url: null },
        { id: '2', name: 'James Torres', profile_image_url: null },
      ],
      counts: { all: 2, created: 2, connected: 0 },
    },
    isLoading: false,
  }),
}));

function renderDialog(open = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegacyPickerDialog open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('LegacyPickerDialog', () => {
  it('renders dialog title when open', () => {
    renderDialog();
    expect(screen.getByText('Choose a Legacy')).toBeInTheDocument();
  });

  it('renders legacy options', () => {
    renderDialog();
    expect(screen.getByText('Margaret Chen')).toBeInTheDocument();
    expect(screen.getByText('James Torres')).toBeInTheDocument();
  });

  it('navigates to story creation on legacy click', async () => {
    renderDialog();
    await userEvent.click(screen.getByText('Margaret Chen'));
    expect(mockNavigate).toHaveBeenCalledWith('/legacy/1/story/new');
  });
});
