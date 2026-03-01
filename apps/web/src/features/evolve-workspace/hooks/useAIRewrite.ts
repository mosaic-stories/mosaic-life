import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { streamRewrite, type RewriteRequest } from '../api/rewrite';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

export function useAIRewrite(storyId: string) {
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const { startRewrite, appendRewriteChunk, completeRewrite, discardRewrite } =
    useEvolveWorkspaceStore();

  const triggerRewrite = useCallback(
    (currentContent: string, options: Omit<RewriteRequest, 'content'> = {}) => {
      // Abort any in-progress rewrite
      abortRef.current?.abort();

      startRewrite(currentContent);

      const data: RewriteRequest = {
        content: currentContent,
        ...options,
      };

      abortRef.current = streamRewrite(
        storyId,
        data,
        (chunk) => appendRewriteChunk(chunk),
        (_versionId, _versionNumber) => {
          completeRewrite();
          // Invalidate versions query so the new draft appears
          queryClient.invalidateQueries({ queryKey: ['versions', storyId] });
        },
        (message, _retryable) => {
          console.error('Rewrite error:', message);
          discardRewrite();
        },
      );
    },
    [storyId, startRewrite, appendRewriteChunk, completeRewrite, discardRewrite, queryClient],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    discardRewrite();
  }, [discardRewrite]);

  return { triggerRewrite, abort };
}
