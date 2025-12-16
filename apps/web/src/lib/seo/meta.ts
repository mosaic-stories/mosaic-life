// apps/web/src/lib/seo/meta.ts

/**
 * SEO meta tag utilities for generating consistent meta information.
 */

export interface SEOMetaData {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'profile' | 'article';
  noIndex?: boolean;
}

const SITE_NAME = 'Mosaic Life';
const DEFAULT_DESCRIPTION = 'Honor the lives and milestones that matter most. Create meaningful digital tributes for memorials, retirements, graduations, and living legacies.';
// Use environment variable for base URL to support staging/dev, fallback to production
const BASE_URL = import.meta.env.VITE_APP_URL || 'https://mosaiclife.me';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

/**
 * Generate a page title with site name suffix.
 */
export function formatPageTitle(pageTitle?: string): string {
  if (!pageTitle) {
    return `${SITE_NAME} - Honoring Lives Through Shared Stories`;
  }
  return `${pageTitle} | ${SITE_NAME}`;
}

/**
 * Truncate description to SEO-friendly length (max 160 chars).
 */
export function truncateDescription(text: string | undefined | null, maxLength = 160): string {
  if (!text) return DEFAULT_DESCRIPTION;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Generate canonical URL from path.
 */
export function getCanonicalUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
}

/**
 * Get default meta data for the site.
 */
export function getDefaultMeta(): SEOMetaData {
  return {
    title: formatPageTitle(),
    description: DEFAULT_DESCRIPTION,
    canonicalUrl: BASE_URL,
    ogImage: DEFAULT_OG_IMAGE,
    ogType: 'website',
  };
}

export { SITE_NAME, DEFAULT_DESCRIPTION, BASE_URL, DEFAULT_OG_IMAGE };
