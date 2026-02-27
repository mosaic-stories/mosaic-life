import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';

export interface RewriteRequest {
  content: string;
  conversation_id?: string | null;
  pinned_context_ids?: string[];
  writing_style?: WritingStyle | null;
  length_preference?: LengthPreference | null;
  persona_id?: string;
}

interface RewriteChunkEvent {
  type: 'chunk';
  text: string;
}

interface RewriteDoneEvent {
  type: 'done';
  version_id: string;
  version_number: number;
}

interface RewriteErrorEvent {
  type: 'error';
  message: string;
  retryable: boolean;
}

type RewriteSSEEvent = RewriteChunkEvent | RewriteDoneEvent | RewriteErrorEvent;

/**
 * Stream a story rewrite via SSE. Returns an AbortController for cancellation.
 */
export function streamRewrite(
  storyId: string,
  data: RewriteRequest,
  onChunk: (text: string) => void,
  onDone: (versionId: string, versionNumber: number) => void,
  onError: (message: string, retryable: boolean) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`/api/stories/${storyId}/rewrite`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        onError(
          (errorData as { detail?: string }).detail ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status >= 500,
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

        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              try {
                const event = JSON.parse(jsonStr) as RewriteSSEEvent;
                switch (event.type) {
                  case 'chunk':
                    onChunk(event.text);
                    break;
                  case 'done':
                    onDone(event.version_id, event.version_number);
                    break;
                  case 'error':
                    onError(event.message, event.retryable);
                    break;
                }
              } catch {
                console.error('Failed to parse SSE event');
              }
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Rewrite stream error:', error);
      onError('Connection error. Please try again.', true);
    }
  })();

  return controller;
}
