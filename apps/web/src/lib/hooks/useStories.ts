// TanStack Query hooks for stories
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStories,
  getStory,
  getPublicStories,
  createStory,
  updateStory,
  deleteStory,
  type CreateStoryInput,
  type UpdateStoryInput,
} from '@/lib/api/stories';
import { ApiError } from '@/lib/api/client';

export const storyKeys = {
  all: ['stories'] as const,
  lists: () => [...storyKeys.all, 'list'] as const,
  list: (filters?: { legacyId?: string; orphaned?: boolean }) => {
    if (!filters) return [...storyKeys.lists()];
    if (filters.orphaned) return [...storyKeys.lists(), 'orphaned'];
    if (filters.legacyId) return [...storyKeys.lists(), filters.legacyId];
    return [...storyKeys.lists()];
  },
  details: () => [...storyKeys.all, 'detail'] as const,
  detail: (storyId: string) => [...storyKeys.details(), storyId] as const,
};

export function useStories(legacyId?: string, orphaned?: boolean) {
  return useQuery({
    queryKey: storyKeys.list({ legacyId, orphaned }),
    queryFn: () => getStories(legacyId, orphaned),
    enabled: true, // Always enabled, just filters differently
  });
}

export function useStory(storyId: string | undefined) {
  return useQuery({
    queryKey: storyKeys.detail(storyId!),
    queryFn: () => getStory(storyId!),
    enabled: !!storyId,
  });
}

export function useCreateStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateStoryInput) => createStory(data),
    onSuccess: (newStory) => {
      // Invalidate all story list queries since story may appear in multiple legacy contexts
      queryClient.invalidateQueries({ queryKey: storyKeys.lists() });

      // Invalidate specific legacy queries for all associated legacies
      newStory.legacies.forEach((legacy) => {
        queryClient.invalidateQueries({
          queryKey: storyKeys.list({ legacyId: legacy.legacy_id })
        });
        queryClient.invalidateQueries({
          queryKey: [...storyKeys.list({ legacyId: legacy.legacy_id }), 'public']
        });
      });
    },
  });
}

export function useUpdateStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storyId,
      data,
    }: {
      storyId: string;
      data: UpdateStoryInput;
    }) => updateStory(storyId, data),
    onSuccess: (updatedStory) => {
      // Invalidate all story list queries since legacy associations may have changed
      queryClient.invalidateQueries({ queryKey: storyKeys.lists() });

      // Invalidate specific legacy queries for all associated legacies
      updatedStory.legacies.forEach((legacy) => {
        queryClient.invalidateQueries({
          queryKey: storyKeys.list({ legacyId: legacy.legacy_id })
        });
      });

      // Invalidate the specific story detail
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(updatedStory.id) });
    },
  });
}

export function useDeleteStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ storyId }: { storyId: string }) => deleteStory(storyId),
    onSuccess: (_, { storyId }) => {
      // Invalidate all story list queries since we don't know which legacies it was associated with
      queryClient.invalidateQueries({ queryKey: storyKeys.lists() });

      // Remove the specific story from cache
      queryClient.removeQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}

// Hook for public stories - no authentication required
export function usePublicStories(legacyId: string | undefined) {
  return useQuery({
    queryKey: [...storyKeys.list({ legacyId }), 'public'],
    queryFn: () => getPublicStories(legacyId!),
    enabled: !!legacyId,
  });
}

// Hook that tries private endpoint first, falls back to public if user is not a member
// Use this for viewing stories from explore or direct links
export function useStoriesWithFallback(legacyId: string | undefined, isAuthenticated: boolean) {
  const privateQuery = useQuery({
    queryKey: storyKeys.list({ legacyId }),
    queryFn: () => getStories(legacyId),
    enabled: !!legacyId && isAuthenticated,
    retry: false, // Don't retry on 403
  });

  // Check if private query failed with 403 (access denied)
  const shouldFallbackToPublic = privateQuery.isError &&
    privateQuery.error instanceof ApiError &&
    privateQuery.error.status === 403;

  const publicQuery = useQuery({
    queryKey: [...storyKeys.list({ legacyId }), 'public'],
    queryFn: () => getPublicStories(legacyId!),
    // Fetch public if: not authenticated OR private failed with 403
    enabled: !!legacyId && (!isAuthenticated || shouldFallbackToPublic),
  });

  // Return private data if available and no error, otherwise public data
  if (isAuthenticated && privateQuery.data && !privateQuery.isError) {
    return privateQuery;
  }
  if (shouldFallbackToPublic || !isAuthenticated) {
    return publicQuery;
  }
  // Still loading private query or other error
  return privateQuery;
}
