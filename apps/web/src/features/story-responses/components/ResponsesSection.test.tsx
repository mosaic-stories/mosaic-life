import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResponsesSection from './ResponsesSection';
import type { StoryResponseListResponse } from '@/features/story-responses/api/responses';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiDelete = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPost: (...args: unknown[]) => apiPost(...args),
  apiPatch: vi.fn(),
  apiDelete: (...args: unknown[]) => apiDelete(...args),
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'me@test.com', name: 'Me', username: 'me' },
  }),
}));

function emptyList(): StoryResponseListResponse {
  return { items: [], next_cursor: null, has_more: false };
}

function renderSection(props: Partial<React.ComponentProps<typeof ResponsesSection>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResponsesSection storyId="story-1" currentUserId="user-1" canModerate={false} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResponsesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no responses', async () => {
    apiGet.mockResolvedValue(emptyList());

    renderSection();

    expect(await screen.findByText(/no responses yet/i)).toBeInTheDocument();
  });

  it('renders responses oldest-first with avatar, name, and relative time', async () => {
    apiGet.mockResolvedValue({
      items: [
        {
          id: 'r1',
          story_id: 'story-1',
          user_id: 'user-2',
          user_name: 'Older Reply',
          user_username: 'older-reply',
          user_avatar_url: null,
          body: 'First memory shared.',
          created_at: '2026-01-01T00:00:00Z',
          edited_at: null,
        },
        {
          id: 'r2',
          story_id: 'story-1',
          user_id: 'user-3',
          user_name: 'Newer Reply',
          user_username: 'newer-reply',
          user_avatar_url: null,
          body: 'Second memory shared.',
          created_at: '2026-01-02T00:00:00Z',
          edited_at: null,
        },
      ],
      next_cursor: null,
      has_more: false,
    });

    renderSection();

    await screen.findByText('First memory shared.');
    const names = screen.getAllByText(/Older Reply|Newer Reply/);
    // Oldest first: "Older Reply" content appears before "Newer Reply" in DOM order.
    const bodies = [screen.getByText('First memory shared.'), screen.getByText('Second memory shared.')];
    expect(bodies[0].compareDocumentPosition(bodies[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(names.length).toBeGreaterThan(0);
  });

  it('shows the response count from the story record in the heading', async () => {
    apiGet.mockResolvedValue(emptyList());

    renderSection({ responseCount: 4 });

    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('inserts the new response optimistically on submit, then reconciles with the server', async () => {
    const user = userEvent.setup();
    apiGet.mockResolvedValueOnce(emptyList());

    let resolvePost: (value: unknown) => void = () => {};
    apiPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    renderSection();
    await screen.findByText(/no responses yet/i);

    const textarea = screen.getByPlaceholderText(/add what you remember/i);
    await user.type(textarea, 'Brand new memory');
    await user.click(screen.getByRole('button', { name: /post/i }));

    // Optimistic row appears immediately, before the POST resolves.
    expect(await screen.findByText('Brand new memory')).toBeInTheDocument();
    expect(textarea).toHaveValue('');

    // Resolve the create call, then the follow-up refetch returns the
    // reconciled server state (invalidation-driven reconciliation).
    apiGet.mockResolvedValueOnce({
      items: [
        {
          id: 'real-id',
          story_id: 'story-1',
          user_id: 'user-1',
          user_name: 'Me',
          user_username: 'me',
          user_avatar_url: null,
          body: 'Brand new memory',
          created_at: new Date().toISOString(),
          edited_at: null,
        },
      ],
      next_cursor: null,
      has_more: false,
    });
    resolvePost({
      id: 'real-id',
      story_id: 'story-1',
      user_id: 'user-1',
      user_name: 'Me',
      user_username: 'me',
      user_avatar_url: null,
      body: 'Brand new memory',
      created_at: new Date().toISOString(),
      edited_at: null,
    });

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Brand new memory')).toBeInTheDocument();
  });

  it('removes a deleted response from an earlier page, not just the most recently loaded one', async () => {
    const user = userEvent.setup();

    const pageOneItem = {
      id: 'r1',
      story_id: 'story-1',
      user_id: 'user-1',
      user_name: 'Me',
      user_username: 'me',
      user_avatar_url: null,
      body: 'From the first page',
      created_at: '2026-01-01T00:00:00Z',
      edited_at: null,
    };
    const pageTwoItem = {
      id: 'r2',
      story_id: 'story-1',
      user_id: 'user-2',
      user_name: 'Someone Else',
      user_username: 'someone-else',
      user_avatar_url: null,
      body: 'From the second page',
      created_at: '2026-01-02T00:00:00Z',
      edited_at: null,
    };

    apiGet.mockResolvedValueOnce({
      items: [pageOneItem],
      next_cursor: 'cursor-1',
      has_more: true,
    });

    renderSection();
    await screen.findByText('From the first page');

    apiGet.mockResolvedValueOnce({
      items: [pageTwoItem],
      next_cursor: null,
      has_more: false,
    });
    await user.click(screen.getByRole('button', { name: /show more responses/i }));
    await screen.findByText('From the second page');

    // Keep the DELETE request pending so we observe the *optimistic* cache
    // update in isolation, before onSettled's invalidateQueries can reconcile
    // it via a refetch — that reconciliation would eventually paper over a
    // page-targeting bug, so it must not be what makes this assertion pass.
    let resolveDelete: () => void = () => {};
    apiDelete.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );

    const items = screen.getAllByTestId('response-item');
    const firstItem = items.find((el) => el.textContent?.includes('From the first page'))!;
    await user.click(within(firstItem).getByRole('button', { name: /delete response/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText('From the first page')).not.toBeInTheDocument();
    });
    expect(screen.getByText('From the second page')).toBeInTheDocument();

    resolveDelete();
  });

  it('does not render the input for a viewer without an id (unauthenticated)', async () => {
    apiGet.mockResolvedValue(emptyList());
    renderSection({ currentUserId: undefined });

    await screen.findByText(/no responses yet/i);
    expect(screen.queryByPlaceholderText(/add what you remember/i)).not.toBeInTheDocument();
  });
});
