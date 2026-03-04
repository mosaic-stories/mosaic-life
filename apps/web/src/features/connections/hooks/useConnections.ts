// TanStack Query hooks for Connections Hub
import { useQuery } from '@tanstack/react-query';
import {
  getConnectionsStats,
  getTopConnections,
  getFavoritePersonas,
  getPeople,
  type PeopleFilter,
} from '@/features/connections/api/connections';

/** 5-minute stale time; connections data changes infrequently. */
const CONNECTIONS_STALE_TIME = 5 * 60 * 1000;

export const connectionKeys = {
  all: ['connections'] as const,
  stats: () => [...connectionKeys.all, 'stats'] as const,
  topConnections: (limit: number) => [...connectionKeys.all, 'top-connections', limit] as const,
  favoritePersonas: (limit: number) => [...connectionKeys.all, 'favorite-personas', limit] as const,
  people: (filter: string) => [...connectionKeys.all, 'people', filter] as const,
};

export function useConnectionsStats() {
  return useQuery({
    queryKey: connectionKeys.stats(),
    queryFn: getConnectionsStats,
    staleTime: CONNECTIONS_STALE_TIME,
  });
}

export function useTopConnections(limit: number = 6) {
  return useQuery({
    queryKey: connectionKeys.topConnections(limit),
    queryFn: () => getTopConnections(limit),
    staleTime: CONNECTIONS_STALE_TIME,
  });
}

export function useFavoritePersonas(limit: number = 4) {
  return useQuery({
    queryKey: connectionKeys.favoritePersonas(limit),
    queryFn: () => getFavoritePersonas(limit),
    staleTime: CONNECTIONS_STALE_TIME,
  });
}

export function usePeople(filter: PeopleFilter = 'all') {
  return useQuery({
    queryKey: connectionKeys.people(filter),
    queryFn: () => getPeople(filter),
    staleTime: CONNECTIONS_STALE_TIME,
  });
}
