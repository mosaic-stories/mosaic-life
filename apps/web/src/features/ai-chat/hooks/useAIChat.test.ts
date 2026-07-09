import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { useAIChat } from './useAIChat';
import { useAIChatStore } from '@/features/ai-chat/store/aiChatStore';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const LEGACY_ID = 'legacy-1';
const PERSONA_ID = 'biographer';
const CONVERSATION_ID = 'conv-lazy-1';

describe('useAIChat lazy mode (autoCreate: false)', () => {
  beforeEach(() => {
    useAIChatStore.getState().reset();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('does not fetch or create a conversation on mount when no conversationId is provided', async () => {
    let getMessagesCalls = 0;
    server.use(
      http.get(`/api/ai/conversations/${CONVERSATION_ID}/messages`, () => {
        getMessagesCalls += 1;
        return HttpResponse.json({ messages: [], total: 0, has_more: false });
      }),
    );

    renderHook(
      () =>
        useAIChat({
          legacyId: LEGACY_ID,
          personaId: PERSONA_ID,
          conversationId: null,
          autoCreate: false,
          ensureConversationId: async () => CONVERSATION_ID,
        }),
      { wrapper: createWrapper() },
    );

    // Give any stray effects a chance to fire, then confirm nothing did.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getMessagesCalls).toBe(0);
  });

  it('preserves the persona opening message loaded via ensureConversationId when sending the first message', async () => {
    server.use(
      http.get(`/api/ai/conversations/${CONVERSATION_ID}/messages`, () => {
        return HttpResponse.json({
          messages: [
            {
              id: 'opening-msg',
              conversation_id: CONVERSATION_ID,
              role: 'assistant',
              content: "Hi! Let's talk about your story.",
              token_count: null,
              created_at: '2026-01-01T00:00:00Z',
              blocked: false,
            },
          ],
          total: 1,
          has_more: false,
        });
      }),
      http.post(`/api/ai/conversations/${CONVERSATION_ID}/messages`, () => {
        // Empty SSE stream — the test only cares about state before this
        // resolves, not the streamed reply itself.
        return new HttpResponse('', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );

    const { result } = renderHook(
      () =>
        useAIChat({
          legacyId: LEGACY_ID,
          personaId: PERSONA_ID,
          conversationId: null,
          autoCreate: false,
          ensureConversationId: async () => CONVERSATION_ID,
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      await result.current.sendMessage('Tell me about the trip.');
    });

    await waitFor(() => {
      const messages = useAIChatStore.getState().getActiveMessages();
      // The preloaded opening message must survive, with the user's new
      // message (and assistant placeholder) appended after it — not
      // silently dropped by the lazy-conversation hydration path.
      expect(messages.map((m) => m.id)).toContain('opening-msg');
      expect(messages.some((m) => m.role === 'user' && m.content === 'Tell me about the trip.')).toBe(true);
    });
  });
});
