// apps/web/src/features/evolve-workspace/hooks/useStoryContext.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStoryContext,
  extractContext,
  updateFactStatus,
  type StoryContextResponse,
  type ContextFact,
  type FactStatus,
} from '../api/storyContext';

export const storyContextKeys = {
  all: ['story-context'] as const,
  detail: (storyId: string) => [...storyContextKeys.all, storyId] as const,
};

/**
 * Fetch the extracted context (summary + facts) for a story.
 * Returns null if no context exists yet (404).
 */
export function useStoryContext(storyId: string | undefined) {
  return useQuery<StoryContextResponse | null>({
    queryKey: storyContextKeys.detail(storyId!),
    queryFn: async () => {
      try {
        return await getStoryContext(storyId!);
      } catch (err: unknown) {
        // 404 means no context yet — return null instead of throwing
        if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!storyId,
    staleTime: 30_000, // 30 seconds — refetches on tab switch
    refetchOnWindowFocus: false,
  });
}

/**
 * Trigger context extraction from story text.
 * Automatically refetches context after extraction starts.
 */
export function useExtractContext(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (force: boolean) => extractContext(storyId, force),
    onSuccess: () => {
      // Refetch context after a short delay to pick up extraction results
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: storyContextKeys.detail(storyId),
        });
      }, 3000);
    },
  });
}

/**
 * Update a fact's status with optimistic update.
 */
export function useUpdateFactStatus(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      factId,
      status,
    }: {
      factId: string;
      status: FactStatus;
    }) => updateFactStatus(storyId, factId, status),

    onMutate: async ({ factId, status }) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({
        queryKey: storyContextKeys.detail(storyId),
      });

      // Snapshot previous value
      const previous = queryClient.getQueryData<StoryContextResponse | null>(
        storyContextKeys.detail(storyId),
      );

      // Optimistically update
      if (previous) {
        queryClient.setQueryData<StoryContextResponse>(
          storyContextKeys.detail(storyId),
          {
            ...previous,
            facts: previous.facts.map((f: ContextFact) =>
              f.id === factId ? { ...f, status } : f,
            ),
          },
        );
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Roll back on error
      if (context?.previous) {
        queryClient.setQueryData(
          storyContextKeys.detail(storyId),
          context.previous,
        );
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: storyContextKeys.detail(storyId),
      });
    },
  });
}
