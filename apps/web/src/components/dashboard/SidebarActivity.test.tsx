import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SidebarActivity from './SidebarActivity';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  socialFeed: {
    items: [
      {
        id: 'activity-1',
        entity_type: 'story',
        entity_id: 'story-1',
        created_at: '2026-03-09T10:00:00Z',
        action: 'updated',
        actor: { id: 'user-1', name: 'Joe', avatar_url: null },
        entity: { title: 'Sunday Supper', legacy_id: 'legacy-1' },
        metadata: null,
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useSocialFeed: () => ({ data: mocks.socialFeed, isLoading: false, isError: false }),
}));

function renderActivity() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SidebarActivity />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SidebarActivity', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
  });

  it('renders the recent activity header', () => {
    renderActivity();
    expect(screen.getByText(/recent activity/i)).toBeInTheDocument();
  });

  it('navigates to the activity target when clicked', async () => {
    renderActivity();
    await userEvent.click(screen.getByRole('button', { name: /you updated/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/legacy/legacy-1/story/story-1');
  });
});