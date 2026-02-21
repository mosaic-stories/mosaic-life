import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createContext, useContext, useState, useEffect, createElement } from 'react';
import type { ReactNode } from 'react';

// Lightweight inline HeaderContext to avoid barrel import loading AppHeader tree
const HeaderContext = createContext<{
  slotContent: ReactNode;
  setSlotContent: (c: ReactNode) => void;
} | null>(null);

function TestHeaderProvider({ children }: { children: ReactNode }) {
  const [slotContent, setSlotContent] = useState<ReactNode>(null);
  return createElement(
    HeaderContext.Provider,
    { value: { slotContent, setSlotContent } },
    // Render the slot content (in real app, AppHeader does this)
    createElement('div', { 'data-testid': 'header-slot' }, slotContent),
    children
  );
}

function TestHeaderSlot({ children }: { children: ReactNode }) {
  const ctx = useContext(HeaderContext);
  useEffect(() => {
    ctx?.setSlotContent(children);
    return () => ctx?.setSlotContent(null);
  }, [children, ctx]);
  return null;
}

vi.mock('@/components/header', () => ({
  HeaderProvider: TestHeaderProvider,
  HeaderSlot: TestHeaderSlot,
  useHeaderContext: () => useContext(HeaderContext),
}));

// Mock heavy version components — they have their own unit tests.
// This prevents loading Radix Sheet/AlertDialog/ScrollArea which OOM the worker.
let capturedDrawerProps: Record<string, unknown> = {};
let capturedBannerProps: Record<string, unknown> = {};

vi.mock('./VersionHistoryButton', () => ({
  default: (props: { versionCount: number | null; onClick: () => void }) => {
    if (!props.versionCount || props.versionCount <= 1) return null;
    return createElement('button', {
      'aria-label': 'History',
      onClick: props.onClick,
    }, 'History');
  },
}));

vi.mock('./VersionHistoryDrawer', () => ({
  default: (props: Record<string, unknown>) => {
    capturedDrawerProps = props;
    if (!props.open) return null;
    return createElement('div', { 'data-testid': 'version-drawer' },
      createElement('span', null, 'Version History'),
      createElement('button', {
        'data-testid': 'select-v2',
        onClick: () => (props.onSelectVersion as (n: number) => void)(2),
      }, 'Select v2'),
    );
  },
}));

vi.mock('./VersionPreviewBanner', () => ({
  default: (props: Record<string, unknown>) => {
    capturedBannerProps = props;
    return createElement('div', { 'data-testid': 'preview-banner' },
      `Viewing version ${props.versionNumber}`,
    );
  },
}));

// Mock other heavy child components
vi.mock('@/components/seo', () => ({ SEOHead: () => null }));

vi.mock('./LegacyMultiSelect', () => ({
  default: () => createElement('div', { 'data-testid': 'legacy-multi-select' }),
}));

vi.mock('../lib/themes', () => ({
  getThemeClasses: () => ({}),
}));

// Mock auth context
let mockAuthUser = { id: 'user-1', email: 'author@test.com', name: 'Author' };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
  }),
}));

// Stable legacy references
const mockLegacyData = {
  id: 'legacy-1',
  name: 'Test Legacy',
  members: [{ email: 'author@test.com', role: 'creator' }],
};
const mockLegacyResult = { data: mockLegacyData, isLoading: false };
const mockLegaciesResult = { data: [{ id: 'legacy-1', name: 'Test Legacy' }], isLoading: false };

vi.mock('@/lib/hooks/useLegacies', () => ({
  useLegacies: () => mockLegaciesResult,
  useLegacy: () => mockLegacyResult,
}));

// Stable references to prevent infinite re-render loops in useEffect([existingStory])
const mockStoryData = {
  id: 'story-1',
  title: 'Test Story',
  content: 'Test content',
  visibility: 'private' as const,
  author_id: 'user-1',
  author_name: 'Author',
  author_email: 'author@test.com',
  legacies: [
    {
      legacy_id: 'legacy-1',
      legacy_name: 'Test Legacy',
      role: 'primary' as const,
      position: 0,
    },
  ],
  version_count: 3,
  has_draft: false,
  created_at: '2026-02-15T10:00:00Z',
  updated_at: '2026-02-16T10:00:00Z',
};

const mockStoryResult = { data: mockStoryData, isLoading: false };

// Mock story hook to return story with version_count
vi.mock('@/lib/hooks/useStories', () => ({
  useStory: () => mockStoryResult,
  useCreateStory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateStory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  storyKeys: {
    all: ['stories'],
    lists: () => ['stories', 'list'],
    detail: (id: string) => ['stories', 'detail', id],
  },
}));

