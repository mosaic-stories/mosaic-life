import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProfileHeader from './ProfileHeader';

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

describe('ProfileHeader', () => {
  it('shows saved narrative-only relationship details instead of the empty prompt', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={{
            id: 'legacy-1',
            name: 'Test Legacy',
            biography: null,
            birth_date: null,
            death_date: null,
            created_by: 'user-1',
            created_at: '2026-03-09T00:00:00Z',
            updated_at: '2026-03-09T00:00:00Z',
            visibility: 'public',
            story_count: 0,
            members: [],
            gender: 'female',
          }}
          dates=""
          storyCount={0}
          memberCount={0}
          onMembersClick={() => {}}
          memberProfile={{
            relationship_type: null,
            nicknames: null,
            legacy_to_viewer: 'She was my guiding light.',
            viewer_to_legacy: null,
            character_traits: null,
          }}
          isMember={true}
          legacyId="legacy-1"
        />
      </MemoryRouter>
    );

    expect(
      screen.queryByText('Describe your relationship with Test Legacy →')
    ).not.toBeInTheDocument();
    expect(screen.getByText('She was my guiding light.')).toBeInTheDocument();
  });
});