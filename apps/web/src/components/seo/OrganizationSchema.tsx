// apps/web/src/components/seo/OrganizationSchema.tsx

import { BASE_URL, SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo/meta';

/**
 * Generate Organization schema for Mosaic Life.
 * Include this on the homepage and key landing pages.
 */
export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: BASE_URL,
    logo: `${BASE_URL}/logo.png`,
    description: DEFAULT_DESCRIPTION,
    sameAs: [
      // Add social profiles when available
      // 'https://twitter.com/mosaiclifeme',
      'https://facebook.com/mosaiclifeme',
    ],
  };
}
