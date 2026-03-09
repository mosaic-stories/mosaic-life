import { apiGet, apiPost } from '@/lib/api/client';

export interface StoryPrompt {
  id: string;
  legacy_id: string;
  legacy_name: string;
  legacy_profile_image_url: string | null;
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

export async function getCurrentPrompt(): Promise<StoryPrompt | null> {
  const response = await apiGet<StoryPrompt | null | undefined>('/api/prompts/current');
  return response ?? null;
}

export async function shufflePrompt(promptId: string): Promise<StoryPrompt | null> {
  const response = await apiPost<StoryPrompt | null | undefined>(`/api/prompts/${promptId}/shuffle`);
  return response ?? null;
}

export function actOnPrompt(
  promptId: string,
  action: 'write_story' | 'discuss',
): Promise<ActOnPromptResponse> {
  return apiPost<ActOnPromptResponse>(`/api/prompts/${promptId}/act`, { action });
}
