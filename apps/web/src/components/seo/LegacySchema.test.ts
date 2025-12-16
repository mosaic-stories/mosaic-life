// apps/web/src/components/seo/LegacySchema.test.ts

import { describe, it, expect } from 'vitest';
import { getLegacySchema, LegacySchemaInput } from './LegacySchema';

describe('getLegacySchema', () => {
  const baseLegacy: LegacySchemaInput = {
    id: 'abc123',
    name: 'John Doe',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-06-20T14:30:00Z',
  };

  it('returns valid Schema.org ProfilePage structure', () => {
    const schema = getLegacySchema(baseLegacy);

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('ProfilePage');
  });

  it('includes Person as mainEntity', () => {
    const schema = getLegacySchema(baseLegacy);

    expect(schema.mainEntity['@type']).toBe('Person');
    expect(schema.mainEntity.name).toBe('John Doe');
  });

  it('includes timestamps', () => {
    const schema = getLegacySchema(baseLegacy);

    expect(schema.dateCreated).toBe('2024-01-15T10:00:00Z');
    expect(schema.dateModified).toBe('2024-06-20T14:30:00Z');
  });

  it('generates correct legacy URL', () => {
    const schema = getLegacySchema(baseLegacy);

    expect(schema.url).toBe('https://mosaiclife.me/legacy/abc123');
  });

  it('includes biography when provided', () => {
    const legacyWithBio: LegacySchemaInput = {
      ...baseLegacy,
      biography: 'A wonderful person who loved gardening.',
    };
    const schema = getLegacySchema(legacyWithBio);

    expect(schema.mainEntity.description).toBe('A wonderful person who loved gardening.');
  });

  it('excludes biography when null', () => {
    const schema = getLegacySchema({ ...baseLegacy, biography: null });

    expect(schema.mainEntity.description).toBeUndefined();
  });

  it('includes profile image when provided', () => {
    const legacyWithImage: LegacySchemaInput = {
      ...baseLegacy,
      profileImageUrl: 'https://example.com/photo.jpg',
    };
    const schema = getLegacySchema(legacyWithImage);

    expect(schema.mainEntity.image).toBe('https://example.com/photo.jpg');
  });

  it('excludes profile image when null', () => {
    const schema = getLegacySchema({ ...baseLegacy, profileImageUrl: null });

    expect(schema.mainEntity.image).toBeUndefined();
  });

  it('includes birth date when provided', () => {
    const legacyWithBirth: LegacySchemaInput = {
      ...baseLegacy,
      birthDate: '1945-03-20',
    };
    const schema = getLegacySchema(legacyWithBirth);

    expect(schema.mainEntity.birthDate).toBe('1945-03-20');
  });

  it('excludes birth date when null', () => {
    const schema = getLegacySchema({ ...baseLegacy, birthDate: null });

    expect(schema.mainEntity.birthDate).toBeUndefined();
  });

  it('includes death date when provided', () => {
    const legacyWithDeath: LegacySchemaInput = {
      ...baseLegacy,
      deathDate: '2023-11-15',
    };
    const schema = getLegacySchema(legacyWithDeath);

    expect(schema.mainEntity.deathDate).toBe('2023-11-15');
  });

  it('excludes death date when null', () => {
    const schema = getLegacySchema({ ...baseLegacy, deathDate: null });

    expect(schema.mainEntity.deathDate).toBeUndefined();
  });

  it('handles complete legacy with all fields', () => {
    const completeLegacy: LegacySchemaInput = {
      id: 'full-legacy',
      name: 'Jane Smith',
      biography: 'A beloved teacher and mentor.',
      profileImageUrl: 'https://example.com/jane.jpg',
      birthDate: '1950-05-10',
      deathDate: '2023-12-01',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };
    const schema = getLegacySchema(completeLegacy);

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('ProfilePage');
    expect(schema.mainEntity['@type']).toBe('Person');
    expect(schema.mainEntity.name).toBe('Jane Smith');
    expect(schema.mainEntity.description).toBe('A beloved teacher and mentor.');
    expect(schema.mainEntity.image).toBe('https://example.com/jane.jpg');
    expect(schema.mainEntity.birthDate).toBe('1950-05-10');
    expect(schema.mainEntity.deathDate).toBe('2023-12-01');
    expect(schema.url).toBe('https://mosaiclife.me/legacy/full-legacy');
  });
});
