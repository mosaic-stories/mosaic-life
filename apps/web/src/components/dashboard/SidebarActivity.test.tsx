import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SidebarActivity from './SidebarActivity';
import type { SocialFeedResponse } from '@/features/activity/api/activity';

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
    next_cursor: null,
    has_more: false,
  } as SocialFeedResponse,
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

  it('routes conversation activity into the legacy AI tab', async () => {
    mocks.socialFeed = {
      items: [
        {
          id: 'activity-2',
          entity_type: 'conversation',
          entity_id: 'conversation-1',
          created_at: '2026-03-09T10:00:00Z',
          action: 'ai_conversation_started',
          actor: { id: 'user-1', name: 'Joe', avatar_url: null },
          entity: { title: 'Sunday Supper Chat', legacy_id: 'legacy-7' },
          metadata: { legacy_id: 'legacy-7' },
        },
      ],
      next_cursor: null,
      has_more: false,
    };

    renderActivity();
    await userEvent.click(screen.getByRole('button', { name: /you started a conversation about/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/legacy/legacy-7?tab=ai&conversation=conversation-1');
  });

  it('disables activity items when no route can be derived', () => {
    mocks.socialFeed = {
      items: [
        {
          id: 'activity-3',
          entity_type: 'story',
          entity_id: 'story-3',
          created_at: '2026-03-09T10:00:00Z',
          action: 'updated',
          actor: { id: 'user-1', name: 'Joe', avatar_url: null },
          entity: { title: 'Route Missing', legacy_id: null },
          metadata: null,
        },
      ],
      next_cursor: null,
      has_more: false,
    };

    renderActivity();
    expect(screen.getByRole('button', { name: /you updated/i })).toBeDisabled();
  });
});