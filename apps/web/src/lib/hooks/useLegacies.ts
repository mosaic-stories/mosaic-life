// TanStack Query hooks for legacies
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getLegacies,
  getLegacy,
  getLegacyPublic,
  createLegacy,
  updateLegacy,
  deleteLegacy,
  exploreLegacies,
  listMembers,
  changeMemberRole,
  removeMember,
  leaveLegacy,
  type CreateLegacyInput,
  type UpdateLegacyInput,
  type VisibilityFilter,
} from '@/lib/api/legacies';
import { ApiError } from '@/lib/api/client';

export const legacyKeys = {
  all: ['legacies'] as const,
  lists: () => [...legacyKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...legacyKeys.lists(), filters] as const,
  details: () => [...legacyKeys.all, 'detail'] as const,
  detail: (id: string) => [...legacyKeys.details(), id] as const,
  explore: () => [...legacyKeys.all, 'explore'] as const,
};

export const memberKeys = {
  all: ['members'] as const,
  list: (legacyId: string) => [...memberKeys.all, 'list', legacyId] as const,
};

export function useLegacies() {
  return useQuery({
    queryKey: legacyKeys.lists(),
    queryFn: getLegacies,
  });
}

export function useLegacy(id: string | undefined) {
  return useQuery({
    queryKey: legacyKeys.detail(id!),
    queryFn: () => getLegacy(id!),
    enabled: !!id,
  });
}

export function useCreateLegacy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLegacyInput) => createLegacy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.lists() });
    },
  });
}

export function useUpdateLegacy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLegacyInput }) =>
      updateLegacy(id, data),
    onSuccess: (updatedLegacy) => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.lists() });
      queryClient.setQueryData(legacyKeys.detail(updatedLegacy.id), updatedLegacy);
    },
  });
}

export function useDeleteLegacy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteLegacy(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.lists() });
      queryClient.removeQueries({ queryKey: legacyKeys.detail(id) });
    },
  });
}

// Hook for public explore endpoint - no authentication required for public legacies
export function useExploreLegacies(limit: number = 20, visibilityFilter?: VisibilityFilter) {
  return useQuery({
    queryKey: [...legacyKeys.explore(), { limit, visibilityFilter }],
    queryFn: () => exploreLegacies(limit, visibilityFilter),
  });
}

// Hook for public legacy detail - no authentication required
export function useLegacyPublic(id: string | undefined) {
  return useQuery({
    queryKey: [...legacyKeys.detail(id!), 'public'],
    queryFn: () => getLegacyPublic(id!),
    enabled: !!id,
  });
}

// Hook that tries private endpoint first, falls back to public if user is not a member
// Use this for viewing legacies from explore or direct links
export function useLegacyWithFallback(id: string | undefined, isAuthenticated: boolean) {
  const privateQuery = useQuery({
    queryKey: legacyKeys.detail(id!),
    queryFn: () => getLegacy(id!),
    enabled: !!id && isAuthenticated,
    retry: false, // Don't retry on 403
  });

  // Check if private query failed with 403 (access denied)
  const shouldFallbackToPublic = privateQuery.isError &&
    privateQuery.error instanceof ApiError &&
    privateQuery.error.status === 403;

  const publicQuery = useQuery({
    queryKey: [...legacyKeys.detail(id!), 'public'],
    queryFn: () => getLegacyPublic(id!),
    // Fetch public if: not authenticated OR private failed with 403
    enabled: !!id && (!isAuthenticated || shouldFallbackToPublic),
  });

  // Return private data if available and no error, otherwise public data
  if (isAuthenticated && privateQuery.data && !privateQuery.isError) {
    return privateQuery;
  }
  if (shouldFallbackToPublic || !isAuthenticated) {
    return publicQuery;
  }
  // Still loading private query or other error
  return privateQuery;
}

// Member management hooks
export function useMembers(legacyId: string) {
  return useQuery({
    queryKey: memberKeys.list(legacyId),
    queryFn: () => listMembers(legacyId),
  });
}

export function useChangeMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      legacyId,
      userId,
      role,
    }: {
      legacyId: string;
      userId: string;
      role: string;
    }) => changeMemberRole(legacyId, userId, role),
    onSuccess: (_, { legacyId }) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(legacyId) });
      queryClient.invalidateQueries({ queryKey: legacyKeys.detail(legacyId) });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      legacyId,
      userId,
    }: {
      legacyId: string;
      userId: string;
    }) => removeMember(legacyId, userId),
    onSuccess: (_, { legacyId }) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(legacyId) });
      queryClient.invalidateQueries({ queryKey: legacyKeys.detail(legacyId) });
    },
  });
}

export function useLeaveLegacy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (legacyId: string) => leaveLegacy(legacyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.lists() });
    },
  });
}
