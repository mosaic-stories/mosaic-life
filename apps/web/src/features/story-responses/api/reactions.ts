// Story Reactions API functions.
// Mirrors services/core-api/app/schemas/story_reaction.py exactly.
import { apiPost } from '@/lib/api/client';

export type ReactionType = 'heart' | 'candle' | 'smile';

export interface StoryReactionToggleResponse {
  /** Whether the reacting user now has this reaction active. */
  reacted: boolean;
  reaction_type: ReactionType;
  reaction_heart_count: number;
  reaction_candle_count: number;
  reaction_smile_count: number;
}

export async function toggleReaction(
  storyId: string,
  reactionType: ReactionType,
): Promise<StoryReactionToggleResponse> {
  return apiPost<StoryReactionToggleResponse>(`/api/stories/${storyId}/reactions`, {
    reaction_type: reactionType,
  });
}
