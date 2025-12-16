// apps/web/src/components/seo/SEOHead.tsx

import { Helmet } from 'react-helmet-async';
import {
  formatPageTitle,
  truncateDescription,
  getCanonicalUrl,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
} from '@/lib/seo/meta';

export interface SEOHeadProps {
  /** Page title (will be suffixed with site name) */
  title?: string;
  /** Page description (max 160 chars) */
  description?: string;
  /** Path for canonical URL (e.g., "/about" or "/legacy/123") */
  path?: string;
  /** Open Graph image URL */
  ogImage?: string;
  /** Open Graph type */
  ogType?: 'website' | 'profile' | 'article';
  /** Set true for pages that should not be indexed (e.g., user settings) */
  noIndex?: boolean;
  /** Additional structured data (JSON-LD) */
  structuredData?: object;
}

export default function SEOHead({
  title,
  description,
  path = '/',
  ogImage,
  ogType = 'website',
  noIndex = false,
  structuredData,
}: SEOHeadProps) {
  const fullTitle = formatPageTitle(title);
  const fullDescription = truncateDescription(description);
  const canonicalUrl = getCanonicalUrl(path);
  const imageUrl = ogImage || DEFAULT_OG_IMAGE;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Robots */}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
}
