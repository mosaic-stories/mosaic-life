// apps/web/src/features/evolve-workspace/api/storyContext.ts
import { apiGet, apiPost, apiPatch } from '@/lib/api/client';

// --- Types ---

export type FactCategory =
  | 'person'
  | 'place'
  | 'date'
  | 'event'
  | 'emotion'
  | 'relationship'
  | 'object';

export type FactSource = 'story' | 'conversation';
export type FactStatus = 'active' | 'pinned' | 'dismissed';

export interface ContextFact {
  id: string;
  category: FactCategory;
  content: string;
  detail: string | null;
  source: FactSource;
  status: FactStatus;
  created_at: string;
}

export interface StoryContextResponse {
  id: string;
  story_id: string;
  summary: string | null;
  summary_updated_at: string | null;
  extracting: boolean;
  facts: ContextFact[];
}

export interface ExtractResponse {
  status: 'extracting' | 'cached';
}

// --- API Functions ---

export async function getStoryContext(
  storyId: string,
): Promise<StoryContextResponse> {
  return apiGet<StoryContextResponse>(`/api/stories/${storyId}/context`);
}

export async function extractContext(
  storyId: string,
  force = false,
): Promise<ExtractResponse> {
  return apiPost<ExtractResponse>(`/api/stories/${storyId}/context/extract`, {
    force,
  });
}

export async function updateFactStatus(
  storyId: string,
  factId: string,
  status: FactStatus,
): Promise<ContextFact> {
  return apiPatch<ContextFact>(
    `/api/stories/${storyId}/context/facts/${factId}`,
    { status },
  );
}
