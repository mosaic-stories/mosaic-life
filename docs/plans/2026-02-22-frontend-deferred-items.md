# Frontend Deferred Items Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close out the 6 remaining deferred items from the 2026-02-21 frontend architecture refactoring, plus cleanup of unused re-export shims.

**Architecture:** All changes are in `apps/web/`. Tasks are independent — no task depends on another's output. The 401 interceptor modifies the shared API client; MSW adds test infrastructure; bundle analysis adds build tooling; image upload wires existing hooks into the editor toolbar; theme migration is mechanical find-and-replace; shim deletion removes dead code.

**Tech Stack:** React 18, TypeScript, Vite 7, Vitest 4, TanStack Query 5, Zustand 5, MSW 2, TipTap 3, Tailwind CSS 3.4

---

### Task 1: Delete Re-export Shims

The barrel files `src/lib/api/index.ts` and `src/lib/hooks/index.ts` re-export from feature modules but have zero consumers — all imports use direct paths.

**Files:**
- Delete: `apps/web/src/lib/api/index.ts`
- Delete: `apps/web/src/lib/hooks/index.ts`

**Step 1: Delete the barrel files**

Delete these two files:
- `apps/web/src/lib/api/index.ts`
- `apps/web/src/lib/hooks/index.ts`

**Step 2: Verify no imports break**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Zero errors

Run: `cd apps/web && npx vite build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/web/src/lib/api/index.ts apps/web/src/lib/hooks/index.ts
git commit -m "chore: delete unused barrel re-export shims

Both lib/api/index.ts and lib/hooks/index.ts had zero consumers —
all imports use direct feature module paths."
```

---

### Task 2: Global 401 Interceptor

Auth uses React Context (`AuthContext.tsx`) with `user` state. The API client in `src/lib/api/client.ts` has a `handleResponse()` function that throws `ApiError` for all HTTP errors. We need to intercept 401s before throwing, clear the user state, and redirect to home.

Since auth is in React Context (not Zustand), we can't call `getState()` from outside React. Instead, we'll dispatch a custom DOM event that `AuthProvider` listens for.

**Files:**
- Modify: `apps/web/src/lib/api/client.ts:14-29`
- Modify: `apps/web/src/contexts/AuthContext.tsx`

**Step 1: Add 401 detection to `handleResponse` in `client.ts`**

In `apps/web/src/lib/api/client.ts`, add a 401 check inside the `if (!response.ok)` block, before the `throw`:

```typescript
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // On 401 Unauthorized, dispatch event so AuthProvider can clear session
    if (response.status === 401) {
      window.dispatchEvent(new Event('auth:expired'));
    }

    let errorData: unknown;
    let bodyText: string | null = null;
    try {
      bodyText = await response.text();
      errorData = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
      errorData = bodyText ?? undefined;
    }
    throw new ApiError(
      response.status,
      `API Error: ${response.status} ${response.statusText}`,
      errorData
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
```

**Step 2: Listen for `auth:expired` in `AuthContext.tsx`**

In `apps/web/src/contexts/AuthContext.tsx`, add a `useEffect` inside `AuthProvider` that listens for the event:

```typescript
// Listen for 401 events from API client
useEffect(() => {
  const handleAuthExpired = () => {
    setUser(null);
    // Only redirect if on a protected page (not already on a public page)
    const publicPaths = ['/', '/about', '/how-it-works'];
    if (!publicPaths.includes(window.location.pathname)) {
      window.location.href = '/';
    }
  };

  window.addEventListener('auth:expired', handleAuthExpired);
  return () => window.removeEventListener('auth:expired', handleAuthExpired);
}, []);
```

Place this after the existing `useEffect(() => { refreshUser(); }, [refreshUser]);` block (after line 54).

**Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Zero errors

**Step 4: Run existing tests**

Run: `cd apps/web && npx vitest run`
Expected: All 18 test files pass (119+ tests)

**Step 5: Commit**

```bash
git add apps/web/src/lib/api/client.ts apps/web/src/contexts/AuthContext.tsx
git commit -m "feat: add global 401 interceptor

API client dispatches 'auth:expired' event on 401 responses.
AuthProvider listens and clears session, redirecting to home
from protected pages."
```

