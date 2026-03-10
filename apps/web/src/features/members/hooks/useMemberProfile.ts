import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMemberProfile,
  updateMemberProfile,
  type MemberProfileUpdate,
} from '../api/memberProfile';

export const memberProfileKeys = {
  all: ['memberProfiles'] as const,
  detail: (legacyId: string) =>
    [...memberProfileKeys.all, legacyId] as const,
};

export function useMemberProfile(
  legacyId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: memberProfileKeys.detail(legacyId),
    queryFn: () => getMemberProfile(legacyId),
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateMemberProfile(legacyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MemberProfileUpdate) =>
      updateMemberProfile(legacyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: memberProfileKeys.detail(legacyId),
      });
    },
  });
}
