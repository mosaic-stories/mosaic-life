import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecentStoriesList from './RecentStoriesList';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  recentData: {
    items: [
      {
        entity_id: 'story-1',
        last_activity_at: '2026-03-09T10:00:00Z',
        entity: {
          title: 'Sunday Supper',
          legacy_id: 'legacy-1',
          legacy_name: 'Margaret Chen',
          content_preview: 'A story about family meals.',
          author_name: 'Joe',
        },
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

vi.mock('@/features/activity/hooks/useActivity', () => ({
  useRecentlyViewed: () => ({ data: mocks.recentData, isLoading: false }),
}));

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RecentStoriesList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RecentStoriesList', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
  });

  it('renders nothing when there are no recent stories', () => {
    mocks.recentData = { items: [] };
    renderList();
    expect(screen.queryByText(/recent stories/i)).not.toBeInTheDocument();
  });

  it('renders recent story rows as buttons', () => {
    mocks.recentData = {
      items: [
        {
          entity_id: 'story-1',
          last_activity_at: '2026-03-09T10:00:00Z',
          entity: {
            title: 'Sunday Supper',
            legacy_id: 'legacy-1',
            legacy_name: 'Margaret Chen',
            content_preview: 'A story about family meals.',
            author_name: 'Joe',
          },
        },
      ],
    };

    renderList();
    expect(screen.getByRole('button', { name: /sunday supper/i })).toBeInTheDocument();
  });

  it('navigates to the selected story when clicked', async () => {
    mocks.recentData = {
      items: [
        {
          entity_id: 'story-1',
          last_activity_at: '2026-03-09T10:00:00Z',
          entity: {
            title: 'Sunday Supper',
            legacy_id: 'legacy-1',
            legacy_name: 'Margaret Chen',
            content_preview: 'A story about family meals.',
            author_name: 'Joe',
          },
        },
      ],
    };

    renderList();
    await userEvent.click(screen.getByRole('button', { name: /sunday supper/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/legacy/legacy-1/story/story-1');
  });
});