# Version History Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the frontend UI for browsing and restoring story versions — a right-side drawer with a version timeline, preview mode, and restore/draft actions.

**Architecture:** Three new components (`VersionHistoryButton`, `VersionHistoryDrawer`, `VersionPreviewBanner`) integrated into the existing `StoryCreation` component via the header slot system. All server state managed by TanStack Query with new API client and hooks. No Zustand — all state is ephemeral (drawer open, selected version).

**Tech Stack:** React 18, TypeScript, TanStack Query, shadcn/ui (Sheet, AlertDialog, Badge, ScrollArea, Button), date-fns, lucide-react icons.

**Design Doc:** `docs/plans/2026-02-16-version-history-frontend-design.md`

---

## Task 1: Add `version_count` and `has_draft` to StoryDetail type

The backend already returns `version_count` and `has_draft` on the story detail response (only for the author; `null` for others). The frontend type doesn't include them yet.

**Files:**
- Modify: `apps/web/src/lib/api/stories.ts` (lines 29-40, `StoryDetail` interface)

**Step 1: Update StoryDetail interface**

In `apps/web/src/lib/api/stories.ts`, add two fields to `StoryDetail`:

```typescript
export interface StoryDetail {
  id: string;
  legacies: LegacyAssociation[];
  author_id: string;
  author_name: string;
  author_email: string;
  title: string;
  content: string;
  visibility: 'public' | 'private' | 'personal';
  version_count: number | null;  // null if not author
  has_draft: boolean | null;     // null if not author
  created_at: string;
  updated_at: string;
}
```

**Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS (no type errors — the fields are additive and nullable)

**Step 3: Commit**

```bash
git add apps/web/src/lib/api/stories.ts
git commit -m "feat(versioning): add version_count and has_draft to StoryDetail type"
```

---

## Task 2: Create version API types

New file with TypeScript interfaces matching the backend Pydantic schemas.

**Files:**
- Create: `apps/web/src/lib/api/versions.ts`

**Step 1: Create the types and API functions file**

Create `apps/web/src/lib/api/versions.ts`:

```typescript
import { apiGet, apiPost, apiDelete } from './client';

// --- Types ---

export interface VersionSummary {
  version_number: number;
  status: 'active' | 'inactive' | 'draft';
  source: string;
  source_version: number | null;
  change_summary: string | null;
  stale: boolean;
  created_by: string;
  created_at: string;
}

export interface VersionDetail extends VersionSummary {
  title: string;
  content: string;
}

export interface VersionListResponse {
  versions: VersionSummary[];
  total: number;
  page: number;
  page_size: number;
  warning: string | null;
}

// --- API Functions ---

export async function getVersions(
  storyId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<VersionListResponse> {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('page_size', String(pageSize));
  return apiGet<VersionListResponse>(
    `/api/stories/${storyId}/versions?${params.toString()}`
  );
}

export async function getVersion(
  storyId: string,
  versionNumber: number
): Promise<VersionDetail> {
  return apiGet<VersionDetail>(
    `/api/stories/${storyId}/versions/${versionNumber}`
  );
}

export async function restoreVersion(
  storyId: string,
  versionNumber: number
): Promise<VersionDetail> {
  return apiPost<VersionDetail>(
    `/api/stories/${storyId}/versions/${versionNumber}/activate`
  );
}

export async function approveDraft(
  storyId: string
): Promise<VersionDetail> {
  return apiPost<VersionDetail>(
    `/api/stories/${storyId}/versions/draft/approve`
  );
}

export async function discardDraft(storyId: string): Promise<void> {
  return apiDelete(`/api/stories/${storyId}/versions/draft`);
}
```

**Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/lib/api/versions.ts
git commit -m "feat(versioning): add version API client with types"
```

---

## Task 3: Create version query hooks — write failing tests

TanStack Query hooks for fetching versions, version detail, and mutations (restore, approve, discard).

**Files:**
- Create: `apps/web/src/lib/hooks/useVersions.test.ts`
- Create: `apps/web/src/lib/hooks/useVersions.ts`

**Step 1: Write the failing tests**

Create `apps/web/src/lib/hooks/useVersions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { versionKeys, useVersions, useVersionDetail } from './useVersions';

