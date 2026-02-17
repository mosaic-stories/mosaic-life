// TanStack Query hooks for story evolution
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getActiveEvolution,
  startEvolution,
  advancePhase,
  discardEvolution,
  acceptEvolution,
  type EvolutionSession,
  type PhaseAdvanceRequest,
} from '@/lib/api/evolution';
import { storyKeys } from './useStories';

export const evolutionKeys = {
  all: ['evolution'] as const,
  active: (storyId: string) =>
    [...evolutionKeys.all, 'active', storyId] as const,
};

export function useActiveEvolution(
  storyId: string | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: evolutionKeys.active(storyId ?? ''),
    queryFn: () => getActiveEvolution(storyId!),
    enabled: !!storyId && enabled,
    retry: false,
    staleTime: 10_000,
  });
}

export function useStartEvolution(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personaId: string) => startEvolution(storyId, personaId),
    onSuccess: (session: EvolutionSession) => {
      queryClient.setQueryData(evolutionKeys.active(storyId), session);
    },
  });
}

export function useAdvancePhase(storyId: string, sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PhaseAdvanceRequest) =>
      advancePhase(storyId, sessionId, data),
    onSuccess: (session: EvolutionSession) => {
      queryClient.setQueryData(evolutionKeys.active(storyId), session);
    },
  });
}

export function useDiscardEvolution(storyId: string, sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => discardEvolution(storyId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: evolutionKeys.active(storyId),
      });
    },
  });
}

export function useAcceptEvolution(storyId: string, sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => acceptEvolution(storyId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: evolutionKeys.all });
      queryClient.invalidateQueries({
        queryKey: storyKeys.detail(storyId),
      });
    },
  });
}
