// Stories API functions
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api/client';

export interface LegacyAssociation {
  legacy_id: string;
  legacy_name: string;
  role: 'primary' | 'secondary';
  position: number;
}

export interface LegacyAssociationInput {
  legacy_id: string;
  role?: 'primary' | 'secondary';
  position?: number;
}

export interface StorySummary {
  id: string;
  legacies: LegacyAssociation[];
  title: string;
  content_preview: string;
  author_id: string;
  author_name: string;
  author_username: string;
  author_avatar_url: string | null;
  visibility: 'public' | 'private' | 'personal';
  status: 'draft' | 'published';
  shared_from: string | null;
  created_at: string;
  updated_at: string;
  favorite_count: number;
}

export interface StoryDetail {
  id: string;
  legacies: LegacyAssociation[];
  author_id: string;
  author_name: string;
  author_username: string;
  author_avatar_url: string | null;
  author_email: string;
  title: string;
  content: string;
  visibility: 'public' | 'private' | 'personal';
  status: 'draft' | 'published';
  version_count: number | null;  // null if not author
  has_draft: boolean | null;     // null if not author
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
  favorite_count: number;
}

export interface CreateStoryInput {
  legacies: LegacyAssociationInput[];
  title: string;
  content: string;
  visibility?: 'public' | 'private' | 'personal';
  status?: 'draft' | 'published';
}

export interface UpdateStoryInput {
  title?: string;
  content?: string;
  visibility?: 'public' | 'private' | 'personal';
  legacies?: LegacyAssociationInput[];
}

export interface StoryResponse {
  id: string;
  legacies: LegacyAssociation[];
  title: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export type StoryScope = 'all' | 'mine' | 'shared' | 'favorites' | 'drafts';

export interface StoryScopeCounts {
  all: number;
  mine: number;
  shared: number;
}

export interface StoryScopedResponse {
  items: StorySummary[];
  counts: StoryScopeCounts;
}

export interface StoryStatsResponse {
  my_stories_count: number;
  favorites_given_count: number;
  stories_evolved_count: number;
  legacies_written_for_count: number;
}

export interface TopLegacy {
  legacy_id: string;
  legacy_name: string;
  profile_image_url: string | null;
  story_count: number;
}

export async function getStories(
  legacyId?: string,
  orphaned?: boolean,
): Promise<StorySummary[]> {
  const params = new URLSearchParams();
  if (legacyId) params.append('legacy_id', legacyId);
  if (orphaned !== undefined) params.append('orphaned', String(orphaned));
  const queryString = params.toString();
  return apiGet<StorySummary[]>(`/api/stories/${queryString ? `?${queryString}` : ''}`);
}

export async function getScopedStories(scope: StoryScope): Promise<StoryScopedResponse> {
  return apiGet<StoryScopedResponse>(`/api/stories/?scope=${scope}`);
}

export async function getStoryStats(): Promise<StoryStatsResponse> {
  return apiGet<StoryStatsResponse>('/api/stories/stats');
}

export async function getTopLegacies(limit: number = 6): Promise<TopLegacy[]> {
  return apiGet<TopLegacy[]>(`/api/stories/top-legacies?limit=${limit}`);
}

export async function getStory(storyId: string): Promise<StoryDetail> {
  return apiGet<StoryDetail>(`/api/stories/${storyId}`);
}

export async function createStory(data: CreateStoryInput): Promise<StoryResponse> {
  return apiPost<StoryResponse>('/api/stories/', data);
}

export async function updateStory(storyId: string, data: UpdateStoryInput): Promise<StoryResponse> {
  return apiPut<StoryResponse>(`/api/stories/${storyId}`, data);
}

export async function deleteStory(storyId: string): Promise<void> {
  return apiDelete(`/api/stories/${storyId}`);
}

// Public endpoint - get stories without authentication
export async function getPublicStories(legacyId: string): Promise<StorySummary[]> {
  return apiGet<StorySummary[]>(`/api/stories/public?legacy_id=${legacyId}`);
}