---

### Task 3: Bundle Analysis Tooling

**Files:**
- Modify: `apps/web/package.json` (add devDependency + script)
- Modify: `apps/web/vite.config.ts` (add plugin)
- Modify: `.gitignore` (add stats.html)

**Step 1: Install rollup-plugin-visualizer**

Run: `cd apps/web && pnpm add -D rollup-plugin-visualizer`

**Step 2: Add visualizer plugin to `vite.config.ts`**

Add the import at the top of `apps/web/vite.config.ts`:

```typescript
import { visualizer } from 'rollup-plugin-visualizer'
```

Add to the `plugins` array (after `react()`):

```typescript
plugins: [
  react(),
  visualizer({
    filename: 'dist/stats.html',
    open: false,
    gzipSize: true,
  }),
],
```

**Step 3: Add `analyze` script to `package.json`**

In `apps/web/package.json`, add to the `"scripts"` section:

```json
"analyze": "vite build && open dist/stats.html"
```

**Step 4: Add stats.html to `.gitignore`**

In the root `.gitignore`, under the `# Production builds` section, add:

```
# Bundle analysis
**/dist/stats.html
```

**Step 5: Verify build still works**

Run: `cd apps/web && npx vite build`
Expected: Build succeeds and `dist/stats.html` is generated

**Step 6: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts .gitignore
git commit -m "chore: add bundle analysis with rollup-plugin-visualizer

