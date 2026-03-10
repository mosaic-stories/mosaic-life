import { apiGet, apiPut } from '@/lib/api/client';

export type RelationshipType =
  | 'parent'
  | 'child'
  | 'spouse'
  | 'sibling'
  | 'grandparent'
  | 'grandchild'
  | 'aunt'
  | 'uncle'
  | 'cousin'
  | 'niece'
  | 'nephew'
  | 'in_law'
  | 'friend'
  | 'colleague'
  | 'mentor'
  | 'mentee'
  | 'caregiver'
  | 'neighbor'
  | 'other';

export interface MemberProfile {
  relationship_type: RelationshipType | null;
  nickname: string | null;
  legacy_to_viewer: string | null;
  viewer_to_legacy: string | null;
  character_traits: string[] | null;
}

export interface MemberProfileUpdate {
  relationship_type?: RelationshipType | null;
  nickname?: string | null;
  legacy_to_viewer?: string | null;
  viewer_to_legacy?: string | null;
  character_traits?: string[];
}

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
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
