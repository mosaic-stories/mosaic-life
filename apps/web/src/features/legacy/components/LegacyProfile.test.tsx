import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchParams: new URLSearchParams(),
  authUser: {
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: null,
  },
  legacy: {
    id: 'legacy-1',
    name: 'Test Legacy',
    biography: 'Test biography',
    members: [{ email: 'test@example.com', role: 'creator' }],
    profile_image_url: null,
    birth_date: null,
    death_date: null,
    created_at: '2026-03-09T00:00:00Z',
    updated_at: '2026-03-09T00:00:00Z',
    person_id: 'person-1',
    profile_image_id: null,
    visibility: 'public',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [mocks.searchParams],
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.authUser }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacyWithFallback: () => ({ data: mocks.legacy, isLoading: false, error: null }),
  useDeleteLegacy: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/story/hooks/useStories', () => ({
  useStoriesWithFallback: () => ({ data: [], isLoading: false, error: null }),
  useCreateStory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/members/components/MyRelationshipSection', () => ({
  default: () => <div data-testid="my-relationship-section" />,
}));

vi.mock('@/features/legacy/api/legacies', () => ({
  formatLegacyDates: () => 'Jan 1, 1900 - Jan 1, 2000',
}));

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

vi.mock('@/components/seo', () => ({
  SEOHead: () => null,
  getLegacySchema: () => ({}),
}));

vi.mock('./ProfileHeader', () => ({
  default: () => <div data-testid="profile-header" />,
}));

vi.mock('./SectionNav', () => ({
  default: () => <div data-testid="section-nav" />,
}));

vi.mock('./StoriesSection', () => ({
  default: () => <div data-testid="stories-section" />,
}));

vi.mock('./MediaSection', () => ({
  default: () => <div data-testid="media-section" />,
}));

vi.mock('./AISection', () => ({
  default: () => <div data-testid="ai-section" />,
}));

vi.mock('./DeleteLegacyDialog', () => ({
  default: () => null,
}));

vi.mock('@/features/members/components/MemberDrawer', () => ({
  default: () => null,
}));

vi.mock('@/features/legacy-link/components/LegacyLinkPanel', () => ({
  default: () => <div data-testid="links-section" />,
}));

vi.mock('@/components/PageActionBar', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import LegacyProfile from './LegacyProfile';

describe('LegacyProfile tab sync', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams('tab=stories');
    mocks.navigate.mockReset();
  });

  it('updates the visible section when the tab query param changes while mounted', () => {
    const { rerender } = render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('stories-section')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-section')).not.toBeInTheDocument();

    mocks.searchParams = new URLSearchParams('tab=ai');
    rerender(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('ai-section')).toBeInTheDocument();
    expect(screen.queryByTestId('stories-section')).not.toBeInTheDocument();
  });

  it('shows My Relationship for admirer members', () => {
    mocks.legacy = {
      ...mocks.legacy,
      members: [{ email: 'test@example.com', role: 'admirer' }],
    };

    render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('my-relationship-section')).toBeInTheDocument();
  });
});