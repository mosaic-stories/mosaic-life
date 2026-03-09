import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QuickActions from './QuickActions';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutateAsync: vi.fn(),
  legacies: {
    items: [
      {
        id: 'legacy-1',
        name: 'Margaret Chen',
        current_user_role: 'creator',
        profile_image_url: null,
      },
    ],
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacies: () => ({ data: mocks.legacies, isLoading: false }),
}));

vi.mock('@/features/story/hooks/useStories', () => ({
  useCreateStory: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

vi.mock('@/features/members/components/InviteMemberModal', () => ({
  default: ({ isOpen, legacyId, currentUserRole }: { isOpen: boolean; legacyId: string; currentUserRole: string }) =>
    isOpen ? <div data-testid="invite-modal">{legacyId}:{currentUserRole}</div> : null,
}));

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

function renderActions() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuickActions />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QuickActions', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockResolvedValue({ id: 'story-123', legacies: [] });
    mocks.legacies = {
      items: [
        {
          id: 'legacy-1',
          name: 'Margaret Chen',
          current_user_role: 'creator',
          profile_image_url: null,
        },
      ],
    };
  });

  it('creates a draft story and navigates to evolve for a single legacy', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /write a story/i }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '',
        visibility: 'private',
        status: 'draft',
        legacies: [{ legacy_id: 'legacy-1', role: 'primary', position: 0 }],
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith('/legacy/legacy-1/story/story-123/evolve');
  });

  it('passes the API-provided role into the invite modal for a single legacy', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /invite family/i }));
    expect(screen.getByTestId('invite-modal')).toHaveTextContent('legacy-1:creator');
  });

  it('shows inline legacy selection for multi-legacy story actions', async () => {
    mocks.legacies = {
      items: [
        {
          id: 'legacy-1',
          name: 'Margaret Chen',
          current_user_role: 'creator',
          profile_image_url: null,
        },
        {
          id: 'legacy-2',
          name: 'James Torres',
          current_user_role: 'advocate',
          profile_image_url: null,
        },
      ],
    };

    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /write a story/i }));
    expect(screen.getByText(/choose a legacy to start writing/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /james torres/i }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        legacies: [{ legacy_id: 'legacy-2', role: 'primary', position: 0 }],
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith('/legacy/legacy-2/story/story-123/evolve');
  });

  it('opens the invite modal with the selected legacy role from inline selection', async () => {
    mocks.legacies = {
      items: [
        {
          id: 'legacy-1',
          name: 'Margaret Chen',
          current_user_role: 'creator',
          profile_image_url: null,
        },
        {
          id: 'legacy-2',
          name: 'James Torres',
          current_user_role: 'advocate',
          profile_image_url: null,
        },
      ],
    };

    renderActions();
    await userEvent.click(screen.getByRole('button', { name: /invite family/i }));
    await userEvent.click(screen.getByRole('button', { name: /james torres/i }));
    expect(screen.getByTestId('invite-modal')).toHaveTextContent('legacy-2:advocate');
  });
});