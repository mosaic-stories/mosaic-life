/**
 * AI Chat API client with SSE streaming support.
 */

import { apiGet, apiPost, apiDelete } from '@/lib/api/client';

// ============================================================================
// Types
// ============================================================================

export interface Persona {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface LegacyAssociation {
  legacy_id: string;
  legacy_name: string;
  role: 'primary' | 'secondary';
  position: number;
}

export interface LegacyAssociationInput {
  legacy_id: string;
  role?: 'primary' | 'secondary';
  position?: number;
}

export interface Conversation {
  id: string;
  user_id: string;
  persona_id: string;
  title: string | null;
  legacies: LegacyAssociation[];
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary {
  id: string;
  persona_id: string;
  title: string | null;
  legacies: LegacyAssociation[];
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  token_count: number | null;
  created_at: string;
  blocked: boolean;
}

export interface MessageListResponse {
  messages: Message[];
  total: number;
  has_more: boolean;
}

export interface CreateConversationInput {
  persona_id: string;
  legacies: LegacyAssociationInput[];
}

export interface SendMessageInput {
  content: string;
}

// SSE Event types
export interface SSEChunkEvent {
  type: 'chunk';
  content: string;
}

export interface SSEDoneEvent {
  type: 'done';
  message_id: string;
  token_count: number | null;
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
  retryable: boolean;
}

export type SSEEvent = SSEChunkEvent | SSEDoneEvent | SSEErrorEvent;

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get available AI personas.
 */
export async function getPersonas(): Promise<Persona[]> {
  return apiGet<Persona[]>('/api/ai/personas');
}

/**
 * Create or get existing conversation.
 */
export async function createConversation(
  data: CreateConversationInput
): Promise<Conversation> {
  return apiPost<Conversation>('/api/ai/conversations', data);
}

/**
 * Create a new conversation (always creates new, never returns existing).
 */
export async function createNewConversation(
  data: CreateConversationInput
): Promise<Conversation> {
  return apiPost<Conversation>('/api/ai/conversations/new', data);
}

/**
 * List user's conversations.
 */
export async function listConversations(
  legacyId?: string,
  personaId?: string,
  limit: number = 10
): Promise<ConversationSummary[]> {
  const params = new URLSearchParams();
  if (legacyId) params.append('legacy_id', legacyId);
  if (personaId) params.append('persona_id', personaId);
  params.append('limit', String(limit));
  const queryString = params.toString();
  return apiGet<ConversationSummary[]>(
    `/api/ai/conversations${queryString ? `?${queryString}` : ''}`
  );
}

/**
 * Get conversation messages.
 */
export async function getMessages(
  conversationId: string,
  limit = 50,
  offset = 0
): Promise<MessageListResponse> {
  return apiGet<MessageListResponse>(
    `/api/ai/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`
  );
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  return apiDelete(`/api/ai/conversations/${conversationId}`);
}

/**
 * Send a message and stream the response.
 *
 * @param conversationId - The conversation ID
 * @param content - The message content
 * @param onChunk - Callback for each content chunk
 * @param onDone - Callback when streaming completes
 * @param onError - Callback on error
 * @returns AbortController to cancel the stream
 */
export function streamMessage(
  conversationId: string,
  content: string,
  onChunk: (content: string) => void,
  onDone: (messageId: string, tokenCount: number | null) => void,
  onError: (message: string, retryable: boolean) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(
        `/api/ai/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        onError(
          (errorData as { detail?: string }).detail ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status >= 500
        );
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError('No response body', false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (done) break;
        const value = result.value;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              try {
                const event = JSON.parse(jsonStr) as SSEEvent;

                switch (event.type) {
                  case 'chunk':
                    onChunk(event.content);
                    break;
                  case 'done':
                    onDone(event.message_id, event.token_count);
                    break;
                  case 'error':
                    onError(event.message, event.retryable);
                    break;
                }
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError);
              }
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Stream was cancelled
        return;
      }
      console.error('Stream error:', error);
      onError('Connection error. Please try again.', true);
    }
  })();

  return controller;
}
