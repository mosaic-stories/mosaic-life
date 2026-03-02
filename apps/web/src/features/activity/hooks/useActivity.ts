import { useQuery } from '@tanstack/react-query';
import { getSocialFeed, getRecentlyViewed } from '../api/activity';

export const activityKeys = {
  all: ['activity'] as const,
  socialFeed: () => [...activityKeys.all, 'social-feed'] as const,
  recentViewed: (entityType: string) =>
    [...activityKeys.all, 'recent-viewed', entityType] as const,
};

export function useSocialFeed(limit = 5) {
  return useQuery({
    queryKey: activityKeys.socialFeed(),
    queryFn: () => getSocialFeed(limit),
    staleTime: 60_000,
  });
}

export function useRecentlyViewed(entityType: 'legacy' | 'story', limit = 4) {
  return useQuery({
    queryKey: activityKeys.recentViewed(entityType),
    queryFn: () => getRecentlyViewed(entityType, limit),
    staleTime: 60_000,
  });
}
