// User API functions
import { apiGet } from './client';

export interface UserSearchResult {
  id: string;
  name: string;
  avatar_url: string | null;
}

export async function searchUsers(
  query: string,
  limit: number = 10
): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
  });
  return apiGet<UserSearchResult[]>(`/api/users/search?${params}`);
}
