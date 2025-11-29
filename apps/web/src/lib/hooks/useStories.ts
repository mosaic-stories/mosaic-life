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
  list: (legacyId: string) => [...storyKeys.lists(), legacyId] as const,
  details: () => [...storyKeys.all, 'detail'] as const,
  detail: (storyId: string) => [...storyKeys.details(), storyId] as const,
};

export function useStories(legacyId: string | undefined) {
  return useQuery({
    queryKey: storyKeys.list(legacyId!),
    queryFn: () => getStories(legacyId!),
    enabled: !!legacyId,
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
      // Invalidate both authenticated and public story lists
      queryClient.invalidateQueries({ queryKey: storyKeys.list(newStory.legacy_id) });
      queryClient.invalidateQueries({ queryKey: [...storyKeys.list(newStory.legacy_id), 'public'] });
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
      queryClient.invalidateQueries({ queryKey: storyKeys.list(updatedStory.legacy_id) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(updatedStory.id) });
    },
  });
}

export function useDeleteStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ storyId, legacyId: _legacyId }: { storyId: string; legacyId: string }) =>
      deleteStory(storyId),
    onSuccess: (_, { storyId, legacyId }) => {
      queryClient.invalidateQueries({ queryKey: storyKeys.list(legacyId) });
      queryClient.removeQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}

// Hook for public stories - no authentication required
export function usePublicStories(legacyId: string | undefined) {
  return useQuery({
    queryKey: [...storyKeys.list(legacyId!), 'public'],
    queryFn: () => getPublicStories(legacyId!),
    enabled: !!legacyId,
  });
}

// Hook that tries private endpoint first, falls back to public if user is not a member
// Use this for viewing stories from explore or direct links
export function useStoriesWithFallback(legacyId: string | undefined, isAuthenticated: boolean) {
  const privateQuery = useQuery({
    queryKey: storyKeys.list(legacyId!),
    queryFn: () => getStories(legacyId!),
    enabled: !!legacyId && isAuthenticated,
    retry: false, // Don't retry on 403
  });

  // Check if private query failed with 403 (access denied)
  const shouldFallbackToPublic = privateQuery.isError &&
    privateQuery.error instanceof ApiError &&
    privateQuery.error.status === 403;

  const publicQuery = useQuery({
    queryKey: [...storyKeys.list(legacyId!), 'public'],
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
