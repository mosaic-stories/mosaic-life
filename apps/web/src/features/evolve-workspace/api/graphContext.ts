import { apiGet } from '@/lib/api/client';

export interface RelatedStory {
  id: string;
  title: string;
  snippet: string;
  relevance: number;
}

export interface EntityGroup {
  people: Array<Record<string, string>>;
  places: Array<Record<string, string>>;
  events: Array<Record<string, string>>;
  objects: Array<Record<string, string>>;
}

export interface GraphContextResponse {
  related_stories: RelatedStory[];
  entities: EntityGroup;
}

export async function getGraphContext(storyId: string): Promise<GraphContextResponse> {
  return apiGet<GraphContextResponse>(`/api/stories/${storyId}/graph-context`);
}
