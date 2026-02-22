/**
 * Zustand store for AI chat state management.
 */

import { create } from 'zustand';
import type { Message, Conversation } from '@/features/ai-chat/api/ai';

export interface ChatMessage extends Message {
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  error?: string;
}

export interface ConversationState {
  conversation: Conversation | null;
  messages: ChatMessage[];
  isLoading: boolean;
}

interface AIChatState {
  // State
  conversations: Map<string, ConversationState>;
  activeConversationId: string | null;
  isStreaming: boolean;
  error: string | null;

  // Getters
  getActiveConversation: () => ConversationState | null;
  getActiveMessages: () => ChatMessage[];

  // Actions
  setActiveConversation: (id: string | null) => void;
  setConversation: (id: string, conversation: Conversation) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateLastMessage: (conversationId: string, update: Partial<ChatMessage>) => void;
  appendToLastMessage: (conversationId: string, chunk: string) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  setConversationLoading: (conversationId: string, loading: boolean) => void;
  clearConversation: (conversationId: string) => void;
  reset: () => void;
}

const initialState = {
  conversations: new Map<string, ConversationState>(),
  activeConversationId: null,
  isStreaming: false,
  error: null,
};

export const useAIChatStore = create<AIChatState>((set, get) => ({
  ...initialState,

  // Getters
  getActiveConversation: () => {
    const { conversations, activeConversationId } = get();
    if (!activeConversationId) return null;
    return conversations.get(activeConversationId) || null;
  },

  getActiveMessages: () => {
    const state = get().getActiveConversation();
    return state?.messages || [];
  },

  // Actions
  setActiveConversation: (id) => {
    set({ activeConversationId: id, error: null });
  },

  setConversation: (id, conversation) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(id);
      conversations.set(id, {
        conversation,
        messages: existing?.messages || [],
        isLoading: existing?.isLoading || false,
      });
      return { conversations };
    });
  },

  setMessages: (conversationId, messages) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing) {
        conversations.set(conversationId, {
          ...existing,
          messages: messages.map((m) => ({ ...m, status: 'complete' as const })),
        });
      }
      return { conversations };
    });
  },

  addMessage: (conversationId, message) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing) {
        conversations.set(conversationId, {
          ...existing,
          messages: [...existing.messages, message],
        });
      }
      return { conversations };
    });
  },

  updateLastMessage: (conversationId, update) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing && existing.messages.length > 0) {
        const messages = [...existing.messages];
        const lastIdx = messages.length - 1;
        messages[lastIdx] = { ...messages[lastIdx], ...update };
        conversations.set(conversationId, { ...existing, messages });
      }
      return { conversations };
    });
  },

  appendToLastMessage: (conversationId, chunk) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing && existing.messages.length > 0) {
        const messages = [...existing.messages];
        const lastIdx = messages.length - 1;
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: messages[lastIdx].content + chunk,
        };
        conversations.set(conversationId, { ...existing, messages });
      }
      return { conversations };
    });
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming });
  },

  setError: (error) => {
    set({ error });
  },

  setConversationLoading: (conversationId, loading) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(conversationId);
      if (existing) {
        conversations.set(conversationId, { ...existing, isLoading: loading });
      } else {
        conversations.set(conversationId, {
          conversation: null,
          messages: [],
          isLoading: loading,
        });
      }
      return { conversations };
    });
  },

  clearConversation: (conversationId) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      conversations.delete(conversationId);
      return {
        conversations,
        activeConversationId:
          state.activeConversationId === conversationId
            ? null
            : state.activeConversationId,
      };
    });
  },

  reset: () => {
    set(initialState);
  },
}));
