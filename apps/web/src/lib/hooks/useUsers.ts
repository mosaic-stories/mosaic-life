// TanStack Query hooks for user operations

import { useQuery } from '@tanstack/react-query';
import { searchUsers, UserSearchResult } from '@/lib/api/users';

export const userKeys = {
  all: ['users'] as const,
  search: (query: string) => [...userKeys.all, 'search', query] as const,
};

export function useUserSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: userKeys.search(query),
    queryFn: () => searchUsers(query),
    enabled: enabled && query.length >= 3 && !query.includes('@'),
    staleTime: 30_000, // Cache results for 30 seconds
  });
}

export type { UserSearchResult };
