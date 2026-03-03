import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from './navigation';

describe('NAV_ITEMS', () => {
  it('has 5 navigation items', () => {
    expect(NAV_ITEMS).toHaveLength(5);
  });

  it('defines Home as first item pointing to /', () => {
    expect(NAV_ITEMS[0]).toMatchObject({
      label: 'Home',
      path: '/',
    });
  });

  it('includes all expected routes', () => {
    const paths = NAV_ITEMS.map((item) => item.path);
    expect(paths).toEqual(['/', '/legacies', '/stories', '/conversations', '/community']);
  });

  it('each item has label, path, and icon', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.path).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });
});
