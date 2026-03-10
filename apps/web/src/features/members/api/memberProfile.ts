import { apiGet, apiPut } from '@/lib/api/client';

export interface MemberProfile {
  relationship_type: string | null;
  nicknames: string[] | null;
  legacy_to_viewer: string | null;
  viewer_to_legacy: string | null;
  character_traits: string[] | null;
}

export interface MemberProfileUpdate {
  relationship_type?: string | null;
  nicknames?: string[] | null;
  legacy_to_viewer?: string | null;
  viewer_to_legacy?: string | null;
  character_traits?: string[];
}

/** Gender-aware display labels for the six gendered relationship types. */
const GENDERED_DISPLAY_LABELS: Record<string, Record<string, string>> = {
  parent: { male: 'Father', female: 'Mother' },
  child: { male: 'Son', female: 'Daughter' },
  sibling: { male: 'Brother', female: 'Sister' },
  grandparent: { male: 'Grandfather', female: 'Grandmother' },
  grandchild: { male: 'Grandson', female: 'Granddaughter' },
  spouse: { male: 'Husband', female: 'Wife' },
};

/** Neutral display labels for predefined relationship types. */
const NEUTRAL_LABELS: Record<string, string> = {
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse',
  sibling: 'Sibling',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
  aunt: 'Aunt',
  uncle: 'Uncle',
  cousin: 'Cousin',
  niece: 'Niece',
  nephew: 'Nephew',
  in_law: 'In-Law',
  friend: 'Friend',
  colleague: 'Colleague',
  mentor: 'Mentor',
  mentee: 'Mentee',
  caregiver: 'Caregiver',
  neighbor: 'Neighbor',
  other: 'Other',
};

/**
 * Get the display label for a relationship type, respecting legacy gender.
 * Falls back to neutral label, then to a capitalized version of the raw value.
 */
export function getRelationshipDisplayLabel(
  relationshipType: string,
  legacyGender: string | null | undefined
): string {
  const gendered = GENDERED_DISPLAY_LABELS[relationshipType];
  if (gendered && legacyGender && gendered[legacyGender]) {
    return gendered[legacyGender];
  }
  if (NEUTRAL_LABELS[relationshipType]) {
    return NEUTRAL_LABELS[relationshipType];
  }
  // Custom value — capitalize
  return relationshipType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getMemberProfile(
  legacyId: string
): Promise<MemberProfile | null> {
  return apiGet<MemberProfile | null>(`/api/legacies/${legacyId}/profile`);
}

export async function updateMemberProfile(
  legacyId: string,
  data: MemberProfileUpdate
): Promise<MemberProfile> {
  return apiPut<MemberProfile>(`/api/legacies/${legacyId}/profile`, data);
}
