import { apiGet, apiPost } from '@/lib/api/client';

export type EntityType = 'story' | 'legacy' | 'media';

export interface FavoriteToggleResponse {
  favorited: boolean;
  favorite_count: number;
}

export interface FavoriteCheckResponse {
  favorites: Record<string, boolean>;
}

export interface FavoriteEntity {
  [key: string]: unknown;
}

export interface FavoriteItem {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  created_at: string;
  entity: FavoriteEntity | null;
}

export interface FavoriteListResponse {
  items: FavoriteItem[];
  total: number;
}

export async function toggleFavorite(
  entityType: EntityType,
  entityId: string,
): Promise<FavoriteToggleResponse> {
  return apiPost<FavoriteToggleResponse>('/api/favorites', {
    entity_type: entityType,
    entity_id: entityId,
  });
}

export async function checkFavorites(
  entityIds: string[],
): Promise<FavoriteCheckResponse> {
  if (entityIds.length === 0) return { favorites: {} };
  return apiGet<FavoriteCheckResponse>(
    `/api/favorites/check?entity_ids=${entityIds.join(',')}`,
  );
}

export async function listFavorites(
  entityType?: EntityType,
  limit = 20,
): Promise<FavoriteListResponse> {
  const params = new URLSearchParams();
  if (entityType) params.set('entity_type', entityType);
  params.set('limit', String(limit));
  return apiGet<FavoriteListResponse>(`/api/favorites?${params.toString()}`);
}
