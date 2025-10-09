import { test, expect } from '@playwright/test';

/**
 * Basic smoke tests for the Mosaic Life application
 */

test.describe('Application Smoke Tests', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to be loaded
    await page.waitForLoadState('networkidle');
    
    // Check that the page loaded successfully
    await expect(page).toHaveTitle(/Mosaic Life/i);
  });

  test('should have accessible navigation', async ({ page }) => {
    await page.goto('/');
    
    // Check for main navigation elements
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});