Generates dist/stats.html on every build. Run 'pnpm analyze' to
build and open the visualization."
```

---

### Task 4: Image Upload in Editor Toolbar

The editor toolbar currently uses `window.prompt('Enter image URL:')`. We need to wire it to the existing `useMediaUpload` hook which handles S3 presigned URL uploads.

The prop chain is: `StoryCreation` (has `legacyId`) → `StoryEditForm` → `StoryEditor` → `EditorToolbar`.

**Files:**
- Modify: `apps/web/src/features/editor/components/EditorToolbar.tsx`
- Modify: `apps/web/src/features/editor/components/StoryEditor.tsx:7-12,14,39`
- Modify: `apps/web/src/features/story/components/StoryEditForm.tsx:7-17,89-93`
- Modify: `apps/web/src/features/story/components/StoryCreation.tsx:336`

**Step 1: Add `legacyId` prop to `StoryEditor`**

In `apps/web/src/features/editor/components/StoryEditor.tsx`, add `legacyId` to the props interface:

```typescript
interface StoryEditorProps {
  content: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  legacyId?: string;
}
```

Update the component signature and pass it to EditorToolbar:

```typescript
export default function StoryEditor({
  content,
  onChange,
  readOnly = false,
  placeholder,
  legacyId,
}: StoryEditorProps) {
```

Update the EditorToolbar usage (line 39):

```typescript
{!readOnly && <EditorToolbar editor={editor} legacyId={legacyId} />}
```

**Step 2: Rewrite `EditorToolbar` to use file upload**

Replace the full `apps/web/src/features/editor/components/EditorToolbar.tsx`:

```typescript
import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  LinkIcon,
  ImageIcon,
  Undo,
  Redo,
  Minus,
  Loader2,
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { useMediaUpload } from '@/features/media/hooks/useMedia';

interface EditorToolbarProps {
  editor: Editor;
  legacyId?: string;
}

export default function EditorToolbar({ editor, legacyId }: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useMediaUpload(legacyId);

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const media = await upload.mutateAsync(file);
      editor.chain().focus().setImage({ src: media.download_url }).run();
    } catch {
      // Upload failed — useMediaUpload handles error state
    }

    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-neutral-200 px-2 py-1.5 bg-neutral-50 rounded-t-lg">
      <Toggle
        size="sm"
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
      >
        <Bold className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
      >
        <Italic className="size-4" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Toggle
        size="sm"
        pressed={editor.isActive('heading', { level: 2 })}
        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="Heading 2"
      >
        <Heading2 className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('heading', { level: 3 })}
        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        aria-label="Heading 3"
      >
        <Heading3 className="size-4" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Toggle
        size="sm"
        pressed={editor.isActive('bulletList')}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Bullet list"
      >
        <List className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('orderedList')}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Ordered list"
      >
        <ListOrdered className="size-4" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Toggle
        size="sm"
        pressed={editor.isActive('blockquote')}
        onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
        aria-label="Blockquote"
      >
        <Quote className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={false}
        onPressedChange={() => editor.chain().focus().setHorizontalRule().run()}
        aria-label="Horizontal rule"
      >
        <Minus className="size-4" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Toggle
        size="sm"
        pressed={editor.isActive('link')}
        onPressedChange={addLink}
        aria-label="Link"
      >
        <LinkIcon className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={false}
        onPressedChange={handleImageClick}
        disabled={upload.isPending}
        aria-label="Image"
      >
        {upload.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ImageIcon className="size-4" />
        )}
      </Toggle>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleFileSelected}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Toggle
        size="sm"
        pressed={false}
        onPressedChange={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        aria-label="Undo"
      >
        <Undo className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={false}
        onPressedChange={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        aria-label="Redo"
      >
        <Redo className="size-4" />
      </Toggle>
    </div>
  );
}
```

**Step 3: Thread `legacyId` through `StoryEditForm`**

In `apps/web/src/features/story/components/StoryEditForm.tsx`, add `legacyId` to the props interface:

```typescript
interface StoryEditFormProps {
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (content: string) => void;
  visibility: 'public' | 'private' | 'personal';
  onVisibilityChange: (visibility: 'public' | 'private' | 'personal') => void;
  selectedLegacies: LegacyAssociationInput[];
  onLegaciesChange: (legacies: LegacyAssociationInput[]) => void;
  isMutating: boolean;
  legacyId?: string;
}
```

Update the destructuring and pass to StoryEditor:

```typescript
export default function StoryEditForm({
  title,
  onTitleChange,
  content,
  onContentChange,
  visibility,
  onVisibilityChange,
  selectedLegacies,
  onLegaciesChange,
  isMutating,
  legacyId,
}: StoryEditFormProps) {
```

Update the StoryEditor usage (around line 89-93):

```typescript
<StoryEditor
  content={content}
  onChange={onContentChange}
  placeholder="Start writing your story here..."
  legacyId={legacyId}
/>
```

**Step 4: Pass `legacyId` from `StoryCreation` to `StoryEditForm`**

In `apps/web/src/features/story/components/StoryCreation.tsx`, update the `StoryEditForm` usage (around line 336):

```typescript
<StoryEditForm
  title={title}
  onTitleChange={setTitle}
  content={content}
  onContentChange={setContent}
  visibility={visibility}
  onVisibilityChange={setVisibility}
  selectedLegacies={selectedLegacies}
  onLegaciesChange={setSelectedLegacies}
  isMutating={isMutating}
  legacyId={legacyId}
/>
```

**Step 5: Update barrel export if needed**

Check `apps/web/src/features/editor/index.ts` — it already exports `EditorToolbar`, so no change needed.

**Step 6: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Zero errors

**Step 7: Run tests**

Run: `cd apps/web && npx vitest run`
Expected: All tests pass

**Step 8: Commit**

```bash
git add apps/web/src/features/editor/components/EditorToolbar.tsx \
       apps/web/src/features/editor/components/StoryEditor.tsx \
       apps/web/src/features/story/components/StoryEditForm.tsx \
       apps/web/src/features/story/components/StoryCreation.tsx
git commit -m "feat: wire image upload to editor toolbar

Replace window.prompt URL input with file picker that uploads
via useMediaUpload (S3 presigned URL). Shows spinner during upload.
Thread legacyId from StoryCreation → StoryEditForm → StoryEditor → EditorToolbar."
```

---

### Task 5: MSW Test Baseline

Install MSW, create handlers for core API endpoints, wire into test setup, and migrate one test file (`useVersions.test.ts`) as proof of the pattern.

**Files:**
- Modify: `apps/web/package.json` (add devDependency)
- Create: `apps/web/src/test/mocks/handlers.ts`
- Create: `apps/web/src/test/mocks/server.ts`
- Modify: `apps/web/src/test/setup.ts`
- Modify: `apps/web/src/features/story/hooks/useVersions.test.ts`

**Step 1: Install MSW**

Run: `cd apps/web && pnpm add -D msw`

**Step 2: Create mock handlers**

Create `apps/web/src/test/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw';

// Default mock data
const defaultUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
};

