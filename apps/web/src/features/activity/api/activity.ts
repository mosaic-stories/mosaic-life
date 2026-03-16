import { apiGet } from '@/lib/api/client';

export interface ActorSummary {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
}

export interface EntitySummary {
  name?: string | null;
  title?: string | null;
  profile_image_url?: string | null;
  content_preview?: string | null;
  biography?: string | null;
  visibility?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  filename?: string | null;
  author_name?: string | null;
  legacy_id?: string | null;
  legacy_name?: string | null;
}

export interface SocialFeedItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor: ActorSummary;
  entity: EntitySummary | null;
}

export interface SocialFeedResponse {
  items: SocialFeedItem[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface EnrichedRecentItem {
  entity_type: string;
  entity_id: string;
  last_action: string;
  last_activity_at: string;
  metadata: Record<string, unknown> | null;
  entity: EntitySummary | null;
}

export interface EnrichedRecentItemsResponse {
  items: EnrichedRecentItem[];
  tracking_enabled: boolean;
}

export async function getSocialFeed(
  limit = 5,
  cursor?: string,
): Promise<SocialFeedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiGet<SocialFeedResponse>(`/api/activity/feed?${params}`);
}

export async function getRecentlyViewed(
  entityType: string,
  limit = 4,
): Promise<EnrichedRecentItemsResponse> {
  const params = new URLSearchParams({
    action: 'viewed',
    entity_type: entityType,
    limit: String(limit),
  });
  return apiGet<EnrichedRecentItemsResponse>(
    `/api/activity/recent/enriched?${params}`,
  );
}
