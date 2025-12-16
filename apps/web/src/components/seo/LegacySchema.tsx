// apps/web/src/components/seo/LegacySchema.tsx

import { BASE_URL } from '@/lib/seo/meta';

export interface LegacySchemaInput {
  id: string;
  name: string;
  biography?: string | null;
  profileImageUrl?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate ProfilePage + Person schema for a legacy profile.
 * Use this on /legacy/:id pages.
 */
export function getLegacySchema(legacy: LegacySchemaInput) {
  const personSchema: Record<string, unknown> = {
    '@type': 'Person',
    name: legacy.name,
  };

  if (legacy.biography) {
    personSchema.description = legacy.biography;
  }

  if (legacy.profileImageUrl) {
    personSchema.image = legacy.profileImageUrl;
  }

  if (legacy.birthDate) {
    personSchema.birthDate = legacy.birthDate;
  }

  if (legacy.deathDate) {
    personSchema.deathDate = legacy.deathDate;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: personSchema,
    dateCreated: legacy.createdAt,
    dateModified: legacy.updatedAt,
    url: `${BASE_URL}/legacy/${legacy.id}`,
  };
}
