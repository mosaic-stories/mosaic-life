import { apiGet } from '@/lib/api/client';

export interface UserSearchResult {
  id: string;
  name: string;
  avatar_url: string | null;
  username: string | null;
}

export async function searchUsers(
  query: string,
  limit: number = 10
): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiGet<UserSearchResult[]>(`/api/users/search?${params}`);
}
