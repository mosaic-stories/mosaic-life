import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchParams: new URLSearchParams(),
  authUser: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: null,
  } as { id: string; name: string; email: string; avatar_url: string | null } | null,
  memberProfileHook: vi.fn<
    (legacyId: string, options?: { enabled?: boolean }) => { data: null; isLoading: boolean }
  >(() => ({ data: null, isLoading: false })),
  legacy: {
    id: 'legacy-1',
    name: 'Test Legacy',
    biography: 'Test biography',
    created_by: 'user-1',
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

vi.mock('@/features/members/hooks/useMemberProfile', () => ({
  useMemberProfile: (
    legacyId: string,
    options?: { enabled?: boolean }
  ) => mocks.memberProfileHook(legacyId, options),
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
  default: (props: { canAddStory?: boolean; canRequestAccess?: boolean; canManageLegacy?: boolean }) => (
    <div
      data-testid="profile-header"
      data-can-add-story={String(props.canAddStory)}
      data-can-request-access={String(props.canRequestAccess)}
      data-can-manage-legacy={String(props.canManageLegacy)}
    />
  ),
}));

vi.mock('./SectionNav', () => ({
  default: (props: { showAIChat?: boolean }) => (
    <div data-testid="section-nav" data-show-ai-chat={String(props.showAIChat)} />
  ),
}));

vi.mock('./StoriesSection', () => ({
  default: (props: { canAddStory?: boolean }) => (
    <div data-testid="stories-section" data-can-add-story={String(props.canAddStory)} />
  ),
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

vi.mock('./LegacySidebar', () => ({
  default: (props: { canManageLegacy?: boolean; canInviteMembers?: boolean }) => (
    <div
      data-testid="legacy-sidebar"
      data-can-manage-legacy={String(props.canManageLegacy)}
      data-can-invite-members={String(props.canInviteMembers)}
    />
  ),
}));

vi.mock('@/features/members/components/MemberDrawer', () => ({
  default: () => null,
}));

vi.mock('@/features/legacy-link/components/LegacyLinkPanel', () => ({
  default: () => <div data-testid="links-section" />,
}));

vi.mock('@/features/legacy-access/components/LegacyAccessRequestDialog', () => ({
  default: () => null,
}));

import LegacyProfile from './LegacyProfile';

describe('LegacyProfile', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams('tab=stories');
    mocks.navigate.mockReset();
    mocks.authUser = {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      avatar_url: null,
    };
    mocks.memberProfileHook.mockReset();
    mocks.memberProfileHook.mockReturnValue({ data: null, isLoading: false });
    mocks.legacy = {
      id: 'legacy-1',
      name: 'Test Legacy',
      biography: 'Test biography',
      created_by: 'user-1',
      members: [{ email: 'test@example.com', role: 'creator' }],
      profile_image_url: null,
      birth_date: null,
      death_date: null,
      created_at: '2026-03-09T00:00:00Z',
      updated_at: '2026-03-09T00:00:00Z',
      person_id: 'person-1',
      profile_image_id: null,
      visibility: 'public',
    };
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

  it('hides AI for non-members even when the URL requests the ai tab', () => {
    mocks.searchParams = new URLSearchParams('tab=ai');
    mocks.authUser = {
      id: 'viewer-1',
      name: 'Viewer',
      email: 'viewer@example.com',
      avatar_url: null,
    };
    mocks.legacy = {
      ...mocks.legacy,
      created_by: 'creator-1',
      members: [],
    };

    render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('section-nav')).toHaveAttribute('data-show-ai-chat', 'false');
    expect(screen.getByTestId('stories-section')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-section')).not.toBeInTheDocument();
  });

  it('renders profile header and sidebar', () => {
    render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('profile-header')).toBeInTheDocument();
    expect(screen.getByTestId('legacy-sidebar')).toBeInTheDocument();
  });

  it('renders profile header for admirer members', () => {
    mocks.legacy = {
      ...mocks.legacy,
      members: [{ email: 'test@example.com', role: 'admirer' }],
    };

    render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('profile-header')).toBeInTheDocument();
    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-manage-legacy', 'false');
  });

  it('does not expose creator-only legacy management actions for admin members', () => {
    mocks.legacy = {
      ...mocks.legacy,
      members: [{ email: 'test@example.com', role: 'admin' }],
    };

    render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-manage-legacy', 'false');
    expect(screen.getByTestId('legacy-sidebar')).toHaveAttribute('data-can-manage-legacy', 'false');
    expect(screen.getByTestId('legacy-sidebar')).toHaveAttribute('data-can-invite-members', 'true');
  });

  it('routes request access into the header and disables story creation for non-members', () => {
    mocks.authUser = {
      id: 'viewer-1',
      name: 'Viewer',
      email: 'viewer@example.com',
      avatar_url: null,
    };
    mocks.legacy = {
      ...mocks.legacy,
      created_by: 'creator-1',
      members: [],
    };

    render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-add-story', 'false');
    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-request-access', 'true');
    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-manage-legacy', 'false');
    expect(screen.getByTestId('stories-section')).toHaveAttribute('data-can-add-story', 'false');
    expect(screen.getByTestId('legacy-sidebar')).toHaveAttribute('data-can-manage-legacy', 'false');
    expect(screen.getByTestId('legacy-sidebar')).toHaveAttribute('data-can-invite-members', 'false');
  });

  it('disables member profile loading for public viewers who are not members', () => {
    mocks.authUser = null;
    mocks.legacy = {
      ...mocks.legacy,
      members: [],
    };

    render(<LegacyProfile legacyId="legacy-1" />);

    expect(mocks.memberProfileHook).toHaveBeenCalledWith('legacy-1', {
      enabled: false,
    });
  });
});
