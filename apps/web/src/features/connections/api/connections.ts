// Connections Hub API functions
import { apiGet } from '@/lib/api/client';

export interface ConnectionsStatsResponse {
  conversations_count: number;
  people_count: number;
  shared_legacies_count: number;
  personas_used_count: number;
}

export interface TopConnection {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  shared_legacy_count: number;
}

export interface FavoritePersona {
  persona_id: string;
  persona_name: string;
  persona_icon: string;
  conversation_count: number;
}

export interface SharedLegacySummary {
  legacy_id: string;
  legacy_name: string;
  user_role: string;
  connection_role: string;
}

export interface PersonConnection {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  shared_legacy_count: number;
  shared_legacies: SharedLegacySummary[];
  highest_shared_role: string;
}

export interface PeopleCounts {
  all: number;
  co_creators: number;
  collaborators: number;
}

export interface PeopleResponse {
  items: PersonConnection[];
  counts: PeopleCounts;
}

export type PeopleFilter = 'all' | 'co_creators' | 'collaborators';

export async function getConnectionsStats(): Promise<ConnectionsStatsResponse> {
  return apiGet<ConnectionsStatsResponse>('/api/connections/stats');
}

export async function getTopConnections(limit: number = 6): Promise<TopConnection[]> {
  return apiGet<TopConnection[]>(`/api/connections/top-connections?limit=${limit}`);
}

export async function getFavoritePersonas(limit: number = 4): Promise<FavoritePersona[]> {
  return apiGet<FavoritePersona[]>(`/api/connections/favorite-personas?limit=${limit}`);
}

export async function getPeople(filter: PeopleFilter = 'all'): Promise<PeopleResponse> {
  return apiGet<PeopleResponse>(`/api/connections/people?filter=${filter}`);
}
