// Person API functions
import { apiGet } from '@/lib/api/client';

export interface PersonMatchCandidate {
  person_id: string;
  canonical_name: string;
  birth_year_range: string | null;
  death_year_range: string | null;
  legacy_count: number;
  confidence: number;
}

export interface PersonMatchResponse {
  candidates: PersonMatchCandidate[];
}

export async function getMatchCandidates(params: {
  name: string;
  birth_date?: string | null;
  death_date?: string | null;
}): Promise<PersonMatchResponse> {
  const searchParams = new URLSearchParams({ name: params.name });
  if (params.birth_date) {
    searchParams.set('birth_date', params.birth_date);
  }
  if (params.death_date) {
    searchParams.set('death_date', params.death_date);
  }
  return apiGet<PersonMatchResponse>(
    `/api/persons/match-candidates?${searchParams.toString()}`
  );
}
