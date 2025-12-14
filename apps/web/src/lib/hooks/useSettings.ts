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
export function usePreferences() {
  return useQuery({
    queryKey: settingsKeys.preferences(),
    queryFn: getPreferences,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PreferencesUpdateRequest) => updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.preferences() });
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
