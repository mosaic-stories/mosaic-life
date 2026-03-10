import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MyRelationshipSection from './MyRelationshipSection';
import type { MemberProfile } from '@/features/members/api/memberProfile';

const mocks = vi.hoisted(() => ({
  profile: null as MemberProfile | null,
  mutateAsync: vi.fn(),
}));

vi.mock('@/features/members/hooks/useMemberProfile', async () => {
  const actual = await vi.importActual<typeof import('@/features/members/hooks/useMemberProfile')>(
    '@/features/members/hooks/useMemberProfile'
  );

  return {
    ...actual,
    useMemberProfile: () => ({ data: mocks.profile, isLoading: false }),
    useUpdateMemberProfile: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  };
});

describe('MyRelationshipSection', () => {
  beforeEach(() => {
    mocks.profile = {
      relationship_type: 'friend',
      nickname: 'Buddy',
      legacy_to_viewer: 'My oldest friend',
      viewer_to_legacy: 'A trusted confidant',
      character_traits: ['Kind'],
    };
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockResolvedValue(mocks.profile);
  });

  it('sends explicit clears for emptied relationship fields', async () => {
    const user = userEvent.setup();

    render(<MyRelationshipSection legacyId="legacy-1" legacyName="Test Legacy" />);

    await user.click(screen.getByRole('button', { name: /my relationship/i }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    await user.selectOptions(screen.getByLabelText('Relationship'), '');
    await user.clear(screen.getByLabelText('What do you call them?'));
    await user.clear(screen.getByLabelText('Who they are to you'));
    await user.clear(screen.getByLabelText('Who you are to them'));

    const traitChip = screen.getByText('Kind').closest('span');
    expect(traitChip).not.toBeNull();
    await user.click(within(traitChip as HTMLElement).getByRole('button'));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        relationship_type: null,
        nickname: null,
        legacy_to_viewer: null,
        viewer_to_legacy: null,
        character_traits: [],
      });
    });
  });
});