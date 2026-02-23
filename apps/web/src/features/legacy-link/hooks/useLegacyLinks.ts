// TanStack Query hooks for legacy links
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listLinks,
  getLink,
  createLinkRequest,
  respondToLink,
  revokeLink,
  updateShareMode,
  shareResource,
  unshareResource,
  listShares,
} from '@/features/legacy-link/api/legacyLinks';

export const legacyLinkKeys = {
  all: ['legacy-links'] as const,
  lists: () => [...legacyLinkKeys.all, 'list'] as const,
  detail: (id: string) => [...legacyLinkKeys.all, 'detail', id] as const,
  shares: (id: string) => [...legacyLinkKeys.all, 'shares', id] as const,
};

export function useLegacyLinks() {
  return useQuery({
    queryKey: legacyLinkKeys.lists(),
    queryFn: listLinks,
  });
}

export function useLegacyLink(id: string | undefined) {
  return useQuery({
    queryKey: legacyLinkKeys.detail(id!),
    queryFn: () => getLink(id!),
    enabled: !!id,
  });
}

export function useLegacyLinkShares(linkId: string | undefined) {
  return useQuery({
    queryKey: legacyLinkKeys.shares(linkId!),
    queryFn: () => listShares(linkId!),
    enabled: !!linkId,
  });
}

export function useCreateLinkRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      requester_legacy_id: string;
      target_legacy_id: string;
      person_id: string;
    }) => createLinkRequest(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyLinkKeys.lists() });
    },
  });
}

export function useRespondToLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, action }: { linkId: string; action: 'accept' | 'reject' }) =>
      respondToLink(linkId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyLinkKeys.all });
    },
  });
}

export function useRevokeLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => revokeLink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyLinkKeys.all });
    },
  });
}

export function useUpdateShareMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, mode }: { linkId: string; mode: 'selective' | 'all' }) =>
      updateShareMode(linkId, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyLinkKeys.all });
    },
  });
}

export function useShareResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      linkId,
      resourceType,
      resourceId,
    }: {
      linkId: string;
      resourceType: 'story' | 'media';
      resourceId: string;
    }) => shareResource(linkId, resourceType, resourceId),
    onSuccess: (_, { linkId }) => {
      queryClient.invalidateQueries({ queryKey: legacyLinkKeys.shares(linkId) });
    },
  });
}

export function useUnshareResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, shareId }: { linkId: string; shareId: string }) =>
      unshareResource(linkId, shareId),
    onSuccess: (_, { linkId }) => {
      queryClient.invalidateQueries({ queryKey: legacyLinkKeys.shares(linkId) });
    },
  });
}