// Mock the API module
vi.mock('@/lib/api/versions', () => ({
  getVersions: vi.fn(),
  getVersion: vi.fn(),
  restoreVersion: vi.fn(),
  approveDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

import {
  getVersions,
  getVersion,
} from '@/lib/api/versions';
import type { VersionListResponse, VersionDetail } from '@/lib/api/versions';

const mockedGetVersions = vi.mocked(getVersions);
const mockedGetVersion = vi.mocked(getVersion);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('versionKeys', () => {
  it('generates correct key hierarchy', () => {
    expect(versionKeys.all).toEqual(['versions']);
    expect(versionKeys.list('story-1')).toEqual(['versions', 'story-1', 'list']);
    expect(versionKeys.detail('story-1', 3)).toEqual(['versions', 'story-1', 'detail', 3]);
  });
});

describe('useVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when enabled is false', () => {
    renderHook(() => useVersions('story-1', false), {
      wrapper: createWrapper(),
    });
    expect(mockedGetVersions).not.toHaveBeenCalled();
  });

  it('fetches versions when enabled', async () => {
    const mockResponse: VersionListResponse = {
      versions: [
        {
          version_number: 2,
          status: 'active',
          source: 'edit',
          source_version: null,
          change_summary: 'Updated title',
          stale: false,
          created_by: 'user-1',
          created_at: '2026-02-16T10:00:00Z',
        },
        {
          version_number: 1,
          status: 'inactive',
          source: 'creation',
          source_version: null,
          change_summary: null,
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
    mockedGetVersions.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useVersions('story-1', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockResponse);
    expect(mockedGetVersions).toHaveBeenCalledWith('story-1', 1, 20);
  });
});

describe('useVersionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when versionNumber is null', () => {
    renderHook(() => useVersionDetail('story-1', null), {
      wrapper: createWrapper(),
    });
    expect(mockedGetVersion).not.toHaveBeenCalled();
  });

  it('fetches version detail when versionNumber is provided', async () => {
    const mockDetail: VersionDetail = {
      version_number: 1,
      title: 'Original Title',
      content: 'Original content',
      status: 'inactive',
      source: 'creation',
      source_version: null,
      change_summary: null,
      stale: false,
      created_by: 'user-1',
      created_at: '2026-02-15T10:00:00Z',
    };
    mockedGetVersion.mockResolvedValue(mockDetail);

    const { result } = renderHook(() => useVersionDetail('story-1', 1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockDetail);
    expect(mockedGetVersion).toHaveBeenCalledWith('story-1', 1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/lib/hooks/useVersions.test.ts`
Expected: FAIL — module `./useVersions` not found

**Step 3: Write the hooks implementation**

Create `apps/web/src/lib/hooks/useVersions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getVersions,
  getVersion,
  restoreVersion,
  approveDraft,
  discardDraft,
} from '@/lib/api/versions';
import { storyKeys } from './useStories';

export const versionKeys = {
  all: ['versions'] as const,
  list: (storyId: string) => [...versionKeys.all, storyId, 'list'] as const,
  detail: (storyId: string, versionNumber: number) =>
    [...versionKeys.all, storyId, 'detail', versionNumber] as const,
};

export function useVersions(storyId: string, enabled: boolean) {
  return useQuery({
    queryKey: versionKeys.list(storyId),
    queryFn: () => getVersions(storyId, 1, 20),
    enabled,
  });
}

export function useVersionDetail(
  storyId: string,
  versionNumber: number | null
) {
  return useQuery({
    queryKey: versionKeys.detail(storyId, versionNumber!),
    queryFn: () => getVersion(storyId, versionNumber!),
    enabled: versionNumber !== null,
  });
}

export function useRestoreVersion(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionNumber: number) =>
      restoreVersion(storyId, versionNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}

export function useApproveDraft(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => approveDraft(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}

export function useDiscardDraft(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => discardDraft(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/lib/hooks/useVersions.test.ts`
Expected: PASS — all tests green

**Step 5: Commit**

```bash
git add apps/web/src/lib/hooks/useVersions.ts apps/web/src/lib/hooks/useVersions.test.ts
git commit -m "feat(versioning): add version query hooks with tests"
```

---

## Task 4: Create VersionHistoryButton component

Clock icon button that appears in the header slot. Visible only when `version_count > 1` and the user is the story author.

**Files:**
- Create: `apps/web/src/components/VersionHistoryButton.test.tsx`
- Create: `apps/web/src/components/VersionHistoryButton.tsx`

**Step 1: Write the failing tests**

Create `apps/web/src/components/VersionHistoryButton.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistoryButton from './VersionHistoryButton';

describe('VersionHistoryButton', () => {
  it('renders nothing when versionCount is 1', () => {
    const { container } = render(
      <VersionHistoryButton versionCount={1} onClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when versionCount is null', () => {
    const { container } = render(
      <VersionHistoryButton versionCount={null} onClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders button when versionCount > 1', () => {
    render(
      <VersionHistoryButton versionCount={3} onClick={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <VersionHistoryButton versionCount={3} onClick={handleClick} />
    );

    await user.click(screen.getByRole('button', { name: /history/i }));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/VersionHistoryButton.test.tsx`
Expected: FAIL — module `./VersionHistoryButton` not found

**Step 3: Write the component**

Create `apps/web/src/components/VersionHistoryButton.tsx`:

```typescript
import { Clock } from 'lucide-react';
import { Button } from './ui/button';

interface VersionHistoryButtonProps {
  versionCount: number | null;
  onClick: () => void;
}

export default function VersionHistoryButton({
  versionCount,
  onClick,
}: VersionHistoryButtonProps) {
  if (!versionCount || versionCount <= 1) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2"
      onClick={onClick}
      aria-label="History"
    >
      <Clock className="size-4" />
      History
    </Button>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/VersionHistoryButton.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/VersionHistoryButton.tsx apps/web/src/components/VersionHistoryButton.test.tsx
git commit -m "feat(versioning): add VersionHistoryButton component with tests"
```

---

## Task 5: Create VersionHistoryDrawer component

Right-side sheet with header zone, optional draft zone, and scrollable version list with pagination.

**Files:**
- Create: `apps/web/src/components/VersionHistoryDrawer.test.tsx`
- Create: `apps/web/src/components/VersionHistoryDrawer.tsx`

**Step 1: Write the failing tests**

Create `apps/web/src/components/VersionHistoryDrawer.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistoryDrawer from './VersionHistoryDrawer';
import type { VersionSummary, VersionListResponse } from '@/lib/api/versions';

const activeVersion: VersionSummary = {
  version_number: 3,
  status: 'active',
  source: 'edit',
  source_version: null,
  change_summary: 'Updated introduction',
  stale: false,
  created_by: 'user-1',
  created_at: '2026-02-16T12:00:00Z',
};

const inactiveVersion: VersionSummary = {
  version_number: 2,
  status: 'inactive',
  source: 'edit',
  source_version: null,
  change_summary: 'Added conclusion',
  stale: false,
  created_by: 'user-1',
  created_at: '2026-02-15T10:00:00Z',
};

const draftVersion: VersionSummary = {
  version_number: 4,
  status: 'draft',
  source: 'ai_generate',
  source_version: 3,
  change_summary: 'AI-enhanced introduction',
  stale: false,
  created_by: 'user-1',
  created_at: '2026-02-16T14:00:00Z',
};

const baseData: VersionListResponse = {
  versions: [activeVersion, inactiveVersion],
  total: 2,
  page: 1,
  page_size: 20,
  warning: null,
};

describe('VersionHistoryDrawer', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    data: baseData,
    isLoading: false,
    selectedVersion: null as number | null,
    onSelectVersion: vi.fn(),
    onApproveDraft: vi.fn(),
    onDiscardDraft: vi.fn(),
    isDraftActionPending: false,
  };

  it('renders title "Version History"', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.getByText('Version History')).toBeInTheDocument();
  });

  it('renders version entries from data', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('shows Active badge on active version', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows change summary text', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.getByText('Updated introduction')).toBeInTheDocument();
    expect(screen.getByText('Added conclusion')).toBeInTheDocument();
  });

  it('calls onSelectVersion when a version entry is clicked', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    render(
      <VersionHistoryDrawer {...defaultProps} onSelectVersion={handleSelect} />
    );

    await user.click(screen.getByText('v2'));
    expect(handleSelect).toHaveBeenCalledWith(2);
  });

  it('highlights the selected version', () => {
    render(
      <VersionHistoryDrawer {...defaultProps} selectedVersion={2} />
    );
    const selectedEntry = screen.getByText('v2').closest('[data-selected]');
    expect(selectedEntry).toHaveAttribute('data-selected', 'true');
  });

  it('renders draft zone when draft version exists', () => {
    const dataWithDraft: VersionListResponse = {
      ...baseData,
      versions: [draftVersion, activeVersion, inactiveVersion],
      total: 3,
    };
    render(
      <VersionHistoryDrawer {...defaultProps} data={dataWithDraft} />
    );
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });

  it('shows warning banner when warning is present', () => {
    const dataWithWarning: VersionListResponse = {
      ...baseData,
      warning: 'This story has 55 versions. Consider removing old versions.',
    };
    render(
      <VersionHistoryDrawer {...defaultProps} data={dataWithWarning} />
    );
    expect(
      screen.getByText(/55 versions/i)
    ).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <VersionHistoryDrawer {...defaultProps} data={undefined} isLoading={true} />
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('does not render draft zone when no draft exists', () => {
    render(<VersionHistoryDrawer {...defaultProps} />);
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/VersionHistoryDrawer.test.tsx`
Expected: FAIL — module `./VersionHistoryDrawer` not found

**Step 3: Write the component**

Create `apps/web/src/components/VersionHistoryDrawer.tsx`:

```typescript
import { Loader2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './ui/sheet';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Card } from './ui/card';
import type { VersionSummary, VersionListResponse } from '@/lib/api/versions';

interface VersionHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: VersionListResponse | undefined;
  isLoading: boolean;
  selectedVersion: number | null;
  onSelectVersion: (versionNumber: number) => void;
  onApproveDraft: () => void;
  onDiscardDraft: () => void;
  isDraftActionPending: boolean;
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'edit':
      return 'Manual edit';
    case 'ai_generate':
      return 'AI enhancement';
    case 'restoration':
      return 'Restoration';
    case 'creation':
      return 'Original';
    default:
      return source;
  }
}

function DraftZone({
  draft,
  selected,
  onSelect,
  onApprove,
  onDiscard,
  isPending,
}: {
  draft: VersionSummary;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onDiscard: () => void;
  isPending: boolean;
}) {
  return (
    <Card
      className={`p-4 border-amber-200 bg-amber-50 cursor-pointer ${
        selected ? 'ring-2 ring-amber-400' : ''
      }`}
      onClick={onSelect}
      data-selected={selected}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-300 text-amber-700">
            Draft
          </Badge>
          <span className="text-xs text-neutral-500">
            {getSourceLabel(draft.source)}
          </span>
        </div>
        {draft.change_summary && (
          <p className="text-sm text-neutral-700 line-clamp-1">
            {draft.change_summary}
          </p>
        )}
        {draft.stale && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="size-3" />
            Created based on an older version
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            disabled={isPending}
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            disabled={isPending}
          >
            Discard
          </Button>
        </div>
      </div>
    </Card>
  );
}

function VersionEntry({
  version,
  selected,
  onSelect,
}: {
  version: VersionSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const isActive = version.status === 'active';

  return (
    <button
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'border-blue-300 bg-blue-50'
          : 'border-transparent hover:bg-neutral-50'
      }`}
      onClick={onSelect}
      data-selected={selected}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
            isActive
              ? 'bg-green-100 text-green-700'
              : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          v{version.version_number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {getSourceLabel(version.source)}
            </Badge>
            {isActive && (
              <Badge
                variant="default"
                className="text-[10px] bg-green-600"
              >
                Active
              </Badge>
            )}
          </div>
          {version.change_summary && (
            <p className="text-sm text-neutral-700 mt-1 line-clamp-1">
              {version.change_summary}
            </p>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            {formatDistanceToNow(new Date(version.created_at), {
              addSuffix: true,
            })}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function VersionHistoryDrawer({
  open,
  onOpenChange,
  data,
  isLoading,
  selectedVersion,
  onSelectVersion,
  onApproveDraft,
  onDiscardDraft,
  isDraftActionPending,
}: VersionHistoryDrawerProps) {
  const draft = data?.versions.find((v) => v.status === 'draft');
  const nonDraftVersions = data?.versions.filter((v) => v.status !== 'draft') ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px] p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Version History</SheetTitle>
          <SheetDescription className="sr-only">
            Browse and restore previous versions of this story
          </SheetDescription>
        </SheetHeader>

        {/* Warning banner */}
        {data?.warning && (
          <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            {data.warning}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-neutral-400" />
            <span className="ml-2 text-sm text-neutral-500">Loading versions...</span>
          </div>
        ) : (
          <ScrollArea className="flex-1 overflow-auto">
            <div className="p-4 space-y-4">
              {/* Draft zone */}
              {draft && (
                <DraftZone
                  draft={draft}
                  selected={selectedVersion === draft.version_number}
                  onSelect={() => onSelectVersion(draft.version_number)}
                  onApprove={onApproveDraft}
                  onDiscard={onDiscardDraft}
                  isPending={isDraftActionPending}
                />
              )}

              {/* Version list */}
              <div className="space-y-1">
                {nonDraftVersions.map((version) => (
                  <VersionEntry
                    key={version.version_number}
                    version={version}
                    selected={selectedVersion === version.version_number}
                    onSelect={() => onSelectVersion(version.version_number)}
                  />
                ))}
              </div>

              {/* Load more */}
              {data && data.total > data.versions.length && (
                <div className="text-center pt-2">
                  <Button variant="ghost" size="sm">
                    Load more
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/VersionHistoryDrawer.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/VersionHistoryDrawer.tsx apps/web/src/components/VersionHistoryDrawer.test.tsx
git commit -m "feat(versioning): add VersionHistoryDrawer component with tests"
```

---

## Task 6: Create VersionPreviewBanner component

Banner shown above story content when previewing a non-active version. Contains version info, source badge, relative date, and a "Restore this version" button with AlertDialog confirmation.

**Files:**
- Create: `apps/web/src/components/VersionPreviewBanner.test.tsx`
- Create: `apps/web/src/components/VersionPreviewBanner.tsx`

**Step 1: Write the failing tests**

Create `apps/web/src/components/VersionPreviewBanner.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionPreviewBanner from './VersionPreviewBanner';

describe('VersionPreviewBanner', () => {
  const defaultProps = {
    versionNumber: 2,
    source: 'edit',
    createdAt: '2026-02-15T10:00:00Z',
    isActive: false,
    onRestore: vi.fn(),
    isRestoring: false,
  };

  it('renders version number', () => {
    render(<VersionPreviewBanner {...defaultProps} />);
    expect(screen.getByText(/viewing version 2/i)).toBeInTheDocument();
  });

  it('renders source badge', () => {
    render(<VersionPreviewBanner {...defaultProps} />);
    expect(screen.getByText(/manual edit/i)).toBeInTheDocument();
  });

  it('shows Restore button for non-active version', () => {
    render(<VersionPreviewBanner {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /restore this version/i })
    ).toBeInTheDocument();
  });

  it('hides Restore button for active version', () => {
    render(<VersionPreviewBanner {...defaultProps} isActive={true} />);
    expect(
      screen.queryByRole('button', { name: /restore this version/i })
    ).not.toBeInTheDocument();
  });

  it('shows confirmation dialog on Restore click, calls onRestore on confirm', async () => {
    const user = userEvent.setup();
    const handleRestore = vi.fn();
    render(
      <VersionPreviewBanner {...defaultProps} onRestore={handleRestore} />
    );

    await user.click(
      screen.getByRole('button', { name: /restore this version/i })
    );

    // Dialog should appear
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();

    // Click confirm
    await user.click(screen.getByRole('button', { name: /^restore$/i }));
    expect(handleRestore).toHaveBeenCalledOnce();
  });

  it('closes dialog on cancel without calling onRestore', async () => {
    const user = userEvent.setup();
    const handleRestore = vi.fn();
    render(
      <VersionPreviewBanner {...defaultProps} onRestore={handleRestore} />
    );

    await user.click(
      screen.getByRole('button', { name: /restore this version/i })
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(handleRestore).not.toHaveBeenCalled();
  });

  it('disables Restore button when isRestoring is true', () => {
    render(
      <VersionPreviewBanner {...defaultProps} isRestoring={true} />
    );
    expect(
      screen.getByRole('button', { name: /restoring/i })
    ).toBeDisabled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/VersionPreviewBanner.test.tsx`
Expected: FAIL — module `./VersionPreviewBanner` not found

**Step 3: Write the component**

Create `apps/web/src/components/VersionPreviewBanner.tsx`:

```typescript
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';

interface VersionPreviewBannerProps {
  versionNumber: number;
  source: string;
  createdAt: string;
  isActive: boolean;
  onRestore: () => void;
  isRestoring: boolean;
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'edit':
      return 'Manual edit';
    case 'ai_generate':
      return 'AI enhancement';
    case 'restoration':
      return 'Restoration';
    case 'creation':
      return 'Original';
    default:
      return source;
  }
}

export default function VersionPreviewBanner({
  versionNumber,
  source,
  createdAt,
  isActive,
  onRestore,
  isRestoring,
}: VersionPreviewBannerProps) {
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true });

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-blue-800">
            Viewing version {versionNumber}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {getSourceLabel(source)}
          </Badge>
          <span className="text-xs text-blue-600">{timeAgo}</span>
        </div>

        {!isActive && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={isRestoring}>
                {isRestoring ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1" />
                    Restoring...
                  </>
                ) : (
                  'Restore this version'
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will create a new version with the content from version{' '}
                  {versionNumber}. The current active version will be preserved in
                  the history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRestore}>
                  Restore
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/VersionPreviewBanner.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/VersionPreviewBanner.tsx apps/web/src/components/VersionPreviewBanner.test.tsx
git commit -m "feat(versioning): add VersionPreviewBanner with restore confirmation"
```

---

## Task 7: Integrate version history into StoryCreation — write failing test

Wire all three new components into `StoryCreation`. Add `isHistoryOpen` and `previewVersionNumber` state. Show VersionHistoryButton in header slot, render drawer as sibling, show preview banner when previewing, and swap content data source.

**Files:**
- Modify: `apps/web/src/components/StoryCreation.tsx`
- Create or extend: `apps/web/src/components/StoryCreation.test.tsx`

**Step 1: Write the failing integration test**

Create `apps/web/src/components/StoryCreation.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import StoryCreation from './StoryCreation';
import { HeaderProvider } from '@/components/header';

// Mock auth context
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'author@test.com', name: 'Author' },
  }),
}));

// Mock legacy hook
vi.mock('@/lib/hooks/useLegacies', () => ({
  useLegacy: () => ({
    data: { id: 'legacy-1', name: 'Test Legacy', members: [{ email: 'author@test.com', role: 'creator' }] },
    isLoading: false,
  }),
}));

// Mock story hook to return story with version_count
vi.mock('@/lib/hooks/useStories', () => ({
  useStory: () => ({
    data: {
      id: 'story-1',
      title: 'Test Story',
      content: 'Test content',
      visibility: 'private',
      author_id: 'user-1',
      author_name: 'Author',
      author_email: 'author@test.com',
      legacies: [{ legacy_id: 'legacy-1', legacy_name: 'Test Legacy', role: 'primary', position: 0 }],
      version_count: 3,
      has_draft: false,
      created_at: '2026-02-15T10:00:00Z',
      updated_at: '2026-02-16T10:00:00Z',
    },
    isLoading: false,
  }),
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

vi.mock('@/lib/hooks/useVersions', () => ({
  useVersions: () => ({
    data: mockVersionsData,
    isLoading: false,
  }),
  useVersionDetail: (storyId: string, versionNumber: number | null) => ({
    data: versionNumber === 2
      ? {
          version_number: 2,
          title: 'Old Title',
          content: 'Old content from version 2',
          status: 'inactive',
          source: 'edit',
          source_version: null,
          change_summary: 'Added middle section',
          stale: false,
          created_by: 'user-1',
          created_at: '2026-02-15T10:00:00Z',
        }
      : undefined,
    isLoading: false,
  }),
  useRestoreVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useApproveDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useDiscardDraft: () => ({ mutate: vi.fn(), isPending: false }),
  versionKeys: {
    all: ['versions'],
    list: (id: string) => ['versions', id, 'list'],
    detail: (id: string, n: number) => ['versions', id, 'detail', n],
  },
}));

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
          HeaderProvider,
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
  it('shows History button when version_count > 1', () => {
    renderStoryCreation();
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  });

  it('opens drawer when History button is clicked', async () => {
    const user = userEvent.setup();
    renderStoryCreation();

    await user.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByText('Version History')).toBeInTheDocument();
    });
  });

  it('shows preview banner when a non-active version is selected', async () => {
    const user = userEvent.setup();
    renderStoryCreation();

    // Open drawer
    await user.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => {
      expect(screen.getByText('Version History')).toBeInTheDocument();
    });

    // Click version 2 (inactive)
    await user.click(screen.getByText('v2'));

    await waitFor(() => {
      expect(screen.getByText(/viewing version 2/i)).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/StoryCreation.test.tsx`
Expected: FAIL — StoryCreation doesn't render History button yet

**Step 3: Modify StoryCreation to integrate version history**

In `apps/web/src/components/StoryCreation.tsx`, make the following changes:

**3a. Add imports** (after existing imports, around line 14):

```typescript
import { Clock } from 'lucide-react';
import VersionHistoryButton from './VersionHistoryButton';
import VersionHistoryDrawer from './VersionHistoryDrawer';
import VersionPreviewBanner from './VersionPreviewBanner';
import {
  useVersions,
  useVersionDetail,
  useRestoreVersion,
  useApproveDraft,
  useDiscardDraft,
} from '@/lib/hooks/useVersions';
```

**3b. Add state variables** (after existing state declarations, around line 39):

```typescript
const [isHistoryOpen, setIsHistoryOpen] = useState(false);
const [previewVersionNumber, setPreviewVersionNumber] = useState<number | null>(null);
```

**3c. Add version hooks** (after existing hook calls, around line 44):

```typescript
// Version history (only fetch when drawer is open)
const isAuthor = !!(existingStory && user && existingStory.author_email === user.email);
const showHistory = isAuthor && (existingStory?.version_count ?? 0) > 1;
const versionsQuery = useVersions(storyId ?? '', isHistoryOpen && !!storyId);
const versionDetailQuery = useVersionDetail(storyId ?? '', previewVersionNumber);
const restoreVersion = useRestoreVersion(storyId ?? '');
const approveDraftMutation = useApproveDraft(storyId ?? '');
const discardDraftMutation = useDiscardDraft(storyId ?? '');
```

**3d. Add preview data logic** (after the hooks):

```typescript
// When previewing a version, use its content instead of the story's
const previewData = versionDetailQuery.data;
const displayTitle = previewData ? previewData.title : title;
const displayContent = previewData ? previewData.content : content;
const isPreviewing = previewVersionNumber !== null && previewData !== undefined;
const isPreviewActive = previewData?.status === 'active';
```

**3e. Add handlers** (near the other handlers, after handleCancelEdit):

```typescript
const handleSelectVersion = (versionNumber: number) => {
  setPreviewVersionNumber(versionNumber);
};

const handleRestore = () => {
  if (previewVersionNumber === null) return;
  restoreVersion.mutate(previewVersionNumber, {
    onSuccess: () => {
      setPreviewVersionNumber(null);
    },
  });
};

const handleApproveDraft = () => {
  approveDraftMutation.mutate(undefined, {
    onSuccess: () => {
      setPreviewVersionNumber(null);
    },
  });
};

const handleDiscardDraft = () => {
  discardDraftMutation.mutate(undefined, {
    onSuccess: () => {
      setPreviewVersionNumber(null);
    },
  });
};
```

**3f. Add VersionHistoryButton to the header slot** (inside the HeaderSlot, in the view mode branch, after the Edit Story button — around line 249):

```typescript
{isViewMode && isEditMode ? (
  <>
    {canEdit && (
      <Button size="sm" className="gap-2" onClick={handleEditClick}>
        <Pencil className="size-4" />
        Edit Story
      </Button>
    )}
    {showHistory && (
      <VersionHistoryButton
        versionCount={existingStory?.version_count ?? null}
        onClick={() => setIsHistoryOpen(true)}
      />
    )}
  </>
) : (
  // ... existing edit mode buttons unchanged
)}
```

**3g. Add VersionPreviewBanner** (in the view mode content area, before the story header, around line 294):

```typescript
{isViewMode && isEditMode ? (
  <div className="space-y-8">
    {/* Version Preview Banner */}
    {isPreviewing && previewData && (
      <VersionPreviewBanner
        versionNumber={previewData.version_number}
        source={previewData.source}
        createdAt={previewData.created_at}
        isActive={isPreviewActive}
        onRestore={handleRestore}
        isRestoring={restoreVersion.isPending}
      />
    )}

    {/* Story Header */}
    {/* ... existing header code, unchanged ... */}
```

**3h. Swap content rendering** to use `displayTitle` and `displayContent` instead of `title` and `content` in the read-only view (around lines 320 and 327-328):

Replace:
```typescript
<h1 className="text-3xl font-semibold text-neutral-900">{title}</h1>
```
With:
```typescript
<h1 className="text-3xl font-semibold text-neutral-900">{displayTitle}</h1>
```

Replace:
```typescript
<div className="whitespace-pre-wrap text-neutral-800 leading-relaxed">
  {content}
</div>
```
With:
```typescript
<div className="whitespace-pre-wrap text-neutral-800 leading-relaxed">
  {displayContent}
</div>
```

**3i. Add VersionHistoryDrawer** as a sibling of the main content (just before the closing `</div>` of the outer wrapper, around line 422):

```typescript
      </main>

      {/* Version History Drawer */}
      {showHistory && storyId && (
        <VersionHistoryDrawer
          open={isHistoryOpen}
          onOpenChange={(open) => {
            setIsHistoryOpen(open);
            if (!open) setPreviewVersionNumber(null);
          }}
          data={versionsQuery.data}
          isLoading={versionsQuery.isLoading}
          selectedVersion={previewVersionNumber}
          onSelectVersion={handleSelectVersion}
          onApproveDraft={handleApproveDraft}
          onDiscardDraft={handleDiscardDraft}
          isDraftActionPending={
            approveDraftMutation.isPending || discardDraftMutation.isPending
          }
        />
      )}
    </div>
  );
}
```

**Step 4: Run integration tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/StoryCreation.test.tsx`
Expected: PASS

**Step 5: Run all tests to check nothing is broken**

Run: `cd apps/web && npx vitest run`
Expected: All tests PASS

**Step 6: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/web/src/components/StoryCreation.tsx apps/web/src/components/StoryCreation.test.tsx
git commit -m "feat(versioning): integrate version history UI into StoryCreation"
```

---

## Task 8: Manual smoke test with dev server

Verify the feature works end-to-end with the actual backend.

**Files:** None (manual verification only)

**Step 1: Start the development environment**

Run: `docker compose -f infra/compose/docker-compose.yml up -d`

**Step 2: Start the frontend dev server**

Run: `cd apps/web && npm run dev`

**Step 3: Test the feature**

1. Log in as a user who has authored a story with multiple versions
2. Navigate to that story's view mode
3. Verify the History button appears in the header
4. Click History — verify the drawer opens showing version timeline
5. Click an older version — verify the preview banner appears and content swaps
6. Click "Restore this version" — verify the confirmation dialog appears
7. Cancel the dialog — verify nothing changes
8. Confirm restore — verify the new version appears at top of drawer and content updates
9. Close the drawer — verify the preview clears and active content shows
10. If the story has a draft, verify the draft zone appears with Approve/Discard buttons

**Step 4: Commit (if any fixes were needed)**

```bash
git add -u
git commit -m "fix(versioning): address smoke test findings"
```

---

## Summary

| Task | Component | Files | Estimated Steps |
|------|-----------|-------|-----------------|
| 1 | StoryDetail type update | 1 modified | 3 |
| 2 | Version API types + client | 1 created | 3 |
| 3 | Version query hooks | 2 created | 5 |
| 4 | VersionHistoryButton | 2 created | 5 |
| 5 | VersionHistoryDrawer | 2 created | 5 |
| 6 | VersionPreviewBanner | 2 created | 5 |
| 7 | StoryCreation integration | 1 modified, 1 created | 7 |
| 8 | Manual smoke test | 0 | 4 |

**Total new files:** 7 (3 components, 3 test files, 1 API client)
**Total modified files:** 2 (`stories.ts` type, `StoryCreation.tsx`)
