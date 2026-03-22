import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import LegacySidebar from './LegacySidebar';

vi.mock('@/features/story-prompts/hooks/useStoryPrompt', () => ({
  useCurrentPrompt: () => ({ data: null, isLoading: false }),
  useShufflePrompt: () => ({ mutate: vi.fn(), isPending: false }),
  useActOnPrompt: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/UserLink', () => ({
  default: ({ displayName }: { displayName: string }) => <div>{displayName}</div>,
}));

const legacy = {
  id: 'legacy-1',
  name: 'Test Legacy',
  biography: 'An amazing person',
  birth_date: null,
  death_date: null,
  created_by: 'user-1',
  created_at: '2026-03-09T00:00:00Z',
  updated_at: '2026-03-09T00:00:00Z',
  visibility: 'public' as const,
  story_count: 0,
  members: [
    {
      user_id: 'user-1',
      email: 'creator@example.com',
      name: 'Jordan Doe',
      username: 'jordan-doe',
      avatar_url: null,
      role: 'creator' as const,
      joined_at: '2026-03-09T00:00:00Z',
    },
  ],
  gender: 'female',
  profile_image_url: null,
};

describe('LegacySidebar', () => {
  it('hides management links for viewers who are not members', () => {
    render(
      <MemoryRouter>
        <LegacySidebar
          legacy={legacy}
          legacyId="legacy-1"
          canManageLegacy={false}
          canInviteMembers={false}
          onMembersClick={vi.fn()}
          onSectionChange={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('Edit biography')).not.toBeInTheDocument();
    expect(screen.queryByText('Invite someone')).not.toBeInTheDocument();
  });

  it('shows edit and invite links for creators', () => {
    render(
      <MemoryRouter>
        <LegacySidebar
          legacy={legacy}
          legacyId="legacy-1"
          canManageLegacy={true}
          canInviteMembers={true}
          onMembersClick={vi.fn()}
          onSectionChange={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Edit biography')).toBeInTheDocument();
    expect(screen.getByText('Invite someone')).toBeInTheDocument();
  });

  it('shows invite without legacy editing for non-creator managers', () => {
    render(
      <MemoryRouter>
        <LegacySidebar
          legacy={legacy}
          legacyId="legacy-1"
          canManageLegacy={false}
          canInviteMembers={true}
          onMembersClick={vi.fn()}
          onSectionChange={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('Edit biography')).not.toBeInTheDocument();
    expect(screen.getByText('Invite someone')).toBeInTheDocument();
  });
});
