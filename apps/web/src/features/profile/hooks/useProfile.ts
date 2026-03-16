import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProfileByUsername,
  updateUsername,
  getProfileSettings,
  updateProfileSettings,
  type ProfileSettingsUpdate,
} from '../api/profile';

const STALE_TIME = 5 * 60 * 1000;

export const profileKeys = {
  all: ['profile'] as const,
  byUsername: (username: string) =>
    [...profileKeys.all, 'user', username] as const,
  settings: () => [...profileKeys.all, 'settings'] as const,
};

export function useUserProfile(username: string) {
  return useQuery({
    queryKey: profileKeys.byUsername(username),
    queryFn: () => getProfileByUsername(username),
    staleTime: STALE_TIME,
    enabled: !!username,
  });
}

export function useProfileSettings() {
  return useQuery({
    queryKey: profileKeys.settings(),
    queryFn: getProfileSettings,
    staleTime: STALE_TIME,
  });
}

export function useUpdateUsername() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => updateUsername(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}

export function useUpdateProfileSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileSettingsUpdate) => updateProfileSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.settings() });
    },
  });
}
