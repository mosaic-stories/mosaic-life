import { apiGet, apiPost } from '@/lib/api/client';

export interface StoryPrompt {
  id: string;
  legacy_id: string;
  legacy_name: string;
  prompt_text: string;
  category: string;
  created_at: string;
}

export interface ActOnPromptResponse {
  action: string;
  legacy_id: string;
  story_id?: string;
  conversation_id?: string;
}

export function getCurrentPrompt(): Promise<StoryPrompt | null> {
  return apiGet<StoryPrompt | null>('/api/prompts/current');
}

export function shufflePrompt(promptId: string): Promise<StoryPrompt | null> {
  return apiPost<StoryPrompt | null>(`/api/prompts/${promptId}/shuffle`);
}

export function actOnPrompt(
  promptId: string,
  action: 'write_story' | 'discuss',
): Promise<ActOnPromptResponse> {
  return apiPost<ActOnPromptResponse>(`/api/prompts/${promptId}/act`, { action });
}