// Mock version hooks
const mockVersionsData = {
  versions: [
    {
      version_number: 3,
      status: 'active' as const,
      source: 'edit',
      source_version: null,
      change_summary: 'Updated intro',
      stale: false,
      created_by: 'user-1',
      created_at: '2026-02-16T12:00:00Z',
    },
    {
      version_number: 2,
      status: 'inactive' as const,
      source: 'edit',
      source_version: null,
      change_summary: 'Added middle section',
      stale: false,
      created_by: 'user-1',
      created_at: '2026-02-15T10:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  warning: null,
};

// Stable version detail references
const mockVersionDetail2 = {
  version_number: 2,
  title: 'Old Title',
  content: 'Old content from version 2',
  status: 'inactive' as const,
  source: 'edit',
  source_version: null,
  change_summary: 'Added middle section',
  stale: false,
  created_by: 'user-1',
  created_at: '2026-02-15T10:00:00Z',
};
const mockVersionsResult = { data: mockVersionsData, isLoading: false };
const mockVersionDetailResult2 = { data: mockVersionDetail2, isLoading: false };
const mockVersionDetailResultEmpty = { data: undefined, isLoading: false };

vi.mock('@/lib/hooks/useVersions', () => ({
  useVersions: () => mockVersionsResult,
  useVersionDetail: (_storyId: string, versionNumber: number | null) =>
    versionNumber === 2 ? mockVersionDetailResult2 : mockVersionDetailResultEmpty,
  useRestoreVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useApproveDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useDiscardDraft: () => ({ mutate: vi.fn(), isPending: false }),
  versionKeys: {
    all: ['versions'],
    list: (id: string) => ['versions', id, 'list'],
    detail: (id: string, n: number) => ['versions', id, 'detail', n],
  },
}));

// Mock API modules to prevent HTTP client import chain
vi.mock('@/lib/api/versions', () => ({
  getVersions: vi.fn(),
  getVersion: vi.fn(),
  restoreVersion: vi.fn(),
  approveDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock('@/lib/api/stories', () => ({
  getStory: vi.fn(),
  getStories: vi.fn(),
  createStory: vi.fn(),
  updateStory: vi.fn(),
  deleteStory: vi.fn(),
  getPublicStories: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import StoryCreation from './StoryCreation';

function renderStoryCreation(storyId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        null,
        createElement(
          TestHeaderProvider,
          null,
          createElement(StoryCreation, {
            onNavigate: vi.fn(),
            legacyId: 'legacy-1',
            storyId: storyId ?? 'story-1',
            currentTheme: 'default',
            onThemeChange: vi.fn(),
          })
        )
      )
    )
  );
}

describe('StoryCreation - Version History integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDrawerProps = {};
    capturedBannerProps = {};
    mockAuthUser = { id: 'user-1', email: 'author@test.com', name: 'Author' };
  });

  it('shows History button when version_count > 1', () => {
    renderStoryCreation();
    expect(
      screen.getByRole('button', { name: /history/i })
    ).toBeInTheDocument();
  });

  it('shows History button when author_id matches but email differs', () => {
    mockAuthUser = { id: 'user-1', email: 'AUTHOR@TEST.COM', name: 'Author' };

    renderStoryCreation();

    expect(
      screen.getByRole('button', { name: /history/i })
    ).toBeInTheDocument();
  });

  it('does not show Edit Story button for non-author user', () => {
    mockAuthUser = { id: 'user-2', email: 'other@test.com', name: 'Other User' };

    renderStoryCreation();

    expect(
      screen.queryByRole('button', { name: /edit story/i })
    ).not.toBeInTheDocument();
  });

  it('opens drawer when History button is clicked', async () => {
    const user = userEvent.setup();
    renderStoryCreation();

    await user.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByTestId('version-drawer')).toBeInTheDocument();
      expect(screen.getByText('Version History')).toBeInTheDocument();
    });
  });

  it('passes version data to drawer', async () => {
    const user = userEvent.setup();
    renderStoryCreation();

    await user.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(capturedDrawerProps.open).toBe(true);
      expect(capturedDrawerProps.data).toBe(mockVersionsData);
      expect(capturedDrawerProps.selectedVersion).toBeNull();
    });
  });

  it('shows preview banner when a non-active version is selected', async () => {
    const user = userEvent.setup();
    renderStoryCreation();

    // Open drawer
    await user.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => {
      expect(screen.getByTestId('version-drawer')).toBeInTheDocument();
    });

    // Click "Select v2" in the mocked drawer
    await user.click(screen.getByTestId('select-v2'));

    await waitFor(() => {
      expect(screen.getByTestId('preview-banner')).toBeInTheDocument();
      expect(screen.getByText(/viewing version 2/i)).toBeInTheDocument();
    });
  });

  it('swaps displayed content when previewing a version', async () => {
    const user = userEvent.setup();
    renderStoryCreation();

    // Open drawer and select version 2
    await user.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => {
      expect(screen.getByTestId('version-drawer')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('select-v2'));

    // The preview version's title and content should replace the original
    await waitFor(() => {
      expect(screen.getByText('Old Title')).toBeInTheDocument();
      expect(screen.getByText('Old content from version 2')).toBeInTheDocument();
    });
  });

  it('passes correct props to preview banner', async () => {
    const user = userEvent.setup();
    renderStoryCreation();

    await user.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => {
      expect(screen.getByTestId('version-drawer')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('select-v2'));

    await waitFor(() => {
      expect(capturedBannerProps.versionNumber).toBe(2);
      expect(capturedBannerProps.source).toBe('edit');
      expect(capturedBannerProps.isActive).toBe(false);
      expect(typeof capturedBannerProps.onRestore).toBe('function');
    });
  });
});
