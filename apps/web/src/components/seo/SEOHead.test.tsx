// apps/web/src/components/seo/SEOHead.test.tsx

import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import SEOHead from './SEOHead';

function renderWithHelmet(ui: React.ReactElement) {
  const helmetContext = {};
  return {
    ...render(
      <HelmetProvider context={helmetContext}>{ui}</HelmetProvider>
    ),
    helmetContext,
  };
}

describe('SEOHead', () => {
  it('renders with default values when no props provided', async () => {
    renderWithHelmet(<SEOHead />);

    await waitFor(() => {
      expect(document.title).toBe('Mosaic Life - Honoring Lives Through Shared Stories');
    });
  });

  it('renders custom title with site name suffix', async () => {
    renderWithHelmet(<SEOHead title="About Us" />);

    await waitFor(() => {
      expect(document.title).toBe('About Us | Mosaic Life');
    });
  });

  it('renders canonical URL from path', async () => {
    renderWithHelmet(<SEOHead path="/about" />);

    await waitFor(() => {
      const canonical = document.querySelector('link[rel="canonical"]');
      expect(canonical).toHaveAttribute('href', 'https://mosaiclife.me/about');
    });
  });

  it('renders robots meta as index,follow by default', async () => {
    renderWithHelmet(<SEOHead />);

    await waitFor(() => {
      const robots = document.querySelector('meta[name="robots"]');
      expect(robots).toHaveAttribute('content', 'index, follow');
    });
  });

  it('renders noindex,nofollow when noIndex is true', async () => {
    renderWithHelmet(<SEOHead noIndex />);

    await waitFor(() => {
      const robots = document.querySelector('meta[name="robots"]');
      expect(robots).toHaveAttribute('content', 'noindex, nofollow');
    });
  });

  it('renders Open Graph meta tags', async () => {
    renderWithHelmet(
      <SEOHead
        title="Test Page"
        description="Test description"
        path="/test"
        ogType="article"
      />
    );

    await waitFor(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDescription = document.querySelector('meta[property="og:description"]');
      const ogUrl = document.querySelector('meta[property="og:url"]');
      const ogType = document.querySelector('meta[property="og:type"]');
      const ogSiteName = document.querySelector('meta[property="og:site_name"]');

      expect(ogTitle).toHaveAttribute('content', 'Test Page | Mosaic Life');
      expect(ogDescription).toHaveAttribute('content', 'Test description');
      expect(ogUrl).toHaveAttribute('content', 'https://mosaiclife.me/test');
      expect(ogType).toHaveAttribute('content', 'article');
      expect(ogSiteName).toHaveAttribute('content', 'Mosaic Life');
    });
  });

  it('renders Twitter Card meta tags', async () => {
    renderWithHelmet(
      <SEOHead
        title="Test Page"
        description="Test description"
        ogImage="https://example.com/image.jpg"
      />
    );

    await waitFor(() => {
      const twitterCard = document.querySelector('meta[name="twitter:card"]');
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      const twitterImage = document.querySelector('meta[name="twitter:image"]');

      expect(twitterCard).toHaveAttribute('content', 'summary_large_image');
      expect(twitterTitle).toHaveAttribute('content', 'Test Page | Mosaic Life');
      expect(twitterDescription).toHaveAttribute('content', 'Test description');
      expect(twitterImage).toHaveAttribute('content', 'https://example.com/image.jpg');
    });
  });

  it('uses default OG image when none provided', async () => {
    renderWithHelmet(<SEOHead />);

    await waitFor(() => {
      const ogImage = document.querySelector('meta[property="og:image"]');
      expect(ogImage).toHaveAttribute('content', 'https://mosaiclife.me/og-image.png');
    });
  });

  it('renders structured data script when provided', async () => {
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test Org',
    };

    renderWithHelmet(<SEOHead structuredData={structuredData} />);

    await waitFor(() => {
      const script = document.querySelector('script[type="application/ld+json"]');
      expect(script).toBeInTheDocument();
      expect(script?.textContent).toBe(JSON.stringify(structuredData));
    });
  });

  it('does not render structured data script when not provided', async () => {
    renderWithHelmet(<SEOHead />);

    await waitFor(() => {
      const script = document.querySelector('script[type="application/ld+json"]');
      expect(script).not.toBeInTheDocument();
    });
  });
});
