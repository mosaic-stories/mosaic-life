/**
 * Settings API client for user preferences, profile, and stats.
 */

import { apiDelete, apiGet, apiPatch, apiPost } from './client';

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

export interface UserSession {
  id: string;
  device_info: string | null;
  location: string | null;
  last_active_at: string;
  created_at: string;
  is_current: boolean;
}

export interface SessionListResponse {
  sessions: UserSession[];
}

export interface DataExportResponse {
  status: string;
  download_url: string;
  expires_at: string;
}

export interface AccountDeletionTokenResponse {
  token: string;
  expires_at: string;
}

export interface DeleteAccountRequest {
  confirmation_text: string;
  confirmation_token: string;
}

export interface ActionStatusResponse {
  status: string;
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

export async function getSessions(): Promise<SessionListResponse> {
  return apiGet<SessionListResponse>('/api/users/me/sessions');
}

export async function revokeSession(
  sessionId: string
): Promise<ActionStatusResponse> {
  return apiDelete<ActionStatusResponse>(`/api/users/me/sessions/${sessionId}`);
}

export async function requestDataExport(): Promise<DataExportResponse> {
  return apiPost<DataExportResponse>('/api/users/me/export');
}

export async function createAccountDeletionToken(): Promise<AccountDeletionTokenResponse> {
  return apiPost<AccountDeletionTokenResponse>('/api/users/me/delete-token');
}

export async function deleteAccount(
  data: DeleteAccountRequest
): Promise<ActionStatusResponse> {
  return apiDelete<ActionStatusResponse>('/api/users/me', data);
}
