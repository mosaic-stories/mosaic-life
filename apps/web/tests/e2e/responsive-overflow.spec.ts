import { test, expect } from '@playwright/test';

const longLegacyName =
  'An exceptionally long public legacy name that previously could force cards and surrounding dashboard-style grids wider than the available desktop viewport';

const exploreLegaciesPayload = Array.from({ length: 4 }, (_, index) => ({
  id: `legacy-${index + 1}`,
  name: `${longLegacyName} ${index + 1}`,
  birth_date: '1950-01-01',
  death_date: '2020-12-31',
  biography:
    'Long biography content to mimic production records and confirm the shared legacy card remains constrained inside its responsive grid track.',
  visibility: 'public',
  created_by: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  members: [{ user_id: 'member-1', email: 'member@example.com', role: 'creator', joined_at: '2025-01-01' }],
  profile_image_url: null,
  story_count: 3,
}));

test.describe('Responsive Overflow Guards', () => {
  test('keeps the explore legacy grid inside the desktop viewport with long content', async ({ page }) => {
    await page.route('**/api/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Unauthorized' }),
      });
    });

    await page.route('**/api/legacies/explore**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(exploreLegaciesPayload),
      });
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Explore Legacies' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`${longLegacyName} 1`, 'i') })).toBeVisible();

    const measurements = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));

    expect(measurements.bodyScrollWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
    expect(measurements.documentScrollWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
  });
});