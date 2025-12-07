/**
 * Custom hook for AI chat functionality.
 * Combines Zustand store with API calls and SSE streaming.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createConversation,
  getMessages,
  getPersonas,
  streamMessage,
} from '@/lib/api/ai';
import { useAIChatStore, type ChatMessage } from '@/stores/aiChatStore';

// Query keys
export const aiChatKeys = {
  all: ['ai-chat'] as const,
  personas: () => [...aiChatKeys.all, 'personas'] as const,
  conversations: () => [...aiChatKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...aiChatKeys.conversations(), id] as const,
  messages: (conversationId: string) =>
    [...aiChatKeys.conversation(conversationId), 'messages'] as const,
};

interface UseAIChatOptions {
  legacyId: string;
  personaId: string;
}

interface UseAIChatReturn {
  // State
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  conversationId: string | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for personas list.
 */
export function usePersonas() {
  return useQuery({
    queryKey: aiChatKeys.personas(),
    queryFn: getPersonas,
    staleTime: 1000 * 60 * 60, // 1 hour - personas don't change often
  });
}

/**
 * Main hook for AI chat functionality.
 */
export function useAIChat({
  legacyId,
  personaId,
}: UseAIChatOptions): UseAIChatReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);

  const {
    activeConversationId,
    isStreaming,
    error,
    getActiveMessages,
    setActiveConversation,
    setConversation,
    setMessages,
    addMessage,
    updateLastMessage,
    appendToLastMessage,
    setStreaming,
    setError,
    setConversationLoading,
    getActiveConversation,
  } = useAIChatStore();

  const conversationState = getActiveConversation();
  const messages = getActiveMessages();
  const isLoading = conversationState?.isLoading || false;

  // Initialize conversation
  useEffect(() => {
    let mounted = true;

    async function initConversation() {
      // Generate a stable key for this legacy/persona combination
      const key = `${legacyId}-${personaId}`;

      setConversationLoading(key, true);
      setActiveConversation(key);

      try {
        // Create or get existing conversation
        const conversation = await createConversation({
          legacy_id: legacyId,
          persona_id: personaId,
        });

        if (!mounted) return;

        setConversation(conversation.id, conversation);
        setActiveConversation(conversation.id);

        // Load existing messages
        const { messages: existingMessages } = await getMessages(conversation.id);

        if (!mounted) return;

        setMessages(conversation.id, existingMessages);
        setConversationLoading(conversation.id, false);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to initialize conversation:', err);
        setError('Failed to start conversation. Please try again.');
        setConversationLoading(key, false);
      }
    }

    initConversation();

    return () => {
      mounted = false;
      // Cancel any in-flight stream
      abortControllerRef.current?.abort();
    };
  }, [legacyId, personaId, setActiveConversation, setConversation, setMessages, setConversationLoading, setError]);

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeConversationId || isStreaming) return;

      const conversationId = activeConversationId;
      lastUserMessageRef.current = content;
      setError(null);

      // Add user message to UI immediately
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content,
        token_count: null,
        created_at: new Date().toISOString(),
        status: 'complete',
      };
      addMessage(conversationId, userMessage);

      // Add placeholder for assistant response
      const assistantMessage: ChatMessage = {
        id: `temp-assistant-${Date.now()}`,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        token_count: null,
        created_at: new Date().toISOString(),
        status: 'streaming',
      };
      addMessage(conversationId, assistantMessage);

      setStreaming(true);

      // Start streaming
      abortControllerRef.current = streamMessage(
        conversationId,
        content,
        // onChunk
        (chunk) => {
          appendToLastMessage(conversationId, chunk);
        },
        // onDone
        (messageId, tokenCount) => {
          updateLastMessage(conversationId, {
            id: messageId,
            token_count: tokenCount,
            status: 'complete',
          });
          setStreaming(false);
          lastUserMessageRef.current = null;
        },
        // onError
        (message) => {
          updateLastMessage(conversationId, {
            status: 'error',
            error: message,
          });
          setStreaming(false);
          setError(message);
        }
      );
    },
    [activeConversationId, isStreaming, addMessage, appendToLastMessage, updateLastMessage, setStreaming, setError]
  );

  // Retry last message
  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessageRef.current || !activeConversationId) return;

    // Remove the failed assistant message
    const currentMessages = getActiveMessages();
    if (currentMessages.length > 0) {
      const lastMessage = currentMessages[currentMessages.length - 1];
      if (lastMessage.status === 'error' && lastMessage.role === 'assistant') {
        // Remove last two messages (user + failed assistant)
        const trimmedMessages = currentMessages.slice(0, -2);
        setMessages(activeConversationId, trimmedMessages);
      }
    }

    // Resend
    await sendMessage(lastUserMessageRef.current);
  }, [activeConversationId, getActiveMessages, setMessages, sendMessage]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    conversationId: activeConversationId,
    sendMessage,
    retryLastMessage,
    clearError,
  };
}
