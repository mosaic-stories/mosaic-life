import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentPrompt, shufflePrompt, actOnPrompt } from '../api/storyPrompts';
import type { StoryPrompt } from '../api/storyPrompts';

const storyPromptKeys = {
  all: ['story-prompts'] as const,
  current: () => [...storyPromptKeys.all, 'current'] as const,
};

export function useCurrentPrompt() {
  return useQuery<StoryPrompt | null>({
    queryKey: storyPromptKeys.current(),
    queryFn: getCurrentPrompt,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useShufflePrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (promptId: string) => shufflePrompt(promptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyPromptKeys.current() });
    },
  });
}

export function useActOnPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ promptId, action }: { promptId: string; action: 'write_story' | 'discuss' }) =>
      actOnPrompt(promptId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyPromptKeys.current() });
    },
  });
}
