import { apiGet, apiPatch } from '@/lib/api/client';

export interface VisibilityContext {
  show_bio: boolean;
  show_legacies: boolean;
  show_stories: boolean;
  show_media: boolean;
  show_connections: boolean;
}

export interface ProfileLegacyCard {
  id: string;
  name: string;
  subject_photo_url: string | null;
  story_count: number;
}

export interface ProfileStoryCard {
  id: string;
  title: string;
  preview: string | null;
  legacy_name: string | null;
}

export interface ProfileConnectionCard {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface ProfileResponse {
  user_id?: string; // TODO: backend returns user_id in profile
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  legacies: ProfileLegacyCard[] | null;
  stories: ProfileStoryCard[] | null;
  connections: ProfileConnectionCard[] | null;
  visibility_context: VisibilityContext;
}

export interface ProfileSettingsResponse {
  discoverable: boolean;
  visibility_legacies: string;
  visibility_stories: string;
  visibility_media: string;
  visibility_connections: string;
  visibility_bio: string;
}

export interface ProfileSettingsUpdate {
  discoverable?: boolean;
  visibility_legacies?: string;
  visibility_stories?: string;
  visibility_media?: string;
  visibility_connections?: string;
  visibility_bio?: string;
}

export async function getProfileByUsername(
  username: string
): Promise<ProfileResponse> {
  return apiGet<ProfileResponse>(`/api/users/${username}`);
}

export async function updateUsername(
  username: string
): Promise<{ username: string }> {
  return apiPatch<{ username: string }>('/api/users/me/username', { username });
}

export async function getProfileSettings(): Promise<ProfileSettingsResponse> {
  return apiGet<ProfileSettingsResponse>('/api/users/me/profile/settings');
}

export async function updateProfileSettings(
  data: ProfileSettingsUpdate
): Promise<ProfileSettingsResponse> {
  return apiPatch<ProfileSettingsResponse>(
    '/api/users/me/profile/settings',
    data
  );
}
