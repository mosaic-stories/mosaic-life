# Storybook Integration Implementation Plan

> **Status:** COMPLETED (2026-03-12)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Storybook as a local development tool for cataloging UI and feature components, with zero production leakage risk.

**Architecture:** Storybook installed as devDependencies in `apps/web/`, using `@storybook/react-vite` to reuse the existing Vite config. Stories colocated next to components. Production safety via `.dockerignore` exclusions, `.gitignore` for build output, and Vite build exclusion.

**Tech Stack:** Storybook 10, @storybook/react-vite, @storybook/addon-docs, msw-storybook-addon, @storybook/addon-a11y, @storybook/addon-themes

**Implementation Notes:**
- Plan originally targeted Storybook 8 but Storybook 10 was installed (latest at time of implementation)
- `@storybook/addon-essentials` was removed in Storybook 10 — replaced with `@storybook/addon-docs` (viewport, controls, actions, interactions are now in core)
- `@storybook/test` also removed (now in core as `storybook/test`)
- Story type imports use `@storybook/react-vite` instead of `@storybook/react` (pnpm hoisting)
- Node.js 20.19+ required for Storybook 10 (was 20.11.0, upgraded via nvm)
- Feature story uses `RecentlyViewedSection` component with MSW mocking

**Design Doc:** [docs/plans/2026-03-12-storybook-integration-design.md](2026-03-12-storybook-integration-design.md)

---

### Task 1: Install Storybook packages

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Install Storybook core and addons as devDependencies**

Run from `apps/web/`:

```bash
cd /apps/mosaic-life/apps/web
pnpm add -D storybook @storybook/react-vite @storybook/addon-essentials @storybook/addon-a11y @storybook/addon-themes msw-storybook-addon @storybook/test
```

**Step 2: Verify installation**

```bash
pnpm ls storybook @storybook/react-vite
```

Expected: Both packages listed under devDependencies.

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "chore: add storybook devDependencies"
```

---

### Task 2: Create Storybook configuration

**Files:**
- Create: `apps/web/.storybook/main.ts`
- Create: `apps/web/.storybook/preview.ts`
- Create: `apps/web/.storybook/preview-head.html`

**Step 1: Create `.storybook/main.ts`**

```typescript
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../src/components/**/*.stories.@(ts|tsx)',
    '../src/features/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    'msw-storybook-addon',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  staticDirs: ['../public'],
};

export default config;
```

**Step 2: Create `.storybook/preview.ts`**

This file sets up global decorators so every story gets Tailwind, theming, routing, and TanStack Query context — matching the real app environment.

```typescript
import type { Preview } from '@storybook/react';
import { initialize, mswLoader } from 'msw-storybook-addon';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import global styles (Tailwind + theme CSS variables)
import '../src/index.css';

// Initialize MSW
initialize();

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  loaders: [mswLoader],
  decorators: [
    (Story) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
          },
        },
      });

      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(Story),
        ),
      );
    },
  ],
};

export default preview;
```

**Step 3: Create `.storybook/preview-head.html`**

```html
<!-- Load fonts to match production typography -->
<style>
  @import url('@fontsource-variable/inter');
  @import url('@fontsource/merriweather');
</style>
```

**Step 4: Verify Storybook starts**

```bash
cd /apps/mosaic-life/apps/web
pnpm storybook dev -p 6006
```

Expected: Storybook opens in browser at `http://localhost:6006`. It may show "No stories found" — that's fine, we add stories in the next task.

Stop Storybook with Ctrl+C.

**Step 5: Commit**

```bash
git add apps/web/.storybook/
git commit -m "chore: add storybook configuration with global decorators"
```

---

### Task 3: Add npm scripts

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Add storybook scripts to package.json**

Add these two entries to the `"scripts"` section in `apps/web/package.json`:

```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build -o storybook-static"
```

**Step 2: Verify the script works**

```bash
cd /apps/mosaic-life/apps/web
pnpm storybook
```

Expected: Storybook starts on port 6006.

Stop with Ctrl+C.

**Step 3: Commit**

```bash
git add apps/web/package.json
git commit -m "chore: add storybook npm scripts"
```

---

### Task 4: Production safety guardrails

