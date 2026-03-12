# Storybook Integration Design

**Date:** 2026-03-12
**Status:** Approved
**Approach:** Approach A — devDependency with build-time exclusion

## Summary

Add Storybook 8 to `apps/web/` as a local development tool for cataloging and visually developing UI components and feature-level components. Storybook is strictly local — no deployment, no visual regression CI. Production safety is ensured through devDependency isolation, `.dockerignore` exclusions, and Vite's tree-shaking.

## Requirements

- Catalog both shared UI primitives (`src/components/`) and feature components (`src/features/`)
- Stories colocated next to components as `*.stories.tsx`
- No test integration — stories are for visual cataloging; testing stays in Vitest/Playwright
- No visual regression testing (deferred)
- No production deployment of Storybook
- Zero risk of Storybook leaking into production builds or Docker images

## Installation & Configuration

### Packages (all devDependencies)

- `storybook`
- `@storybook/react-vite` (framework + builder, reuses existing Vite config)
- `@storybook/addon-essentials` (controls, actions, viewport, docs)
- `@storybook/addon-a11y` (accessibility checks in Storybook UI)
- `@storybook/addon-themes` (theme switching toolbar)
- `msw-storybook-addon` (reuses existing MSW handlers from `src/test/mocks/`)

### Directory Structure

```
apps/web/
├── .storybook/
│   ├── main.ts          # Framework config, story globs, addons
│   ├── preview.ts       # Global decorators, CSS imports, providers
│   └── preview-head.html # Font loading (Inter, Merriweather)
├── src/
│   ├── components/
│   │   └── ui/
│   │       ├── Button.tsx
│   │       └── Button.stories.tsx    # Colocated story
│   └── features/
│       └── media/
│           └── components/
│               ├── MediaGrid.tsx
│               └── MediaGrid.stories.tsx  # Colocated story
```

### .storybook/main.ts

- Framework: `@storybook/react-vite`
- Story globs: `../src/components/**/*.stories.tsx`, `../src/features/**/*.stories.tsx`
- Addons: essentials, a11y, themes, msw-storybook-addon

### .storybook/preview.ts

Global decorators wrapping all stories with:
- Tailwind styles (global CSS import)
- Theme provider (default: Warm Amber, switchable via toolbar)
- TanStack QueryClientProvider (fresh client per story)
- MemoryRouter (for components using React Router hooks)
- MSW initialization (reusing existing handlers)

### npm Scripts

- `storybook` — starts Storybook dev server on port 6006
- `build-storybook` — builds static output to `storybook-static/` (local use only)

## Production Safety Guardrails

Four layers of protection:

### 1. devDependencies Only

All `@storybook/*` packages are devDependencies. Vite only bundles the dependency graph from `index.html` → `main.tsx`. No app source code imports from `@storybook/*`, so Storybook is never in the bundle.

### 2. .dockerignore Exclusions

Added to `apps/web/.dockerignore`:
```
.storybook/
storybook-static/
**/*.stories.tsx
**/*.stories.ts
```

The Docker build context never sees Storybook files.

### 3. .gitignore Build Output

`storybook-static/` added to `.gitignore` — build output is never committed.

### 4. Vite Build Exclusion

Explicit exclude pattern in `vite.config.ts` for `*.stories.*` files during production builds as a belt-and-suspenders measure, even though they're already excluded by not being in the import graph.

## Story Coverage Strategy

### UI Primitives (`src/components/ui/`)

One story file per component with:
- `Default` story — base state
- Variant stories — props (size, color, disabled, etc.)
- `AllVariants` story — visual grid where applicable

### Navigation & Layout (`src/components/navigation/`, `src/components/dashboard/`)

Stories showing different states (authenticated/unauthenticated, mobile/desktop viewport) using Storybook's viewport addon.

### Feature Components (`src/features/`)

Stories for main exported components of each feature module. API responses mocked via `msw-storybook-addon` reusing existing MSW handlers from `src/test/mocks/`.

## What This Design Does NOT Include

- Visual regression testing (Chromatic, screenshot comparison) — deferred
- CI integration for Storybook builds — deferred
- Deployed Storybook instance — strictly local
- Storybook interaction tests / play functions — testing stays in Vitest/Playwright
