import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { useEnsureEvolveSession } from './useEnsureEvolveSession';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const STORY_ID = 'story-1';
const LEGACY_ID = 'legacy-1';

describe('useEnsureEvolveSession', () => {
  let startEvolutionCalls = 0;
  let createConversationCalls = 0;

  beforeEach(() => {
    useEvolveWorkspaceStore.getState().reset();
    startEvolutionCalls = 0;
    createConversationCalls = 0;
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('creates a session and conversation when none exists yet', async () => {
    server.use(
      http.get(`/api/stories/${STORY_ID}/evolution/active`, () => {
        return HttpResponse.json({ detail: 'No active evolution session' }, { status: 404 });
      }),
      http.post(`/api/stories/${STORY_ID}/evolution`, async ({ request }) => {
        startEvolutionCalls += 1;
        const body = (await request.json()) as { persona_id: string; trigger?: string };
        expect(body.trigger).toBe('chat');
        return HttpResponse.json({
          id: 'session-1',
          story_id: STORY_ID,
          base_version_number: 1,
          conversation_id: 'conv-from-session',
          persona_id: 'biographer',
          draft_version_id: null,
          phase: 'elicitation',
          summary_text: null,
          writing_style: null,
          length_preference: null,
          revision_count: 0,
          created_by: 'user-1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        });
      }),
    );

    const { result } = renderHook(() => useEnsureEvolveSession(STORY_ID, LEGACY_ID), {
      wrapper: createWrapper(),
    });

    let ensured: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      ensured = await result.current('chat');
    });

    expect(startEvolutionCalls).toBe(1);
    expect(ensured?.conversationId).toBe('conv-from-session');
    expect(ensured?.session.id).toBe('session-1');

    await waitFor(() => {
      const state = useEvolveWorkspaceStore.getState();
      expect(state.conversationIds[state.activePersonaId]).toBe('conv-from-session');
    });
  });

  it('reuses an existing session and conversation without creating new ones', async () => {
    useEvolveWorkspaceStore.getState().setConversationForPersona('biographer', 'existing-conv');

    server.use(
      http.get(`/api/stories/${STORY_ID}/evolution/active`, () => {
        return HttpResponse.json({
          id: 'session-existing',
          story_id: STORY_ID,
          base_version_number: 1,
          conversation_id: 'existing-conv',
          persona_id: 'biographer',
          draft_version_id: null,
          phase: 'elicitation',
          summary_text: null,
          writing_style: null,
          length_preference: null,
          revision_count: 0,
          created_by: 'user-1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        });
      }),
      http.post(`/api/stories/${STORY_ID}/evolution`, () => {
        startEvolutionCalls += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
      http.post('/api/ai/conversations/new', () => {
        createConversationCalls += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useEnsureEvolveSession(STORY_ID, LEGACY_ID), {
      wrapper: createWrapper(),
    });

    let ensured: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      ensured = await result.current('rewrite');
    });

    expect(startEvolutionCalls).toBe(0);
    expect(createConversationCalls).toBe(0);
    expect(ensured?.session.id).toBe('session-existing');
    expect(ensured?.conversationId).toBe('existing-conv');
  });

  it('reuses the session\'s canonical conversation after a refresh clears the local store, without creating a duplicate', async () => {
    // Simulate a page refresh: the session already exists server-side, but
    // the in-memory persona->conversation map is empty (store was reset).
    server.use(
      http.get(`/api/stories/${STORY_ID}/evolution/active`, () => {
        return HttpResponse.json({
          id: 'session-existing',
          story_id: STORY_ID,
          base_version_number: 1,
          conversation_id: 'session-canonical-conv',
          persona_id: 'biographer',
          draft_version_id: null,
          phase: 'elicitation',
          summary_text: null,
          writing_style: null,
          length_preference: null,
          revision_count: 0,
          created_by: 'user-1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        });
      }),
      http.post('/api/ai/conversations/new', () => {
        createConversationCalls += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useEnsureEvolveSession(STORY_ID, LEGACY_ID), {
      wrapper: createWrapper(),
    });

    let ensured: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      ensured = await result.current('chat');
    });

    expect(createConversationCalls).toBe(0);
    expect(ensured?.conversationId).toBe('session-canonical-conv');

    await waitFor(() => {
      const state = useEvolveWorkspaceStore.getState();
      expect(state.conversationIds['biographer']).toBe('session-canonical-conv');
    });
  });

  it('creates a conversation for a second persona when a session already exists', async () => {
    useEvolveWorkspaceStore.getState().setActivePersona('friend');

    server.use(
      http.get(`/api/stories/${STORY_ID}/evolution/active`, () => {
        return HttpResponse.json({
          id: 'session-existing',
          story_id: STORY_ID,
          base_version_number: 1,
          conversation_id: 'biographer-conv',
          persona_id: 'biographer',
          draft_version_id: null,
          phase: 'elicitation',
          summary_text: null,
          writing_style: null,
          length_preference: null,
          revision_count: 0,
          created_by: 'user-1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        });
      }),
      http.post('/api/ai/conversations/new', async ({ request }) => {
        createConversationCalls += 1;
        const body = (await request.json()) as { persona_id: string };
        expect(body.persona_id).toBe('friend');
        return HttpResponse.json({ id: 'friend-conv' });
      }),
    );

    const { result } = renderHook(() => useEnsureEvolveSession(STORY_ID, LEGACY_ID), {
      wrapper: createWrapper(),
    });

    let ensured: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      ensured = await result.current('chat');
    });

    expect(createConversationCalls).toBe(1);
    expect(ensured?.conversationId).toBe('friend-conv');
  });

  it('memoizes concurrent calls into a single in-flight request', async () => {
    server.use(
      http.get(`/api/stories/${STORY_ID}/evolution/active`, () => {
        return HttpResponse.json({ detail: 'No active evolution session' }, { status: 404 });
      }),
      http.post(`/api/stories/${STORY_ID}/evolution`, () => {
        startEvolutionCalls += 1;
        return HttpResponse.json({
          id: 'session-1',
          story_id: STORY_ID,
          base_version_number: 1,
          conversation_id: 'conv-1',
          persona_id: 'biographer',
          draft_version_id: null,
          phase: 'elicitation',
          summary_text: null,
          writing_style: null,
          length_preference: null,
          revision_count: 0,
          created_by: 'user-1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        });
      }),
    );

    const { result } = renderHook(() => useEnsureEvolveSession(STORY_ID, LEGACY_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await Promise.all([result.current('chat'), result.current('chat')]);
    });

    expect(startEvolutionCalls).toBe(1);
  });
});
