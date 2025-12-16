// TanStack Query hooks for invitations
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  sendInvitation,
  listInvitations,
  revokeInvitation,
  getInvitationPreview,
  acceptInvitation,
  type InvitationCreate,
} from '@/lib/api/invitations';
import { legacyKeys } from './useLegacies';

export const invitationKeys = {
  all: ['invitations'] as const,
  list: (legacyId: string) => [...invitationKeys.all, 'list', legacyId] as const,
  preview: (token: string) => [...invitationKeys.all, 'preview', token] as const,
};

export function useInvitations(legacyId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: invitationKeys.list(legacyId),
    queryFn: () => listInvitations(legacyId),
    // Only fetch when enabled (defaults to true for backwards compatibility)
    enabled: options?.enabled ?? true,
  });
}

export function useSendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      legacyId,
      data,
    }: {
      legacyId: string;
      data: InvitationCreate;
    }) => sendInvitation(legacyId, data),
    onSuccess: (_, { legacyId }) => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(legacyId) });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      legacyId,
      invitationId,
    }: {
      legacyId: string;
      invitationId: string;
    }) => revokeInvitation(legacyId, invitationId),
    onSuccess: (_, { legacyId }) => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(legacyId) });
    },
  });
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: invitationKeys.preview(token),
    queryFn: () => getInvitationPreview(token),
    retry: false,
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => acceptInvitation(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.lists() });
    },
  });
}
