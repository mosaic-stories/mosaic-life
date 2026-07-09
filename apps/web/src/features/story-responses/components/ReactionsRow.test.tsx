import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReactionsRow from './ReactionsRow';

const apiPost = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiGet: vi.fn(),
  apiPost: (...args: unknown[]) => apiPost(...args),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

function renderRow(props: Partial<React.ComponentProps<typeof ReactionsRow>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReactionsRow
        storyId="story-1"
        counts={{ heart: 2, candle: 0, smile: 1 }}
        myReactions={[]}
        canReact
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ReactionsRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a button per reaction type and shows non-zero counts', () => {
    renderRow();

    expect(screen.getByRole('button', { name: /love this/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /light a candle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /this made me smile/i })).toBeInTheDocument();

    expect(screen.getByText('2')).toBeInTheDocument(); // heart count
    expect(screen.getByText('1')).toBeInTheDocument(); // smile count
    // Zero counts render no badge — only two count labels exist (2 and 1).
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders nothing when the viewer cannot react', () => {
    const { container } = renderRow({ canReact: false });
    expect(container.firstChild).toBeNull();
  });

  it('initializes toggled-on state from myReactions without any click', () => {
    renderRow({ myReactions: ['heart', 'smile'] });

    expect(screen.getByRole('button', { name: /love this/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /light a candle/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /this made me smile/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('renders no reactions as toggled-on when myReactions is empty', () => {
    renderRow({ myReactions: [] });

    for (const name of [/love this/i, /light a candle/i, /this made me smile/i]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('optimistically marks a reaction as toggled-on and bumps its count on click', async () => {
    const user = userEvent.setup();
    let resolvePost: (value: unknown) => void = () => {};
    apiPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    renderRow();

    const heartButton = screen.getByRole('button', { name: /love this/i });
    expect(heartButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(heartButton);

    expect(heartButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('3')).toBeInTheDocument(); // 2 -> 3 optimistically

    resolvePost({
      reacted: true,
      reaction_type: 'heart',
      reaction_heart_count: 3,
      reaction_candle_count: 0,
      reaction_smile_count: 1,
    });

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/stories/story-1/reactions', {
        reaction_type: 'heart',
      });
    });
  });

  it('toggles a reaction back off on a second click', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue({
      reacted: true,
      reaction_type: 'smile',
      reaction_heart_count: 2,
      reaction_candle_count: 0,
      reaction_smile_count: 2,
    });

    renderRow();
    const smileButton = screen.getByRole('button', { name: /this made me smile/i });

    await user.click(smileButton);
    await waitFor(() => expect(smileButton).toHaveAttribute('aria-pressed', 'true'));

    apiPost.mockResolvedValue({
      reacted: false,
      reaction_type: 'smile',
      reaction_heart_count: 2,
      reaction_candle_count: 0,
      reaction_smile_count: 1,
    });

    await user.click(smileButton);
    await waitFor(() => expect(smileButton).toHaveAttribute('aria-pressed', 'false'));
  });

  it('rolls back the optimistic toggle if the request fails', async () => {
    const user = userEvent.setup();
    let rejectPost: (err: Error) => void = () => {};
    apiPost.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPost = reject;
      }),
    );

    renderRow();
    const heartButton = screen.getByRole('button', { name: /love this/i });

    await user.click(heartButton);
    // Optimistic state applies immediately, before the request settles.
    expect(heartButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('3')).toBeInTheDocument();

    rejectPost(new Error('network error'));

    await waitFor(() => {
      expect(heartButton).toHaveAttribute('aria-pressed', 'false');
    });
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
