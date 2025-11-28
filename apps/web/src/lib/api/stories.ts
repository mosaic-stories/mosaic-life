// Stories API functions
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface StorySummary {
  id: string;
  legacy_id: string;
  title: string;
  content_preview: string;
  author_id: string;
  author_name: string;
  visibility: 'public' | 'private' | 'personal';
  created_at: string;
  updated_at: string;
}

export interface StoryDetail {
  id: string;
  legacy_id: string;
  legacy_name: string;
  author_id: string;
  author_name: string;
  author_email: string;
  title: string;
  content: string;
  visibility: 'public' | 'private' | 'personal';
  created_at: string;
  updated_at: string;
}

export interface CreateStoryInput {
  legacy_id: string;
  title: string;
  content: string;
  visibility?: 'public' | 'private' | 'personal';
}

export interface UpdateStoryInput {
  title?: string;
  content?: string;
  visibility?: 'public' | 'private' | 'personal';
}

export interface StoryResponse {
  id: string;
  legacy_id: string;
  title: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export async function getStories(legacyId: string): Promise<StorySummary[]> {
  return apiGet<StorySummary[]>(`/api/stories/?legacy_id=${legacyId}`);
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