export const handlers = [
  // Auth
  http.get('/api/me', () => {
    return HttpResponse.json(defaultUser);
  }),

  http.post('/api/auth/logout', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Legacies
  http.get('/api/legacies/', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/legacies/:id', () => {
    return HttpResponse.json({
      id: 'legacy-1',
      name: 'Test Legacy',
    });
  }),

  // Stories
  http.get('/api/stories/:id', () => {
    return HttpResponse.json({
      id: 'story-1',
      title: 'Test Story',
      content: 'Test content',
      visibility: 'private',
      legacies: [],
      version_count: 1,
    });
  }),

  // Versions
  http.get('/api/stories/:storyId/versions', () => {
    return HttpResponse.json({
      versions: [],
      total: 0,
      page: 1,
      page_size: 20,
      warning: null,
    });
  }),

  http.get('/api/stories/:storyId/versions/:versionNumber', () => {
    return HttpResponse.json({
      version_number: 1,
      title: 'Test Story',
      content: 'Test content',
      status: 'active',
      source: 'creation',
      source_version: null,
      change_summary: null,
      stale: false,
      created_by: 'user-1',
      created_at: '2026-02-15T10:00:00Z',
    });
  }),

  // Media
  http.get('/api/media/', () => {
    return HttpResponse.json([]);
  }),
];
```

**Step 3: Create MSW server**

Create `apps/web/src/test/mocks/server.ts`:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

**Step 4: Wire MSW into test setup**

Replace `apps/web/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom';
import { server } from './mocks/server';

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));

// Reset handlers between tests (removes any runtime overrides)
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
```

**Step 5: Verify all existing tests still pass**

Run: `cd apps/web && npx vitest run`
Expected: All 18 test files pass. Existing `vi.mock()` tests are unaffected because `vi.mock` takes precedence over MSW (it intercepts at the module level, not the network level).

**Step 6: Migrate `useVersions.test.ts` to MSW**

Replace `apps/web/src/features/story/hooks/useVersions.test.ts` with MSW-based version:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { versionKeys, useVersions, useVersionDetail } from './useVersions';
import type { VersionListResponse, VersionDetail } from '@/features/story/api/versions';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const mockVersionsResponse: VersionListResponse = {
  versions: [
    {
      version_number: 2,
      status: 'active',
      source: 'edit',
      source_version: null,
      change_summary: 'Updated title',
      stale: false,
      created_by: 'user-1',
      created_at: '2026-02-16T10:00:00Z',
    },
    {
      version_number: 1,
      status: 'inactive',
      source: 'creation',
      source_version: null,
      change_summary: null,
      stale: false,
      created_by: 'user-1',
      created_at: '2026-02-15T10:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  warning: null,
};

const mockVersionDetail: VersionDetail = {
  version_number: 1,
  title: 'Original Title',
  content: 'Original content',
  status: 'inactive',
  source: 'creation',
  source_version: null,
  change_summary: null,
  stale: false,
  created_by: 'user-1',
  created_at: '2026-02-15T10:00:00Z',
};

describe('versionKeys', () => {
  it('generates correct key hierarchy', () => {
    expect(versionKeys.all).toEqual(['versions']);
    expect(versionKeys.list('story-1')).toEqual(['versions', 'story-1', 'list']);
    expect(versionKeys.detail('story-1', 3)).toEqual(['versions', 'story-1', 'detail', 3]);
  });
});

describe('useVersions', () => {
  beforeEach(() => {
    // Override default handler with test-specific data
    server.use(
      http.get('/api/stories/:storyId/versions', () => {
        return HttpResponse.json(mockVersionsResponse);
      })
    );
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(() => useVersions('story-1', false), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
  });

  it('fetches versions when enabled', async () => {
    const { result } = renderHook(() => useVersions('story-1', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockVersionsResponse);
  });
});

describe('useVersionDetail', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/stories/:storyId/versions/:versionNumber', () => {
        return HttpResponse.json(mockVersionDetail);
      })
    );
  });

  it('does not fetch when versionNumber is null', () => {
    const { result } = renderHook(() => useVersionDetail('story-1', null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
  });

  it('fetches version detail when versionNumber is provided', async () => {
    const { result } = renderHook(() => useVersionDetail('story-1', 1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockVersionDetail);
  });
});
```

