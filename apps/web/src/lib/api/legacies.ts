// Legacies API functions
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface LegacyMember {
  user_id: string;
  email: string;
  name: string;
  role: string;
  joined_at: string;
}

export interface Legacy {
  id: string;
  name: string;
  birth_date: string | null;
  death_date: string | null;
  biography: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator_email?: string | null;
  creator_name?: string | null;
  members?: LegacyMember[] | null;
  profile_image_id?: string | null;
  profile_image_url?: string | null;
}

export interface CreateLegacyInput {
  name: string;
  birth_date?: string | null;
  death_date?: string | null;
  biography?: string | null;
}

export interface UpdateLegacyInput {
  name?: string;
  birth_date?: string | null;
  death_date?: string | null;
  biography?: string | null;
}

export interface LegacySearchResult {
  id: string;
  name: string;
  birth_date: string | null;
  death_date: string | null;
  created_at: string;
  similarity?: number | null;
}

// Helper function to format dates for display
export function formatLegacyDates(legacy: Legacy): string {
  const birthYear = legacy.birth_date ? new Date(legacy.birth_date).getFullYear() : null;
  const deathYear = legacy.death_date ? new Date(legacy.death_date).getFullYear() : null;

  if (birthYear && deathYear) {
    return `${birthYear} - ${deathYear}`;
  } else if (birthYear) {
    return `Born ${birthYear}`;
  } else if (deathYear) {
    return `Died ${deathYear}`;
  }
  return '';
}

// Determine legacy context type based on dates
export function getLegacyContext(legacy: Legacy): 'memorial' | 'living-tribute' {
  return legacy.death_date ? 'memorial' : 'living-tribute';
}

export async function getLegacies(): Promise<Legacy[]> {
  return apiGet<Legacy[]>('/api/legacies/');
}

export async function getLegacy(id: string): Promise<Legacy> {
  return apiGet<Legacy>(`/api/legacies/${id}`);
}

export async function createLegacy(data: CreateLegacyInput): Promise<Legacy> {
  return apiPost<Legacy>('/api/legacies/', data);
}

export async function updateLegacy(id: string, data: UpdateLegacyInput): Promise<Legacy> {
  return apiPut<Legacy>(`/api/legacies/${id}`, data);
}

export async function deleteLegacy(id: string): Promise<void> {
  return apiDelete(`/api/legacies/${id}`);
}

export async function searchLegacies(query: string): Promise<LegacySearchResult[]> {
  return apiGet<LegacySearchResult[]>(`/api/legacies/search?q=${encodeURIComponent(query)}`);
}

export async function joinLegacy(id: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>(`/api/legacies/${id}/join`);
}

// Public endpoint - no authentication required
export async function exploreLegacies(limit: number = 20): Promise<Legacy[]> {
  return apiGet<Legacy[]>(`/api/legacies/explore?limit=${limit}`);
}

// Public endpoint - get legacy details without authentication
export async function getLegacyPublic(id: string): Promise<Legacy> {
  return apiGet<Legacy>(`/api/legacies/${id}/public`);
}
