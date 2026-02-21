import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getVersions,
  getVersion,
  restoreVersion,
  approveDraft,
  discardDraft,
} from '@/lib/api/versions';
import { storyKeys } from './useStories';

export const versionKeys = {
  all: ['versions'] as const,
  list: (storyId: string) => [...versionKeys.all, storyId, 'list'] as const,
  detail: (storyId: string, versionNumber: number) =>
    [...versionKeys.all, storyId, 'detail', versionNumber] as const,
};

export function useVersions(storyId: string, enabled: boolean) {
  return useQuery({
    queryKey: versionKeys.list(storyId),
    queryFn: () => getVersions(storyId, 1, 20),
    enabled,
  });
}

export function useVersionDetail(
  storyId: string,
  versionNumber: number | null
) {
  return useQuery({
    queryKey: versionKeys.detail(storyId, versionNumber!),
    queryFn: () => getVersion(storyId, versionNumber!),
    enabled: versionNumber !== null,
  });
}

export function useRestoreVersion(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionNumber: number) =>
      restoreVersion(storyId, versionNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}

export function useApproveDraft(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => approveDraft(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}

export function useDiscardDraft(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => discardDraft(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}
