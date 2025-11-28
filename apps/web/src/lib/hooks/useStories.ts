// TanStack Query hooks for stories
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStories,
  getStory,
  getPublicStories,
  createStory,
  updateStory,
  deleteStory,
  type StorySummary,
  type StoryDetail,
  type CreateStoryInput,
  type UpdateStoryInput,
} from '@/lib/api/stories';

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
    mutationFn: ({ storyId, legacyId }: { storyId: string; legacyId: string }) =>
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
