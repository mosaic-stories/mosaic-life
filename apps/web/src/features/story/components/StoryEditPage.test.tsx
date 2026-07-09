import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createStory: vi.fn(),
  updateStory: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/components/seo', () => ({ SEOHead: () => null }));

const mockExistingStory = {
  id: 'story-1',
  title: 'Existing title',
  content: 'Existing content',
  visibility: 'private' as const,
  status: 'published' as const,
};

let storyQueryResult: { data: typeof mockExistingStory | undefined; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
};

vi.mock('@/features/story/hooks/useStories', () => ({
  useStory: (storyId: string | undefined) =>
    storyId ? storyQueryResult : { data: undefined, isLoading: false },
  useCreateStory: () => ({ mutateAsync: mocks.createStory }),
  useUpdateStory: () => ({ mutateAsync: mocks.updateStory }),
}));

import StoryEditPage from './StoryEditPage';

function renderEditPage(options: { storyId?: string; seedQuote?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const entry = {
    pathname: options.storyId
      ? `/legacy/legacy-1/story/${options.storyId}/edit`
      : '/legacy/legacy-1/story/new',
    state: options.seedQuote ? { seedQuote: options.seedQuote } : undefined,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <StoryEditPage legacyId="legacy-1" storyId={options.storyId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoryEditPage', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.createStory.mockReset();
    mocks.updateStory.mockReset();
    mocks.createStory.mockResolvedValue({ id: 'new-story-id' });
    mocks.updateStory.mockResolvedValue({ id: 'story-1' });
    storyQueryResult = { data: undefined, isLoading: false };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a plain surface with title, body, and visibility — no Evolve panels', () => {
    storyQueryResult = { data: mockExistingStory, isLoading: false };
    renderEditPage({ storyId: 'story-1' });

    expect(screen.getByLabelText(/story title/i)).toBeInTheDocument();
    expect(screen.getByText('Visibility:')).toBeInTheDocument();
    expect(screen.queryByText(/ai workspace/i)).toBeInTheDocument(); // link entry only, no panel
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('creates nothing when the new-story page is opened and abandoned', () => {
    renderEditPage();
    expect(mocks.createStory).not.toHaveBeenCalled();
  });

  it('creates a draft story on first input and navigates to the edit route with replace', async () => {
    const user = userEvent.setup();
    renderEditPage();

    await user.type(screen.getByLabelText(/story title/i), 'A');

    await waitFor(() => {
      expect(mocks.createStory).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createStory).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'A',
        status: 'draft',
        legacies: [{ legacy_id: 'legacy-1', role: 'primary', position: 0 }],
      }),
    );

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith(
        '/legacy/legacy-1/story/new-story-id/edit',
        { replace: true },
      );
    });
  });

  it('seeds the body with the prompt as a quote when opened from a prompt card', () => {
    renderEditPage({ seedQuote: 'What was the best trip you took together?' });
    expect(
      screen.getByText(/What was the best trip you took together\?/),
    ).toBeInTheDocument();
  });

  it('debounces autosave and calls update once after the delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    storyQueryResult = { data: mockExistingStory, isLoading: false };
    renderEditPage({ storyId: 'story-1' });

    const titleInput = screen.getByLabelText(/story title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated title');

    expect(mocks.updateStory).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);

    expect(mocks.updateStory).toHaveBeenCalledTimes(1);
    expect(mocks.updateStory).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: 'story-1',
        data: expect.objectContaining({ title: 'Updated title' }),
      }),
    );
  });

  it('never fires an overlapping autosave while one is in flight, and saves the latest content once it frees up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    storyQueryResult = { data: mockExistingStory, isLoading: false };

    let resolveFirstSave: (() => void) | undefined;
    mocks.updateStory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSave = () => resolve({ id: 'story-1' });
        }),
    );

    renderEditPage({ storyId: 'story-1' });

    const titleInput = screen.getByLabelText(/story title/i);
    await user.type(titleInput, 'A');
    await vi.advanceTimersByTimeAsync(1500);

    // First autosave fired and is now stuck in flight (simulating a slow save).
    expect(mocks.updateStory).toHaveBeenCalledTimes(1);

    // User keeps typing while that save is still pending.
    await user.type(titleInput, 'B');
    await vi.advanceTimersByTimeAsync(1500);

    // The debounce fired again, but must NOT issue a second overlapping
    // request — only queue it — while the first is still unresolved.
    expect(mocks.updateStory).toHaveBeenCalledTimes(1);

    // Once the in-flight save resolves, the queued save (with the latest
    // content) should fire automatically.
    resolveFirstSave?.();
    await waitFor(() => {
      expect(mocks.updateStory).toHaveBeenCalledTimes(2);
    });
    expect(mocks.updateStory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        storyId: 'story-1',
        data: expect.objectContaining({ title: 'Existing titleAB' }),
      }),
    );
  });

  it('does not let a slow initial fetch clobber content the user already typed', async () => {
    const user = userEvent.setup();
    storyQueryResult = { data: undefined, isLoading: false }; // fetch still pending
    renderEditPage({ storyId: 'story-1' });

    const titleInput = screen.getByLabelText(/story title/i);
    await user.type(titleInput, 'User typed this');

    // The fetch finally resolves late, after the user already started typing.
    storyQueryResult = { data: mockExistingStory, isLoading: false };
    // One more keystroke forces a re-render that observes the new query result.
    await user.type(titleInput, '!');

    expect(titleInput).toHaveValue('User typed this!');
    expect(screen.queryByDisplayValue('Existing title')).not.toBeInTheDocument();
  });

  it('shows a retry affordance and preserves text after a failed autosave', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    storyQueryResult = { data: mockExistingStory, isLoading: false };
    mocks.updateStory.mockRejectedValueOnce(new Error('network error'));
    renderEditPage({ storyId: 'story-1' });

    const titleInput = screen.getByLabelText(/story title/i);
    await user.type(titleInput, '!');

    await vi.advanceTimersByTimeAsync(1500);

    await waitFor(() => {
      expect(screen.getByText(/couldn't save/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(titleInput).toHaveValue('Existing title!');
  });
});