**Files:**
- Modify: `apps/web/.dockerignore`
- Modify: `.gitignore`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/tsconfig.json`

**Step 1: Add Storybook exclusions to `.dockerignore`**

Append to the end of `apps/web/.dockerignore`:

```
# Storybook (dev-only tooling)
.storybook/
storybook-static/
**/*.stories.tsx
**/*.stories.ts
```

**Step 2: Add `storybook-static/` to root `.gitignore`**

Append to the end of `.gitignore`:

```
# Storybook build output
storybook-static/
```

**Step 3: Exclude stories from Vite production builds**

In `apps/web/vite.config.ts`, add an `exclude` pattern to the `build` config. Locate the `build` section and add the following after the opening of the build object:

```typescript
build: {
  target: 'esnext',
  outDir: 'dist',
  sourcemap: false,
  // Exclude story files from production builds
  rollupOptions: {
    external: [/\.stories\./],
    output: {
      manualChunks: {
        // ... existing chunks unchanged
      }
    }
  }
}
```

Note: The `external` pattern uses a regex to match any file containing `.stories.` in its path. This is a belt-and-suspenders measure — Vite already won't include these files since they're not in the import graph from `index.html`.

**Step 4: Extend `tsconfig.json` to include `.storybook/` directory**

The current `tsconfig.json` only includes `"src"`. Storybook config files in `.storybook/` need TypeScript support. Update the `include` array:

```json
{
  "include": ["src", ".storybook"]
}
```

**Step 5: Verify production build is unaffected**

```bash
cd /apps/mosaic-life/apps/web
pnpm build
```

Expected: Build succeeds. The `dist/` directory should contain no references to storybook.

```bash
grep -r "storybook\|stories" dist/ || echo "Clean: no storybook references in production build"
```

Expected: "Clean: no storybook references in production build"

**Step 6: Commit**

```bash
git add apps/web/.dockerignore .gitignore apps/web/vite.config.ts apps/web/tsconfig.json
git commit -m "chore: add storybook production safety guardrails"
```

---

### Task 5: Write first story — Button component

**Files:**
- Create: `apps/web/src/components/ui/Button.stories.tsx`

**Step 1: Create the Button story file**

This is the reference story that establishes the pattern for all future stories. Located at `apps/web/src/components/ui/Button.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
    disabled: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Button',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Delete',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost',
  },
};

export const Link: Story = {
  args: {
    variant: 'link',
    children: 'Link Button',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: 'Disabled',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-center">
        <Button variant="default">Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>
      <div className="flex gap-2 items-center">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
      </div>
    </div>
  ),
};
```

**Step 2: Verify the story renders in Storybook**

```bash
cd /apps/mosaic-life/apps/web
pnpm storybook
```

Expected: Storybook opens showing "UI / Button" in the sidebar with all story variants. Click through each variant to confirm rendering. The AllVariants story should show a grid of all button styles.

Stop Storybook with Ctrl+C.

**Step 3: Verify production build is still clean**

```bash
pnpm build
grep -r "storybook\|stories\|AllVariants" dist/ || echo "Clean: no storybook references in production build"
```

Expected: "Clean: no storybook references in production build"

**Step 4: Commit**

```bash
git add apps/web/src/components/ui/Button.stories.tsx
git commit -m "feat: add Button component storybook story as reference pattern"
```

---

### Task 6: Write second story — a feature component with MSW mocking

**Files:**
- Create: one story file for a feature component that needs API mocking

Pick a feature component that uses API data (e.g., a legacy card, media item, or story card). This task establishes the pattern for feature-level stories that need MSW handlers.

**Step 1: Identify a good candidate component**

Look through `apps/web/src/features/` for a component that:
- Renders data from an API response
- Has existing MSW handlers in `src/test/mocks/handlers.ts`
- Is relatively self-contained (not deeply nested dependencies)

**Step 2: Create the story file**

Follow this pattern (using a hypothetical `LegacyCard` as example):

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { LegacyCard } from './LegacyCard';

const meta: Meta<typeof LegacyCard> = {
  title: 'Features/Legacy/LegacyCard',
  component: LegacyCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    legacy: {
      id: 'legacy-1',
      name: 'Grandma Rose',
      description: 'Stories from her life in Brooklyn',
    },
  },
};

export const WithApiData: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/legacies/:id', () => {
          return HttpResponse.json({
            id: 'legacy-1',
            name: 'Grandma Rose',
            description: 'Stories from her life in Brooklyn',
            story_count: 12,
            member_count: 5,
          });
        }),
      ],
    },
  },
};
```

**Step 3: Verify the story renders**

```bash
cd /apps/mosaic-life/apps/web
pnpm storybook
```

Expected: The feature story appears in the sidebar under "Features/" and renders with mocked data.

**Step 4: Commit**

```bash
git add apps/web/src/features/**/*.stories.tsx
git commit -m "feat: add feature component story with MSW mocking pattern"
```

---

### Task 7: Final verification

**Step 1: Verify Storybook starts and shows all stories**

```bash
cd /apps/mosaic-life/apps/web
pnpm storybook
```

Expected: Storybook shows both UI and Feature stories. All render correctly.

**Step 2: Verify Storybook static build works**

```bash
pnpm build-storybook
```

Expected: `storybook-static/` directory created. Verify it's gitignored:

```bash
git status
```

Expected: `storybook-static/` does NOT appear in untracked files.

**Step 3: Verify production build is clean**

```bash
pnpm build
grep -r "storybook\|stories" dist/ || echo "Clean: no storybook references in production build"
```

Expected: "Clean: no storybook references in production build"

**Step 4: Verify Docker build excludes Storybook**

```bash
cd /apps/mosaic-life
docker compose -f infra/compose/docker-compose.yml build web
```

Expected: Build succeeds. The nginx image contains only `dist/` contents, no Storybook files.

**Step 5: Verify linting passes**

```bash
cd /apps/mosaic-life/apps/web
pnpm lint
```

Expected: No lint errors from story files.

**Step 6: Commit any remaining changes**

```bash
git add -A
git status
# Review staged files — should only be story files and config
git commit -m "chore: storybook integration complete"
```
