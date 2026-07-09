// Story Responses API functions.
// Mirrors the request/response shapes in
// services/core-api/app/schemas/story_response.py exactly.
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client';

export interface StoryResponseItem {
  id: string;
  story_id: string;
  user_id: string;
  user_name: string;
  user_username: string;
  user_avatar_url: string | null;
  body: string;
  created_at: string;
  /** Non-null when the response has been edited since creation. */
  edited_at: string | null;
}

export interface StoryResponseListResponse {
  items: StoryResponseItem[];
  next_cursor: string | null;
  has_more: boolean;
}

export async function listResponses(
  storyId: string,
  cursor?: string,
  limit = 20,
): Promise<StoryResponseListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiGet<StoryResponseListResponse>(
    `/api/stories/${storyId}/responses?${params.toString()}`,
  );
}

export async function createResponse(
  storyId: string,
  body: string,
): Promise<StoryResponseItem> {
  return apiPost<StoryResponseItem>(`/api/stories/${storyId}/responses`, { body });
}

export async function updateResponse(
  storyId: string,
  responseId: string,
  body: string,
): Promise<StoryResponseItem> {
  return apiPatch<StoryResponseItem>(
    `/api/stories/${storyId}/responses/${responseId}`,
    { body },
  );
}

export async function deleteResponse(
  storyId: string,
  responseId: string,
): Promise<void> {
  return apiDelete(`/api/stories/${storyId}/responses/${responseId}`);
}
