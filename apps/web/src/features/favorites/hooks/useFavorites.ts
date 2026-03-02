import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkFavorites,
  listFavorites,
  toggleFavorite,
  type EntityType,
  type FavoriteToggleResponse,
} from '../api/favorites';
import { storyKeys } from '@/features/story/hooks/useStories';
import { legacyKeys } from '@/features/legacy/hooks/useLegacies';
import { mediaKeys } from '@/features/media/hooks/useMedia';

export const favoriteKeys = {
  all: ['favorites'] as const,
  check: (entityIds: string[]) => [...favoriteKeys.all, 'check', entityIds] as const,
  list: (entityType?: EntityType) => [...favoriteKeys.all, 'list', entityType] as const,
};

export function useFavoriteCheck(entityIds: string[]) {
  return useQuery({
    queryKey: favoriteKeys.check(entityIds),
    queryFn: () => checkFavorites(entityIds),
    enabled: entityIds.length > 0,
  });
}

export function useFavoriteToggle() {
  const queryClient = useQueryClient();

  return useMutation<
    FavoriteToggleResponse,
    Error,
    { entityType: EntityType; entityId: string }
  >({
    mutationFn: ({ entityType, entityId }) =>
      toggleFavorite(entityType, entityId),
    onSuccess: (_data, variables) => {
      // Invalidate favorite check caches
      queryClient.invalidateQueries({ queryKey: favoriteKeys.all });

      // Invalidate the parent entity list to refresh favorite_count
      switch (variables.entityType) {
        case 'story':
          queryClient.invalidateQueries({ queryKey: storyKeys.all });
          break;
        case 'legacy':
          queryClient.invalidateQueries({ queryKey: legacyKeys.all });
          break;
        case 'media':
          queryClient.invalidateQueries({ queryKey: mediaKeys.all });
          break;
      }
    },
  });
}

export function useMyFavorites(entityType?: EntityType, limit = 8) {
  return useQuery({
    queryKey: favoriteKeys.list(entityType),
    queryFn: () => listFavorites(entityType, limit),
  });
}