**Step 7: Run tests to verify migration**

Run: `cd apps/web && npx vitest run`
Expected: All tests pass including the migrated `useVersions.test.ts`

**Step 8: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml \
       apps/web/src/test/mocks/handlers.ts \
       apps/web/src/test/mocks/server.ts \
       apps/web/src/test/setup.ts \
       apps/web/src/features/story/hooks/useVersions.test.ts
git commit -m "feat: add MSW test baseline with core API handlers

Install msw, create handlers for auth/legacies/stories/media/versions,
wire server into test setup. Migrate useVersions.test.ts as proof
of the pattern. Both vi.mock and MSW patterns coexist."
```

---

### Task 6: Full `bg-theme-*` CSS Migration

Replace all 238 instances of verbose `[rgb(var(--theme-*))]` syntax with the registered Tailwind shorthand across ~52 files. The Tailwind config already has `theme-primary`, `theme-accent`, etc. registered under `extend.colors`.

**Files:**
- Modify: ~52 files across `apps/web/src/`

**Step 1: Run the migration**

This is a mechanical find-and-replace. The patterns to replace:

For each theme token (`primary`, `primary-light`, `primary-dark`, `accent`, `accent-light`, `gradient-from`, `gradient-to`, `background`, `surface`):
- `[rgb(var(--theme-TOKEN))]` → `theme-TOKEN`

This works for all CSS property prefixes (`bg-`, `text-`, `border-`, `ring-`, `from-`, `to-`, `hover:bg-`, `focus-within:border-`, etc.) because only the value portion changes — the Tailwind prefix stays.

Handle opacity modifiers: `[rgb(var(--theme-TOKEN))]/NN` → `theme-TOKEN/NN`

Use `sed` or equivalent to perform the replacements across all `.tsx` and `.ts` files in `apps/web/src/`.

The replacements (in order, most specific first to avoid partial matches):
1. `[rgb(var(--theme-primary-light))]` → `theme-primary-light`
2. `[rgb(var(--theme-primary-dark))]` → `theme-primary-dark`
3. `[rgb(var(--theme-primary))]` → `theme-primary`
4. `[rgb(var(--theme-accent-light))]` → `theme-accent-light`
5. `[rgb(var(--theme-accent))]` → `theme-accent`
6. `[rgb(var(--theme-gradient-from))]` → `theme-gradient-from`
7. `[rgb(var(--theme-gradient-to))]` → `theme-gradient-to`
8. `[rgb(var(--theme-background))]` → `theme-background`
9. `[rgb(var(--theme-surface))]` → `theme-surface`

**Step 2: Verify no verbose syntax remains**

Run: `cd apps/web && grep -r "rgb(var(--theme-" src/ --include="*.tsx" --include="*.ts" | wc -l`
Expected: 0

**Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Zero errors

**Step 4: Run tests**

Run: `cd apps/web && npx vitest run`
Expected: All tests pass

**Step 5: Build**

Run: `cd apps/web && npx vite build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add apps/web/src/
git commit -m "refactor: migrate all theme CSS to Tailwind shorthand

Replace 238 instances of verbose bg-[rgb(var(--theme-*))] syntax
with registered bg-theme-* shorthand across 52 files. Both syntaxes
were supported since Phase 1C; this completes the migration."
```

---

## Final Verification

After all tasks are complete:

| Check | Command | Expected |
|-------|---------|----------|
| TypeScript | `cd apps/web && npx tsc --noEmit` | Zero errors |
| Tests | `cd apps/web && npx vitest run` | All pass |
| Build | `cd apps/web && npx vite build` | Succeeds |
| No verbose theme CSS | `grep -r "rgb(var(--theme-" apps/web/src/ \| wc -l` | 0 |
| No barrel imports | `grep -r "from '@/lib/api'" apps/web/src/ \| wc -l` | 0 |
| Stats generated | `ls apps/web/dist/stats.html` | File exists |
