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
  type CreateLegacyInput,
  type UpdateLegacyInput,
} from '@/lib/api/legacies';

export const legacyKeys = {
  all: ['legacies'] as const,
  lists: () => [...legacyKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...legacyKeys.lists(), filters] as const,
  details: () => [...legacyKeys.all, 'detail'] as const,
  detail: (id: string) => [...legacyKeys.details(), id] as const,
  explore: () => [...legacyKeys.all, 'explore'] as const,
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

// Hook for public explore endpoint - no authentication required
export function useExploreLegacies(limit: number = 20) {
  return useQuery({
    queryKey: legacyKeys.explore(),
    queryFn: () => exploreLegacies(limit),
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
