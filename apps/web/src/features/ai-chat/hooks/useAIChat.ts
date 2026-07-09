/**
 * Custom hook for AI chat functionality.
 * Combines Zustand store with API calls and SSE streaming.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  createConversation,
  createNewConversation,
  deleteConversation,
  getMessages,
  getPersonas,
  listConversations,
  streamMessage,
} from '@/features/ai-chat/api/ai';
import { useAIChatStore, type ChatMessage } from '@/features/ai-chat/store/aiChatStore';

// Query keys
export const aiChatKeys = {
  all: ['ai-chat'] as const,
  personas: () => [...aiChatKeys.all, 'personas'] as const,
  conversations: () => [...aiChatKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...aiChatKeys.conversations(), id] as const,
  messages: (conversationId: string) =>
    [...aiChatKeys.conversation(conversationId), 'messages'] as const,
  conversationList: (legacyId: string, personaId: string) =>
    [...aiChatKeys.all, 'list', legacyId, personaId] as const,
};

interface UseAIChatOptions {
  legacyId: string;
  personaId: string;
  conversationId?: string | null;
  /**
   * When false, no conversation is created (or loaded via get-or-create)
   * until `sendMessage` is called and no conversationId is available yet —
   * at which point `ensureConversationId` (if provided) is awaited to
   * obtain one. Defaults to true (auto-create on mount).
   */
  autoCreate?: boolean;
  ensureConversationId?: () => Promise<string>;
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
  startNewConversation: () => Promise<string>;
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
 * Hook for conversation list.
 */
export function useConversationList(legacyId: string, personaId: string) {
  return useQuery({
    queryKey: aiChatKeys.conversationList(legacyId, personaId),
    queryFn: () => listConversations(legacyId, personaId, 10),
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Hook for deleting a conversation.
 */
export function useDeleteConversation(legacyId: string, personaId: string) {
  const queryClient = useQueryClient();
  const { clearConversation, activeConversationId, setActiveConversation } = useAIChatStore();

  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: (_data, conversationId) => {
      // Clear from Zustand store
      clearConversation(conversationId);

      // If the deleted conversation was active, clear the active conversation
      if (activeConversationId === conversationId) {
        setActiveConversation(null);
      }

      // Invalidate the conversation list to refresh UI
      queryClient.invalidateQueries({
        queryKey: aiChatKeys.conversationList(legacyId, personaId),
      });
    },
  });
}

/**
 * Main hook for AI chat functionality.
 */
export function useAIChat({
  legacyId,
  personaId,
  conversationId,
  autoCreate = true,
  ensureConversationId,
}: UseAIChatOptions): UseAIChatReturn {
  const queryClient = useQueryClient();
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
    setEvolveSuggestion,
  } = useAIChatStore();

  const conversationState = getActiveConversation();
  const messages = getActiveMessages();
  const isLoading = conversationState?.isLoading || false;

  // Initialize conversation
  useEffect(() => {
    // Lazy mode: no conversation yet and we're not allowed to auto-create
    // one — wait for sendMessage to ensure one via ensureConversationId.
    if (!conversationId && !autoCreate) return;

    let mounted = true;

    async function initConversation() {
      // If a specific conversationId is provided, load it directly
      if (conversationId) {
        setConversationLoading(conversationId, true);
        setActiveConversation(conversationId);

        try {
          const { messages: existingMessages } = await getMessages(conversationId);
          if (!mounted) return;

          setMessages(conversationId, existingMessages);
          setConversationLoading(conversationId, false);
        } catch (err) {
          if (!mounted) return;
          console.error('Failed to load conversation:', err);
          setError('Failed to load conversation. Please try again.');
          setConversationLoading(conversationId, false);
        }
        return;
      }

      // Otherwise, use existing get_or_create behavior
      // Generate a stable key for this legacy/persona combination
      const key = `${legacyId}-${personaId}`;

      setConversationLoading(key, true);
      setActiveConversation(key);

      try {
        // Create or get existing conversation
        const conversation = await createConversation({
          persona_id: personaId,
          legacies: [
            {
              legacy_id: legacyId,
              role: 'primary',
              position: 0,
            },
          ],
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
  }, [legacyId, personaId, conversationId, autoCreate, setActiveConversation, setConversation, setMessages, setConversationLoading, setError]);

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      let conversationId = activeConversationId;
      if (!conversationId) {
        if (!ensureConversationId) return;
        try {
          conversationId = await ensureConversationId();
        } catch (err) {
          console.error('Failed to ensure conversation:', err);
          setError('Failed to start conversation. Please try again.');
          return;
        }
        // Create the store entry for this conversation before loading
        // messages into it — setMessages() is a no-op when no entry
        // exists yet, and setActiveConversation() alone doesn't create one.
        setConversationLoading(conversationId, true);
        setActiveConversation(conversationId);
        try {
          // Load any server-generated messages already in the new
          // conversation (e.g. the persona's opening message) before
          // appending the user's own message below.
          const { messages: existingMessages } = await getMessages(conversationId);
          setMessages(conversationId, existingMessages);
        } catch (err) {
          console.error('Failed to load conversation messages:', err);
        }
        setConversationLoading(conversationId, false);
      }

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
        blocked: false,
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
        blocked: false,
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
        },
        // onEvolveSuggestion
        (reason) => {
          setEvolveSuggestion(conversationId, reason);
        }
      );
    },
    [
      activeConversationId,
      isStreaming,
      ensureConversationId,
      addMessage,
      appendToLastMessage,
      updateLastMessage,
      setStreaming,
      setError,
      setEvolveSuggestion,
      setActiveConversation,
      setConversationLoading,
      setMessages,
    ]
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

  // Start new conversation
  const startNewConversation = useCallback(async () => {
    const conversation = await createNewConversation({
      persona_id: personaId,
      legacies: [
        {
          legacy_id: legacyId,
          role: 'primary',
          position: 0,
        },
      ],
    });
    setConversation(conversation.id, conversation);
    setActiveConversation(conversation.id);
    // Clear messages for this new conversation
    setMessages(conversation.id, []);
    // Invalidate the conversation list to show the new conversation
    queryClient.invalidateQueries({
      queryKey: aiChatKeys.conversationList(legacyId, personaId),
    });
    // Return the new conversation ID so the component can update its state
    return conversation.id;
  }, [legacyId, personaId, setConversation, setActiveConversation, setMessages, queryClient]);

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    conversationId: activeConversationId,
    sendMessage,
    retryLastMessage,
    clearError,
    startNewConversation,
  };
}
