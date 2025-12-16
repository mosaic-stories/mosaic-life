/**
 * TanStack Query hooks for user settings.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getPreferences,
  getProfile,
  getStats,
  PreferencesUpdateRequest,
  ProfileUpdateRequest,
  updatePreferences,
  updateProfile,
} from '../api/settings';

// Query keys factory
export const settingsKeys = {
  all: ['settings'] as const,
  preferences: () => [...settingsKeys.all, 'preferences'] as const,
  profile: () => [...settingsKeys.all, 'profile'] as const,
  stats: () => [...settingsKeys.all, 'stats'] as const,
};

// Preferences hooks
export function usePreferences(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: settingsKeys.preferences(),
    queryFn: getPreferences,
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Prevent automatic refetches that could overwrite optimistic updates
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Only fetch when enabled (defaults to true for backwards compatibility)
    enabled: options?.enabled ?? true,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PreferencesUpdateRequest) => updatePreferences(data),
    onMutate: async (newData) => {
      // Cancel any outgoing refetches to prevent them from overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: settingsKeys.preferences() });

      // Snapshot the previous value
      const previousPreferences = queryClient.getQueryData(settingsKeys.preferences());

      // Optimistically update to the new value
      queryClient.setQueryData(settingsKeys.preferences(), (old: unknown) => ({
        ...(old as Record<string, unknown>),
        ...newData,
      }));

      // Return context with the previous value and new data
      return { previousPreferences, newData };
    },
    onError: (_err, _newData, context) => {
      // Rollback to the previous value on error
      if (context?.previousPreferences) {
        queryClient.setQueryData(settingsKeys.preferences(), context.previousPreferences);
      }
    },
    onSuccess: (_data, _variables, context) => {
      // Re-apply the optimistic update to ensure it persists
      // This handles cases where a background refetch might have occurred
      if (context?.newData) {
        queryClient.setQueryData(settingsKeys.preferences(), (old: unknown) => ({
          ...(old as Record<string, unknown>),
          ...context.newData,
        }));
      }
    },
  });
}

// Profile hooks
export function useProfile() {
  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: getProfile,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProfileUpdateRequest) => updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.profile() });
    },
  });
}

// Stats hook
export function useStats() {
  return useQuery({
    queryKey: settingsKeys.stats(),
    queryFn: getStats,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}
