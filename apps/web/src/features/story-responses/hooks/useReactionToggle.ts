// TanStack Query hook for the story reaction toggle endpoint.
// Mirrors apps/web/src/features/favorites/hooks/useFavorites.ts's useFavoriteToggle.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  toggleReaction,
  type ReactionType,
  type StoryReactionToggleResponse,
} from '@/features/story-responses/api/reactions';
import { storyKeys } from '@/features/story/hooks/useStories';

export function useReactionToggle(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation<StoryReactionToggleResponse, Error, ReactionType>({
    mutationFn: (reactionType) => toggleReaction(storyId, reactionType),
    onSuccess: () => {
      // Refresh this story's detail (counts) and any list/card views showing it.
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.lists() });
    },
  });
}
