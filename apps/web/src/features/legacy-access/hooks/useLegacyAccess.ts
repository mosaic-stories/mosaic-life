import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  submitAccessRequest,
  listPendingAccessRequests,
  approveAccessRequest,
  declineAccessRequest,
  getOutgoingAccessRequests,
  type LegacyAccessRequestCreate,
  type ApproveRequest,
} from '../api/legacyAccess';

const STALE_TIME = 2 * 60 * 1000;

export const legacyAccessKeys = {
  all: ['legacy-access'] as const,
  pending: (legacyId: string) =>
    [...legacyAccessKeys.all, 'pending', legacyId] as const,
  outgoing: () => [...legacyAccessKeys.all, 'outgoing'] as const,
};

export function usePendingAccessRequests(
  legacyId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: legacyAccessKeys.pending(legacyId),
    queryFn: () => listPendingAccessRequests(legacyId),
    staleTime: STALE_TIME,
    enabled: options?.enabled ?? true,
  });
}

export function useOutgoingAccessRequests() {
  return useQuery({
    queryKey: legacyAccessKeys.outgoing(),
    queryFn: getOutgoingAccessRequests,
    staleTime: STALE_TIME,
  });
}

export function useSubmitAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      legacyId,
      data,
    }: {
      legacyId: string;
      data: LegacyAccessRequestCreate;
    }) => submitAccessRequest(legacyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: legacyAccessKeys.all,
      });
    },
  });
}

export function useApproveAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      legacyId,
      requestId,
      data,
    }: {
      legacyId: string;
      requestId: string;
      data?: ApproveRequest;
    }) => approveAccessRequest(legacyId, requestId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyAccessKeys.pending(variables.legacyId),
      });
    },
  });
}

export function useDeclineAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      legacyId,
      requestId,
    }: {
      legacyId: string;
      requestId: string;
    }) => declineAccessRequest(legacyId, requestId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyAccessKeys.pending(variables.legacyId),
      });
    },
  });
}
