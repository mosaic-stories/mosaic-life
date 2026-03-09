export function streamPromptSeed(
  conversationId: string,
  onChunk: (content: string) => void,
  onDone: (messageId: string) => void,
  onError: (message: string) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(
        `/api/ai/conversations/${conversationId}/seed?seed_mode=story_prompt`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        },
      );

      if (response.status === 204) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        onError(
          (errorData as { detail?: string }).detail ||
            `HTTP ${response.status}: ${response.statusText}`,
        );
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

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
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            switch (event.type) {
              case 'chunk':
                onChunk(event.content);
                break;
              case 'done':
                onDone(event.message_id);
                break;
              case 'error':
                onError(event.message);
                break;
            }
          } catch {
            console.error('Failed to parse prompt seed SSE event');
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Prompt seed stream error:', error);
      onError('Connection error during opening message.');
    }
  })();

  return controller;
}