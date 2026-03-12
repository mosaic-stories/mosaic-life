import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProfileHeader from './ProfileHeader';

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

const baseLegacy = {
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
  members: [],
  gender: 'female',
  profile_image_url: null,
};

describe('ProfileHeader', () => {
  it('renders the legacy name and biography in the hero', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={baseLegacy}
          dates="1957 – 2025"
          legacyId="legacy-1"
          isAuthenticated={true}
          onAddStory={() => {}}
          isCreatingStory={false}
          onShare={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Legacy');
    expect(screen.getByText(/An amazing person/)).toBeInTheDocument();
    expect(screen.getByText('1957 – 2025')).toBeInTheDocument();
  });

  it('shows Public badge for public legacies', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={baseLegacy}
          dates=""
          legacyId="legacy-1"
          isAuthenticated={false}
          onAddStory={() => {}}
          isCreatingStory={false}
          onShare={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('hides action buttons when not authenticated', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={baseLegacy}
          dates=""
          legacyId="legacy-1"
          isAuthenticated={false}
          onAddStory={() => {}}
          isCreatingStory={false}
          onShare={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('Add Story')).not.toBeInTheDocument();
  });

  it('renders breadcrumb navigation', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={baseLegacy}
          dates=""
          legacyId="legacy-1"
          isAuthenticated={false}
          onAddStory={() => {}}
          isCreatingStory={false}
          onShare={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Legacies')).toBeInTheDocument();
  });
});
