import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResponseItem from './ResponseItem';
import type { StoryResponseItem } from '@/features/story-responses/api/responses';

const apiPatch = vi.fn();
const apiDelete = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: (...args: unknown[]) => apiPatch(...args),
  apiDelete: (...args: unknown[]) => apiDelete(...args),
  ApiError: class ApiError extends Error {},
}));

const baseResponse: StoryResponseItem = {
  id: 'response-1',
  story_id: 'story-1',
  user_id: 'user-2',
  user_name: 'Jordan Example',
  user_username: 'jordan-example',
  user_avatar_url: null,
  body: 'I remember this fondly.',
  created_at: new Date(Date.now() - 60_000).toISOString(),
  edited_at: null,
};

function renderItem(props: Partial<React.ComponentProps<typeof ResponseItem>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResponseItem
          storyId="story-1"
          response={baseResponse}
          currentUserId="user-2"
          canModerate={false}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResponseItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders author name, avatar link, relative time, and plain-text body', () => {
    renderItem();

    expect(screen.getAllByText('Jordan Example').length).toBeGreaterThan(0);
    expect(screen.getByText('I remember this fondly.')).toBeInTheDocument();
    expect(screen.getByText(/ago/i)).toBeInTheDocument();
  });

  it('renders line breaks without injecting HTML', () => {
    renderItem({
      response: { ...baseResponse, body: 'Line one\n<script>alert(1)</script>\nLine two' },
    });

    // The tags render as literal text (React-escaped), never as markup.
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('shows edit and delete affordances for the response author', () => {
    renderItem({ currentUserId: 'user-2', canModerate: false });

    expect(screen.getByRole('button', { name: /edit response/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete response/i })).toBeInTheDocument();
  });

  it('hides edit and hides delete for a non-author, non-moderator viewer', () => {
    renderItem({ currentUserId: 'user-3', canModerate: false });

    expect(screen.queryByRole('button', { name: /edit response/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete response/i })).not.toBeInTheDocument();
  });

  it('shows delete (but not edit) for a legacy creator/admin who is not the author', () => {
    renderItem({ currentUserId: 'user-3', canModerate: true });

    expect(screen.queryByRole('button', { name: /edit response/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete response/i })).toBeInTheDocument();
  });

  it('saves an edit and shows the "edited" marker', async () => {
    const user = userEvent.setup();
    apiPatch.mockResolvedValue({
      ...baseResponse,
      body: 'Updated memory.',
      edited_at: new Date().toISOString(),
    });

    renderItem();

    await user.click(screen.getByRole('button', { name: /edit response/i }));
    const textarea = screen.getByLabelText(/edit response/i);
    await user.clear(textarea);
    await user.type(textarea, 'Updated memory.');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith(
        '/api/stories/story-1/responses/response-1',
        { body: 'Updated memory.' },
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Updated memory.')).toBeInTheDocument();
      expect(screen.getByTestId('edited-marker')).toBeInTheDocument();
    });
  });

  it('does not show an "edited" marker before any edit has been saved', () => {
    renderItem();
    expect(screen.queryByTestId('edited-marker')).not.toBeInTheDocument();
  });

  it('deletes the response after confirming in the alert dialog', async () => {
    const user = userEvent.setup();
    apiDelete.mockResolvedValue(undefined);

    renderItem();

    await user.click(screen.getByRole('button', { name: /delete response/i }));
    expect(screen.getByText(/delete this response/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/api/stories/story-1/responses/response-1');
    });
  });

  it('cancels delete without calling the API', async () => {
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /delete response/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(apiDelete).not.toHaveBeenCalled();
  });
});
