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
