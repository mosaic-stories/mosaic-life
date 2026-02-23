// TanStack Query hook for person match candidates
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { getMatchCandidates } from '@/features/person/api/persons';

export const personKeys = {
  all: ['persons'] as const,
  matchCandidates: (name: string, birthDate?: string | null, deathDate?: string | null) =>
    [...personKeys.all, 'match-candidates', { name, birthDate, deathDate }] as const,
};

export function usePersonMatch(
  name: string,
  birthDate?: string | null,
  deathDate?: string | null
) {
  const debouncedName = useDebounce(name.trim(), 300);

  return useQuery({
    queryKey: personKeys.matchCandidates(debouncedName, birthDate, deathDate),
    queryFn: () =>
      getMatchCandidates({
        name: debouncedName,
        birth_date: birthDate,
        death_date: deathDate,
      }),
    enabled: debouncedName.length >= 2,
    staleTime: 30_000,
  });
}
