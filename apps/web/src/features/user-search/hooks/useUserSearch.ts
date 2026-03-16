import { useQuery } from '@tanstack/react-query';
import { searchUsers } from '../api/userSearch';

export const userSearchKeys = {
  all: ['user-search'] as const,
  query: (q: string) => [...userSearchKeys.all, q] as const,
};

export function useUserSearch(query: string) {
  return useQuery({
    queryKey: userSearchKeys.query(query),
    queryFn: () => searchUsers(query),
    enabled: query.length >= 3,
    staleTime: 30 * 1000, // 30 seconds — search results are ephemeral
  });
}
