import { describe, it, expect } from 'vitest';
import { SECTIONS, getActiveSection } from './navigation';

describe('SECTIONS', () => {
  it('has 3 top-level sections', () => {
    expect(SECTIONS).toHaveLength(3);
  });

  it('defines My Mosaic, Explore, and Community sections', () => {
    const keys = SECTIONS.map((s) => s.key);
    expect(keys).toEqual(['my', 'explore', 'community']);
  });

  it('My Mosaic has 6 sub-items', () => {
    const mySection = SECTIONS.find((s) => s.key === 'my');
    expect(mySection?.items).toHaveLength(6);
  });

  it('Explore has 4 sub-items', () => {
    const exploreSection = SECTIONS.find((s) => s.key === 'explore');
    expect(exploreSection?.items).toHaveLength(4);
  });

  it('Community has no sub-items', () => {
    const communitySection = SECTIONS.find((s) => s.key === 'community');
    expect(communitySection?.items).toBeUndefined();
  });

  it('each section has key, label, icon, and path', () => {
    for (const section of SECTIONS) {
      expect(section.key).toBeTruthy();
      expect(section.label).toBeTruthy();
      expect(section.icon).toBeTruthy();
      expect(section.path).toBeTruthy();
    }
  });

  it('each sub-item has label, path, and icon', () => {
    for (const section of SECTIONS) {
      for (const item of section.items ?? []) {
        expect(item.label).toBeTruthy();
        expect(item.path).toBeTruthy();
        expect(item.icon).toBeTruthy();
      }
    }
  });
});

describe('getActiveSection', () => {
  it('returns My Mosaic for /my paths', () => {
    expect(getActiveSection('/my/overview')?.key).toBe('my');
    expect(getActiveSection('/my/legacies')?.key).toBe('my');
  });

  it('returns Explore for /explore paths', () => {
    expect(getActiveSection('/explore/legacies')?.key).toBe('explore');
    expect(getActiveSection('/explore/people')?.key).toBe('explore');
  });

  it('returns Community for /community', () => {
    expect(getActiveSection('/community')?.key).toBe('community');
  });

  it('returns undefined for unknown paths', () => {
    expect(getActiveSection('/settings')).toBeUndefined();
    expect(getActiveSection('/legacy/123')).toBeUndefined();
  });
});
