// apps/web/src/components/seo/OrganizationSchema.test.ts

import { describe, it, expect } from 'vitest';
import { getOrganizationSchema } from './OrganizationSchema';

describe('getOrganizationSchema', () => {
  it('returns valid Schema.org Organization structure', () => {
    const schema = getOrganizationSchema();

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Organization');
  });

  it('includes Mosaic Life organization details', () => {
    const schema = getOrganizationSchema();

    expect(schema.name).toBe('Mosaic Life');
    expect(schema.url).toBe('https://mosaiclife.me');
    expect(schema.logo).toBe('https://mosaiclife.me/logo.png');
  });

  it('includes organization description', () => {
    const schema = getOrganizationSchema();

    expect(schema.description).toBeDefined();
    expect(typeof schema.description).toBe('string');
    expect(schema.description).toContain('digital tributes');
  });

  it('includes sameAs array for social profiles', () => {
    const schema = getOrganizationSchema();

    expect(Array.isArray(schema.sameAs)).toBe(true);
  });

  it('returns consistent results on multiple calls', () => {
    const schema1 = getOrganizationSchema();
    const schema2 = getOrganizationSchema();

    expect(JSON.stringify(schema1)).toBe(JSON.stringify(schema2));
  });
});
