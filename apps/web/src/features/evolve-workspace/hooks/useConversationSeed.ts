import { useEffect, useRef } from 'react';
import { streamSeed } from '../api/seed';
import { useAIChatStore, type ChatMessage } from '@/features/ai-chat/store/aiChatStore';

/**
 * Stream a seed opening message into the conversation when it's empty.
 * Fires once when conversationId is set and messages are empty.
 * Best-effort: errors are logged but don't break the workspace.
 */
export function useConversationSeed(
  conversationId: string | null,
  storyId: string
) {
  const hasFiredRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const {
    getActiveMessages,
    addMessage,
    appendToLastMessage,
    updateLastMessage,
    setStreaming,
  } = useAIChatStore();

  useEffect(() => {
    if (!conversationId || hasFiredRef.current) return;

    // Wait a tick for useAIChat to finish loading messages
    const timer = setTimeout(() => {
      const messages = getActiveMessages();
      if (messages.length > 0) {
        hasFiredRef.current = true;
        return;
      }

      hasFiredRef.current = true;

      // Add placeholder assistant message
      const placeholder: ChatMessage = {
        id: `seed-${Date.now()}`,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        token_count: null,
        created_at: new Date().toISOString(),
        blocked: false,
        status: 'streaming',
      };
      addMessage(conversationId, placeholder);
      setStreaming(true);

      abortRef.current = streamSeed(
        conversationId,
        storyId,
        (chunk) => {
          appendToLastMessage(conversationId, chunk);
        },
        (messageId) => {
          updateLastMessage(conversationId, {
            id: messageId,
            status: 'complete',
          });
          setStreaming(false);
        },
        (errorMsg) => {
          console.error('Seed error:', errorMsg);
          // Remove the empty placeholder on error
          const current = getActiveMessages();
          if (
            current.length > 0 &&
            current[current.length - 1].id.startsWith('seed-')
          ) {
            // Remove placeholder by setting messages without it
            const store = useAIChatStore.getState();
            const convState = store.conversations.get(conversationId);
            if (convState) {
              const filtered = convState.messages.filter(
                (m) => !m.id.startsWith('seed-')
              );
              store.setMessages(conversationId, filtered);
            }
          }
          setStreaming(false);
        }
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [
    conversationId,
    storyId,
    getActiveMessages,
    addMessage,
    appendToLastMessage,
    updateLastMessage,
    setStreaming,
  ]);
}
