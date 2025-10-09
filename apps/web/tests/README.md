# E2E Tests

End-to-end tests for Mosaic Life using Playwright.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker and Docker Compose (for running backend services)

## Installation

From the `apps/web` directory:

```bash
# Install dependencies (includes Playwright)
pnpm install

# Install Playwright browsers
pnpm exec playwright install chromium
```

## Running Tests

### Run all tests

```bash
pnpm test:e2e
```

### Run tests in UI mode (interactive)

```bash
pnpm test:e2e:ui
```

### Run tests in debug mode

```bash
pnpm test:e2e:debug
```

### Run specific test file

```bash
pnpm exec playwright test tests/e2e/smoke.spec.ts
```

## Test Structure

Tests are located in `tests/e2e/`:

- `smoke.spec.ts` - Basic smoke tests to verify the app loads

## Configuration

Playwright configuration is in `playwright.config.ts`. Key settings:

- **Base URL**: `http://localhost:4173` (Vite preview server)
- **Browsers**: Chromium only (for CI efficiency)
- **Retries**: 2 on CI, 0 locally
- **Reporters**: HTML, JSON, and JUnit

## CI/CD

Tests run automatically on:
- Pull requests to `main` and `develop`
- Pushes to `main` and `develop`
- Daily at 2 AM UTC
- Manual workflow dispatch

Test artifacts (reports, videos, screenshots) are uploaded and retained for 30 days.

## Writing Tests

Follow these guidelines:

1. **Accessibility**: Use semantic selectors and test keyboard navigation
2. **Waiting**: Use Playwright's auto-waiting features
3. **Isolation**: Each test should be independent
4. **Assertions**: Use Playwright's expect API

Example:

```typescript
import { test, expect } from '@playwright/test';

test('should display welcome message', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
});
```

## Troubleshooting

### Tests fail locally but pass in CI

- Ensure all dependencies are installed: `pnpm install`
- Check that backend services are running: `docker compose -f infra/compose/docker-compose.yml up`
- Verify the frontend is built: `pnpm run build`

### Browser not found

```bash
pnpm exec playwright install chromium
```

### Slow tests

- Use `page.waitForLoadState('networkidle')` sparingly
- Prefer specific element waits over generic timeouts
- Consider running tests in parallel (already configured)

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)
