import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResponseItem from './ResponseItem';
import type { StoryResponseItem } from '@/features/story-responses/api/responses';

const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDelete = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiGet: vi.fn(),
  apiPost: (...args: unknown[]) => apiPost(...args),
  apiPatch: (...args: unknown[]) => apiPatch(...args),
  apiDelete: (...args: unknown[]) => apiDelete(...args),
  ApiError: class ApiError extends Error {},
}));

// Spy on navigation without losing MemoryRouter/Link's real behavior — the
// "take the offer" flow is asserted via the navigate call, and the
// converted-note link is asserted via its rendered href.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
  converted_story_id: null,
  converted_story: null,
  offer_dismissed_at: null,
  hidden: false,
};

function renderItem(props: Partial<React.ComponentProps<typeof ResponseItem>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResponseItem
          storyId="story-1"
          legacyId="legacy-1"
          sourceStoryId="story-1"
          response={baseResponse}
          currentUserId="user-2"
          canModerate={false}
          isStoryAuthor={false}
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

// A response with more than four `.?!`-terminated sentences — see
// isLongResponse.ts's threshold. Five short sentences comfortably clears it.
const LONG_BODY = 'One. Two. Three. Four. Five.';

describe('ResponseItem — "make it a story" offer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the offer for the author’s own long, undismissed, unconverted response', () => {
    renderItem({ response: { ...baseResponse, body: LONG_BODY } });

    expect(screen.getByTestId('convert-to-story-offer')).toBeInTheDocument();
    expect(screen.getByText(/this sounds like its own story/i)).toBeInTheDocument();
  });

  it('shows no offer for the author’s own short response', () => {
    renderItem();

    expect(screen.queryByTestId('convert-to-story-offer')).not.toBeInTheDocument();
  });

  it('shows no offer on another member’s long response', () => {
    renderItem({
      response: { ...baseResponse, body: LONG_BODY },
      currentUserId: 'user-3',
    });

    expect(screen.queryByTestId('convert-to-story-offer')).not.toBeInTheDocument();
  });

  it('shows no offer once it has been dismissed for that response', () => {
    renderItem({
      response: { ...baseResponse, body: LONG_BODY, offer_dismissed_at: new Date().toISOString() },
    });

    expect(screen.queryByTestId('convert-to-story-offer')).not.toBeInTheDocument();
  });

  it('shows no offer on a converted response, even if long', () => {
    renderItem({
      response: {
        ...baseResponse,
        body: LONG_BODY,
        converted_story_id: 'story-9',
        converted_story: { id: 'story-9', title: 'A Grown Story', legacy_id: 'legacy-9' },
      },
    });

    expect(screen.queryByTestId('convert-to-story-offer')).not.toBeInTheDocument();
  });

  it('shows no offer on an optimistic (temp-) row, even if long', () => {
    renderItem({
      response: { ...baseResponse, id: 'temp-123', body: LONG_BODY },
    });

    expect(screen.queryByTestId('convert-to-story-offer')).not.toBeInTheDocument();
  });

  it('navigates to the new-story page seeded with the raw body and source response id when taking the offer', async () => {
    const user = userEvent.setup();
    renderItem({ response: { ...baseResponse, body: LONG_BODY } });

    await user.click(screen.getByRole('button', { name: /make it a story/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/legacy/legacy-1/story/new', {
      state: { seedBody: LONG_BODY, sourceResponseId: 'response-1' },
    });
  });

  it('seeds a plain-text body verbatim, without applying any markdown formatting, when taking the offer', async () => {
    const user = userEvent.setup();
    const rawBody = '**Bold** intro. # Heading line. Third sentence. Fourth sentence. Fifth.';
    renderItem({ response: { ...baseResponse, body: rawBody } });

    await user.click(screen.getByRole('button', { name: /make it a story/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/legacy/legacy-1/story/new', {
      state: { seedBody: rawBody, sourceResponseId: 'response-1' },
    });
  });
});

describe('ResponseItem — converted note state', () => {
  const convertedResponse: StoryResponseItem = {
    ...baseResponse,
    body: 'This is the original body, now retired in favor of the note.',
    converted_story_id: 'story-9',
    converted_story: { id: 'story-9', title: 'A Grown Story', legacy_id: 'legacy-9' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Turned this into a story" link instead of the original body', () => {
    renderItem({ response: convertedResponse });

    const link = screen.getByRole('link', { name: /turned this into a story/i });
    expect(link).toHaveAttribute('href', '/legacy/legacy-9/story/story-9');
    expect(screen.queryByText(convertedResponse.body)).not.toBeInTheDocument();
  });

  it('shows no edit affordance for a converted note, even for its own author', () => {
    renderItem({ response: convertedResponse, currentUserId: 'user-2' });

    expect(screen.queryByRole('button', { name: /edit response/i })).not.toBeInTheDocument();
  });

  it('keeps the delete affordance for the note’s own author', () => {
    renderItem({ response: convertedResponse, currentUserId: 'user-2' });

    expect(screen.getByRole('button', { name: /delete response/i })).toBeInTheDocument();
  });
});

describe('ResponseItem — story-author "hide note" affordance', () => {
  const convertedResponse: StoryResponseItem = {
    ...baseResponse,
    converted_story_id: 'story-9',
    converted_story: { id: 'story-9', title: 'A Grown Story', legacy_id: 'legacy-9' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the hide affordance to the story author on a converted note', () => {
    renderItem({ response: convertedResponse, currentUserId: 'user-1', isStoryAuthor: true });

    expect(screen.getByRole('button', { name: /hide note/i })).toBeInTheDocument();
  });

  it('hides no affordance from a non-story-author viewer, even on a converted note', () => {
    renderItem({ response: convertedResponse, currentUserId: 'user-1', isStoryAuthor: false });

    expect(screen.queryByRole('button', { name: /hide note/i })).not.toBeInTheDocument();
  });

  it('shows no hide affordance on an ordinary (non-note) response, even for the story author', () => {
    renderItem({ response: baseResponse, currentUserId: 'user-1', isStoryAuthor: true });

    expect(screen.queryByRole('button', { name: /hide note/i })).not.toBeInTheDocument();
  });

  it('calls the hide endpoint when the story author clicks hide', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue({ ...convertedResponse, hidden: false });

    renderItem({ response: convertedResponse, currentUserId: 'user-1', isStoryAuthor: true });
    await user.click(screen.getByRole('button', { name: /hide note/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/stories/story-1/responses/response-1/hide');
    });
  });
});
