import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecentStoriesList from './RecentStoriesList';
import type { EnrichedRecentItemsResponse } from '@/features/activity/api/activity';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  recentData: {
    items: [
      {
        entity_type: 'story',
        entity_id: 'story-1',
        last_action: 'viewed',
        last_activity_at: '2026-03-09T10:00:00Z',
        metadata: null,
        entity: {
          title: 'Sunday Supper',
          legacy_id: 'legacy-1',
          legacy_name: 'Margaret Chen',
          content_preview: 'A story about family meals.',
          author_name: 'Joe',
          author_username: 'joe-x1y2',
        },
      },
    ],
    tracking_enabled: true,
  } as EnrichedRecentItemsResponse,
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
    mocks.recentData = { items: [], tracking_enabled: true };
    renderList();
    expect(screen.queryByText(/recent stories/i)).not.toBeInTheDocument();
  });

  it('renders recent story rows as buttons', () => {
    mocks.recentData = {
      items: [
        {
          entity_type: 'story',
          entity_id: 'story-1',
          last_action: 'viewed',
          last_activity_at: '2026-03-09T10:00:00Z',
          metadata: null,
          entity: {
            title: 'Sunday Supper',
            legacy_id: 'legacy-1',
            legacy_name: 'Margaret Chen',
            content_preview: 'A story about family meals.',
            author_name: 'Joe',
            author_username: 'joe-x1y2',
          },
        },
      ],
      tracking_enabled: true,
    };

    renderList();
    expect(screen.getByRole('button', { name: /sunday supper/i })).toBeInTheDocument();
  });

  it('navigates to the selected story when clicked', async () => {
    mocks.recentData = {
      items: [
        {
          entity_type: 'story',
          entity_id: 'story-1',
          last_action: 'viewed',
          last_activity_at: '2026-03-09T10:00:00Z',
          metadata: null,
          entity: {
            title: 'Sunday Supper',
            legacy_id: 'legacy-1',
            legacy_name: 'Margaret Chen',
            content_preview: 'A story about family meals.',
            author_name: 'Joe',
            author_username: 'joe-x1y2',
          },
        },
      ],
      tracking_enabled: true,
    };

    renderList();
    await userEvent.click(screen.getByRole('button', { name: /sunday supper/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/legacy/legacy-1/story/story-1');
  });

  it('disables rows that do not have a legacy route', () => {
    mocks.recentData = {
      items: [
        {
          entity_type: 'story',
          entity_id: 'story-2',
          last_action: 'viewed',
          last_activity_at: '2026-03-09T10:00:00Z',
          metadata: null,
          entity: {
            title: 'Orphaned Story',
            legacy_id: null,
            legacy_name: null,
            content_preview: 'Missing legacy context.',
            author_name: 'Joe',
            author_username: 'joe-x1y2',
          },
        },
      ],
      tracking_enabled: true,
    };

    renderList();
    expect(screen.getByRole('button', { name: /orphaned story/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders the author name as a profile link when a username is present', () => {
    renderList();

    expect(screen.getByRole('link', { name: 'Joe' })).toHaveAttribute('href', '/u/joe-x1y2');
  });
});
