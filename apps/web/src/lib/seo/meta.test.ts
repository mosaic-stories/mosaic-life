// apps/web/src/lib/seo/meta.test.ts

import { describe, it, expect } from 'vitest';
import {
  formatPageTitle,
  truncateDescription,
  getCanonicalUrl,
  getDefaultMeta,
  SITE_NAME,
  DEFAULT_DESCRIPTION,
  BASE_URL,
  DEFAULT_OG_IMAGE,
} from './meta';

describe('formatPageTitle', () => {
  it('returns default title when no page title provided', () => {
    expect(formatPageTitle()).toBe('Mosaic Life - Honoring Lives Through Shared Stories');
    expect(formatPageTitle(undefined)).toBe('Mosaic Life - Honoring Lives Through Shared Stories');
  });

  it('formats page title with site name suffix', () => {
    expect(formatPageTitle('About Us')).toBe('About Us | Mosaic Life');
    expect(formatPageTitle('John Doe Memorial')).toBe('John Doe Memorial | Mosaic Life');
  });

  it('handles empty string as no title', () => {
    expect(formatPageTitle('')).toBe('Mosaic Life - Honoring Lives Through Shared Stories');
  });
});

describe('truncateDescription', () => {
  it('returns default description for null/undefined', () => {
    expect(truncateDescription(null)).toBe(DEFAULT_DESCRIPTION);
    expect(truncateDescription(undefined)).toBe(DEFAULT_DESCRIPTION);
  });

  it('returns original text if within limit', () => {
    const shortText = 'This is a short description.';
    expect(truncateDescription(shortText)).toBe(shortText);
  });

  it('truncates text exceeding default limit of 160 chars', () => {
    const longText = 'A'.repeat(200);
    const result = truncateDescription(longText);
    expect(result.length).toBe(160);
    expect(result.endsWith('...')).toBe(true);
  });

  it('truncates to custom max length', () => {
    const text = 'A'.repeat(100);
    const result = truncateDescription(text, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith('...')).toBe(true);
  });

  it('handles exact boundary case', () => {
    const exactText = 'A'.repeat(160);
    expect(truncateDescription(exactText)).toBe(exactText);
  });

  it('trims whitespace before adding ellipsis', () => {
    const textWithSpace = 'This is some text     ' + 'A'.repeat(150);
    const result = truncateDescription(textWithSpace);
    expect(result).not.toMatch(/\s+\.\.\.$/);
  });
});

describe('getCanonicalUrl', () => {
  it('generates URL with leading slash', () => {
    expect(getCanonicalUrl('/about')).toBe(`${BASE_URL}/about`);
    expect(getCanonicalUrl('/legacy/123')).toBe(`${BASE_URL}/legacy/123`);
  });

  it('adds leading slash if missing', () => {
    expect(getCanonicalUrl('about')).toBe(`${BASE_URL}/about`);
    expect(getCanonicalUrl('legacy/123')).toBe(`${BASE_URL}/legacy/123`);
  });

  it('handles root path', () => {
    expect(getCanonicalUrl('/')).toBe(`${BASE_URL}/`);
  });

  it('handles empty string', () => {
    expect(getCanonicalUrl('')).toBe(`${BASE_URL}/`);
  });
});

describe('getDefaultMeta', () => {
  it('returns complete default meta object', () => {
    const meta = getDefaultMeta();

    expect(meta.title).toBe('Mosaic Life - Honoring Lives Through Shared Stories');
    expect(meta.description).toBe(DEFAULT_DESCRIPTION);
    expect(meta.canonicalUrl).toBe(BASE_URL);
    expect(meta.ogImage).toBe(DEFAULT_OG_IMAGE);
    expect(meta.ogType).toBe('website');
  });
});

describe('constants', () => {
  it('exports correct SITE_NAME', () => {
    expect(SITE_NAME).toBe('Mosaic Life');
  });

  it('exports BASE_URL (defaults to production when env var not set)', () => {
    // BASE_URL uses import.meta.env.VITE_APP_URL with fallback to production URL
    expect(BASE_URL).toBeTruthy();
    expect(BASE_URL).toMatch(/^https?:\/\//);
  });

  it('exports DEFAULT_OG_IMAGE based on BASE_URL', () => {
    expect(DEFAULT_OG_IMAGE).toBe(`${BASE_URL}/og-image.png`);
  });

  it('exports DEFAULT_DESCRIPTION with expected content', () => {
    expect(DEFAULT_DESCRIPTION).toContain('Honor');
    expect(DEFAULT_DESCRIPTION).toContain('digital tributes');
  });
});
