/**
 * Settings API client for user preferences, profile, and stats.
 */

import { apiGet, apiPatch } from './client';

// Types
export interface UserPreferences {
  theme: string;
  default_model: string;
  hidden_personas: string[];
}

export interface PreferencesUpdateRequest {
  theme?: string;
  default_model?: string;
  hidden_personas?: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface ProfileUpdateRequest {
  name?: string;
  bio?: string;
}

export interface UserStats {
  member_since: string;
  legacies_count: number;
  stories_count: number;
  media_count: number;
  storage_used_bytes: number;
  chat_sessions_count: number;
  legacy_views_total: number;
  collaborators_count: number;
}

// API Functions
export async function getPreferences(): Promise<UserPreferences> {
  return apiGet<UserPreferences>('/api/users/me/preferences');
}

export async function updatePreferences(
  data: PreferencesUpdateRequest
): Promise<UserPreferences> {
  return apiPatch<UserPreferences>('/api/users/me/preferences', data);
}

export async function getProfile(): Promise<UserProfile> {
  return apiGet<UserProfile>('/api/users/me/profile');
}

export async function updateProfile(
  data: ProfileUpdateRequest
): Promise<UserProfile> {
  return apiPatch<UserProfile>('/api/users/me/profile', data);
}

export async function getStats(): Promise<UserStats> {
  return apiGet<UserStats>('/api/users/me/stats');
}
