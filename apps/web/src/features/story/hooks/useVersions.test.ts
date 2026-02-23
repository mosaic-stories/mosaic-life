import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { versionKeys, useVersions, useVersionDetail } from './useVersions';
import type { VersionListResponse, VersionDetail } from '@/features/story/api/versions';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const mockVersionsResponse: VersionListResponse = {
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

const mockVersionDetail: VersionDetail = {
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

describe('versionKeys', () => {
  it('generates correct key hierarchy', () => {
    expect(versionKeys.all).toEqual(['versions']);
    expect(versionKeys.list('story-1')).toEqual(['versions', 'story-1', 'list']);
    expect(versionKeys.detail('story-1', 3)).toEqual(['versions', 'story-1', 'detail', 3]);
  });
});

describe('useVersions', () => {
  beforeEach(() => {
    // Override default handler with test-specific data
    server.use(
      http.get('/api/stories/:storyId/versions', () => {
        return HttpResponse.json(mockVersionsResponse);
      })
    );
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(() => useVersions('story-1', false), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
  });

  it('fetches versions when enabled', async () => {
    const { result } = renderHook(() => useVersions('story-1', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockVersionsResponse);
  });
});

describe('useVersionDetail', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/stories/:storyId/versions/:versionNumber', () => {
        return HttpResponse.json(mockVersionDetail);
      })
    );
  });

  it('does not fetch when versionNumber is null', () => {
    const { result } = renderHook(() => useVersionDetail('story-1', null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
  });

  it('fetches version detail when versionNumber is provided', async () => {
    const { result } = renderHook(() => useVersionDetail('story-1', 1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockVersionDetail);
  });
});
