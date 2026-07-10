// Story Responses API functions.
// Mirrors the request/response shapes in
// services/core-api/app/schemas/story_response.py exactly.
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client';

export interface ConvertedStorySummary {
  id: string;
  title: string;
  legacy_id: string | null;
}

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
  /**
   * Non-null when this response was converted into a standalone story; the
   * response renders as a non-editable note linking to it (see
   * openspec/changes/response-to-story).
   */
  converted_story_id: string | null;
  /** Summary of the converted story, populated when `converted_story_id` is set. */
  converted_story: ConvertedStorySummary | null;
  /** Non-null once the response's author has dismissed the "make this a story" offer. */
  offer_dismissed_at: string | null;
  /**
   * True when the story author has hidden this converted note from other
   * viewers. Server-side list filtering means only the note's own author
   * will ever actually receive `hidden: true`.
   */
  hidden: boolean;
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

export async function dismissOffer(
  storyId: string,
  responseId: string,
): Promise<StoryResponseItem> {
  return apiPost<StoryResponseItem>(
    `/api/stories/${storyId}/responses/${responseId}/dismiss-offer`,
  );
}

// Story-author "hide this converted note" endpoint — see useHideResponse.
export async function hideResponse(
  storyId: string,
  responseId: string,
): Promise<StoryResponseItem> {
  return apiPost<StoryResponseItem>(`/api/stories/${storyId}/responses/${responseId}/hide`);
}
