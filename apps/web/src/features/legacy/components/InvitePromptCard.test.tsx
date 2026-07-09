import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitePromptCard from './InvitePromptCard';
import { shouldShowInvitePrompt, type Legacy } from '@/features/legacy/api/legacies';

const mocks = vi.hoisted(() => ({
  dismissMutate: vi.fn(),
  dismissIsPending: false,
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useDismissInvitePrompt: () => ({
    mutate: mocks.dismissMutate,
    isPending: mocks.dismissIsPending,
  }),
}));

vi.mock('@/features/members/components/InviteMemberModal', () => ({
  default: ({
    isOpen,
    legacyId,
    currentUserRole,
  }: {
    isOpen: boolean;
    legacyId: string;
    currentUserRole: string;
  }) => (isOpen ? <div data-testid="invite-modal">{legacyId}:{currentUserRole}</div> : null),
}));

const baseLegacy: Legacy = {
  id: 'legacy-1',
  name: 'Karen',
  birth_date: null,
  death_date: null,
  biography: null,
  visibility: 'private',
  created_by: 'user-1',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  story_count: 1,
  published_story_count: 1,
  member_count: 1,
  invite_prompt_dismissed_at: null,
};

describe('shouldShowInvitePrompt', () => {
  it('shows when exactly one member and exactly one published story', () => {
    expect(
      shouldShowInvitePrompt({
        member_count: 1,
        published_story_count: 1,
        invite_prompt_dismissed_at: null,
      })
    ).toBe(true);
  });

  it('shows right after legacy creation, before any story is published', () => {
    expect(
      shouldShowInvitePrompt({
        member_count: 1,
        published_story_count: 0,
        invite_prompt_dismissed_at: null,
      })
    ).toBe(true);
  });

  it('does not show once a legacy has two or more members, regardless of story count', () => {
    expect(
      shouldShowInvitePrompt({
        member_count: 2,
        published_story_count: 0,
        invite_prompt_dismissed_at: null,
      })
    ).toBe(false);
    expect(
      shouldShowInvitePrompt({
        member_count: 2,
        published_story_count: 1,
        invite_prompt_dismissed_at: null,
      })
    ).toBe(false);
  });

  it('does not show once dismissed, regardless of counts', () => {
    expect(
      shouldShowInvitePrompt({
        member_count: 1,
        published_story_count: 1,
        invite_prompt_dismissed_at: '2026-07-01T00:00:00Z',
      })
    ).toBe(false);
  });
});

describe('InvitePromptCard', () => {
  beforeEach(() => {
    mocks.dismissMutate.mockReset();
    mocks.dismissIsPending = false;
  });

  it('renders the invite moment prompt when conditions are met', () => {
    render(<InvitePromptCard legacy={baseLegacy} currentUserRole="creator" />);

    expect(screen.getByText(/Karen.s page is ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /invite people/i })).toBeInTheDocument();
  });

  it('renders nothing once the legacy has a second member', () => {
    render(
      <InvitePromptCard legacy={{ ...baseLegacy, member_count: 2 }} currentUserRole="creator" />
    );

    expect(screen.queryByText(/page is ready/i)).not.toBeInTheDocument();
  });

  it('renders nothing once the prompt has been dismissed', () => {
    render(
      <InvitePromptCard
        legacy={{ ...baseLegacy, invite_prompt_dismissed_at: '2026-07-01T00:00:00Z' }}
        currentUserRole="creator"
      />
    );

    expect(screen.queryByText(/page is ready/i)).not.toBeInTheDocument();
  });

  it('opens the existing invite modal, scoped to the legacy, on call to action', async () => {
    const user = userEvent.setup();
    render(<InvitePromptCard legacy={baseLegacy} currentUserRole="creator" />);

    expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /invite people/i }));

    expect(screen.getByTestId('invite-modal')).toHaveTextContent('legacy-1:creator');
  });

  it('dismisses via the dismiss endpoint mutation, scoped to this legacy', async () => {
    const user = userEvent.setup();
    render(<InvitePromptCard legacy={baseLegacy} currentUserRole="creator" />);

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(mocks.dismissMutate).toHaveBeenCalledWith('legacy-1');
  });
});
