import { apiGet, apiPost, apiPatch } from './client';

// --- Types ---

export type EvolutionPhase =
  | 'elicitation'
  | 'summary'
  | 'style_selection'
  | 'drafting'
  | 'review'
  | 'completed'
  | 'discarded';

export type WritingStyle =
  | 'vivid'
  | 'emotional'
  | 'conversational'
  | 'concise'
  | 'documentary';

export type LengthPreference = 'similar' | 'shorter' | 'longer';

export interface EvolutionSession {
  id: string;
  story_id: string;
  base_version_number: number;
  conversation_id: string;
  draft_version_id: string | null;
  phase: EvolutionPhase;
  summary_text: string | null;
  writing_style: WritingStyle | null;
  length_preference: LengthPreference | null;
  revision_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PhaseAdvanceRequest {
  phase: EvolutionPhase;
  summary_text?: string;
  writing_style?: WritingStyle;
  length_preference?: LengthPreference;
}

// --- SSE Event Types ---

interface EvolutionChunkEvent {
  type: 'chunk';
  text: string;
}

interface EvolutionDoneEvent {
  type: 'done';
  version_id: string;
  version_number: number;
}

interface EvolutionErrorEvent {
  type: 'error';
  message: string;
  retryable: boolean;
}

type EvolutionSSEEvent =
  | EvolutionChunkEvent
  | EvolutionDoneEvent
  | EvolutionErrorEvent;

// --- API Functions ---

export function startEvolution(
  storyId: string,
  personaId: string
): Promise<EvolutionSession> {
  return apiPost(`/api/stories/${storyId}/evolution`, {
    persona_id: personaId,
  });
}

export function getActiveEvolution(
  storyId: string
): Promise<EvolutionSession> {
  return apiGet(`/api/stories/${storyId}/evolution/active`);
}

export function advancePhase(
  storyId: string,
  sessionId: string,
  data: PhaseAdvanceRequest
): Promise<EvolutionSession> {
  return apiPatch(
    `/api/stories/${storyId}/evolution/${sessionId}/phase`,
    data
  );
}

export function discardEvolution(
  storyId: string,
  sessionId: string
): Promise<EvolutionSession> {
  return apiPost(
    `/api/stories/${storyId}/evolution/${sessionId}/discard`
  );
}

export function acceptEvolution(
  storyId: string,
  sessionId: string
): Promise<EvolutionSession> {
  return apiPost(
    `/api/stories/${storyId}/evolution/${sessionId}/accept`
  );
}

// --- SSE Streaming ---

/**
 * Process an SSE response stream, dispatching events to callbacks.
 */
function processSSEStream(
  response: Response,
  onChunk: (text: string) => void,
  onDone: (versionId: string, versionNumber: number) => void,
  onError: (message: string, retryable: boolean) => void
): void {
  const reader = response.body?.getReader();
  if (!reader) {
    onError('No response body', false);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  (async () => {
    try {
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (done) break;

        buffer += decoder.decode(result.value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              try {
                const event = JSON.parse(jsonStr) as EvolutionSSEEvent;

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
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error while processing SSE stream:', error);
      onError('Connection error while processing stream. Please try again.', true);
    }
  })();
}

/**
 * Stream draft generation via SSE.
 * Returns AbortController for cancellation.
 */
export function streamGenerate(
  storyId: string,
  sessionId: string,
  onChunk: (text: string) => void,
  onDone: (versionId: string, versionNumber: number) => void,
  onError: (message: string, retryable: boolean) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(
        `/api/stories/${storyId}/evolution/${sessionId}/generate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
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

      processSSEStream(response, onChunk, onDone, onError);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      console.error('Generate stream error:', error);
      onError('Connection error. Please try again.', true);
    }
  })();

  return controller;
}

/**
 * Stream draft revision via SSE.
 * Returns AbortController for cancellation.
 */
export function streamRevise(
  storyId: string,
  sessionId: string,
  instructions: string,
  onChunk: (text: string) => void,
  onDone: (versionId: string, versionNumber: number) => void,
  onError: (message: string, retryable: boolean) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(
        `/api/stories/${storyId}/evolution/${sessionId}/revise`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ instructions }),
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

      processSSEStream(response, onChunk, onDone, onError);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      console.error('Revise stream error:', error);
      onError('Connection error. Please try again.', true);
    }
  })();

  return controller;
}
