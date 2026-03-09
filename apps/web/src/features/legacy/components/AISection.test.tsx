import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useAIChat: vi.fn(),
  usePersonas: vi.fn(),
  useConversationList: vi.fn(),
  useDeleteConversation: vi.fn(),
  streamPromptSeed: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/features/ai-chat/hooks/useAIChat', () => ({
  useAIChat: mocks.useAIChat,
  usePersonas: mocks.usePersonas,
  useConversationList: mocks.useConversationList,
  useDeleteConversation: mocks.useDeleteConversation,
}));

vi.mock('@/hooks/usePrevious', () => ({
  usePrevious: () => false,
}));

vi.mock('@/features/ai-chat/store/aiChatStore', () => ({
  useAIChatStore: (selector: (state: {
    evolveSuggestions: Map<string, string>;
    dismissEvolveSuggestion: () => void;
    activeConversationId: string | null;
    addMessage: () => void;
    appendToLastMessage: () => void;
    updateLastMessage: () => void;
    setStreaming: () => void;
    setError: () => void;
  }) => unknown) => selector({
    evolveSuggestions: new Map(),
    dismissEvolveSuggestion: vi.fn(),
    activeConversationId: 'conv-123',
    addMessage: vi.fn(),
    appendToLastMessage: vi.fn(),
    updateLastMessage: vi.fn(),
    setStreaming: vi.fn(),
    setError: vi.fn(),
  }),
}));

vi.mock('@/features/ai-chat/components/MessageList', () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

vi.mock('@/features/ai-chat/components/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock('@/features/ai-chat/components/ConversationHistoryPopover', () => ({
  ConversationHistoryPopover: () => <div data-testid="history" />,
}));

vi.mock('@/features/ai-chat/components/PersonaIcon', () => ({
  PersonaIcon: () => <div data-testid="persona-icon" />,
}));

vi.mock('@/features/ai-chat/components/utils', () => ({
  getPersonaColor: () => 'amber',
}));

vi.mock('@/features/ai-chat/api/ai', () => ({
  evolveConversation: vi.fn(),
}));

vi.mock('@/features/ai-chat/api/seedPrompt', () => ({
  streamPromptSeed: mocks.streamPromptSeed,
}));

import AISection from './AISection';

describe('AISection routed conversation handoff', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.streamPromptSeed.mockReset();
    mocks.streamPromptSeed.mockReturnValue({ abort: vi.fn() });
    mocks.usePersonas.mockReturnValue({
      data: [
        { id: 'biographer', name: 'Biographer' },
        { id: 'friend', name: 'Friend' },
      ],
      isLoading: false,
      error: null,
    });
    mocks.useConversationList.mockReturnValue({ data: [] });
    mocks.useDeleteConversation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useAIChat.mockReturnValue({
      messages: [],
      isLoading: false,
      isStreaming: false,
      error: null,
      sendMessage: vi.fn(),
      retryLastMessage: vi.fn(),
      clearError: vi.fn(),
      startNewConversation: vi.fn(),
    });
  });

  it('keeps the routed conversation selected after mount', async () => {
    render(
      <MemoryRouter>
        <AISection legacyId="legacy-1" initialConversationId="conv-123" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.useAIChat).toHaveBeenLastCalledWith(
        expect.objectContaining({
          legacyId: 'legacy-1',
          personaId: 'biographer',
          conversationId: 'conv-123',
        }),
      );
    });
  });

  it('requests the first assistant reply for a story-prompt conversation once the user prompt loads', async () => {
    mocks.useAIChat.mockReturnValue({
      messages: [
        {
          id: 'msg-1',
          conversation_id: 'conv-123',
          role: 'user',
          content: 'Tell me about Karen and cooking.',
          token_count: null,
          created_at: new Date().toISOString(),
          blocked: false,
          status: 'complete',
        },
      ],
      isLoading: false,
      isStreaming: false,
      error: null,
      sendMessage: vi.fn(),
      retryLastMessage: vi.fn(),
      clearError: vi.fn(),
      startNewConversation: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AISection
          legacyId="legacy-1"
          initialConversationId="conv-123"
          initialSeedMode="story_prompt"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.streamPromptSeed).toHaveBeenCalledTimes(1);
      expect(mocks.streamPromptSeed).toHaveBeenCalledWith(
        'conv-123',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
      );
    });
  });
});