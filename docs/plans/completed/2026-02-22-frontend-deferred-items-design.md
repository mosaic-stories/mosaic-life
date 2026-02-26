# Frontend Deferred Items — Design

**Date:** 2026-02-22
**Branch:** `develop`
**Scope:** Close out remaining deferred items from the 2026-02-21 frontend architecture refactoring

---

## Context

The frontend architecture refactoring (2026-02-21) deferred 8 items. Investigation shows 2 are already complete (MediaGallery real API, image upload hooks), 1 is safe to delete immediately (re-export shims), and 1 was dropped after analysis (DOMPurify — content is stored as Markdown, not HTML, so TipTap's schema-based parsing provides sufficient protection). That leaves 5 items of real work plus the shim cleanup.

## Items

### 1. Global 401 Interceptor

**Problem:** `handleResponse()` in `lib/api/client.ts` throws a generic `ApiError` for all HTTP errors. When a session expires, API calls fail silently with no redirect to login.

**Design:** Add a 401 check in `handleResponse()` before throwing. On 401:
- Call `useAuthStore.getState().clearSession()` (Zustand allows non-React access via `getState()`)
- Redirect to the home/login page via `window.location.href = '/'`
- Skip the redirect if already on a public page (avoid redirect loops)

This catches every API call — queries, mutations, and raw fetches — with ~10 lines in one file.

**Files:** `src/lib/api/client.ts`, `src/lib/hooks/useAuth.ts` (verify clearSession exists)

### 2. MSW Test Baseline

**Problem:** Tests use `vi.mock()` for every API module. This is brittle (mocks break when imports change) and doesn't test the HTTP layer.

**Design:**
- Install `msw` as devDependency
- Create `src/test/mocks/handlers.ts` with handlers for core endpoints: auth (`/api/auth/*`), legacies (`/api/legacies/*`), stories (`/api/stories/*`), media (`/api/media/*`)
- Create `src/test/mocks/server.ts` with MSW `setupServer()`
- Wire into `src/test/setup.ts` with `beforeAll`/`afterEach`/`afterAll` lifecycle
- Migrate 2-3 existing test files to validate the pattern (e.g., `useVersions.test.ts`, `StoryCreation.test.tsx`)
- Both patterns (`vi.mock` and MSW) coexist — remaining tests migrate incrementally

**Files:** `package.json`, `src/test/mocks/handlers.ts` (new), `src/test/mocks/server.ts` (new), `src/test/setup.ts`, 2-3 test files

### 3. Bundle Analysis Tooling

**Problem:** No way to visualize bundle size or track regressions. Manual chunks exist but there's no feedback on their effectiveness.

**Design:**
- Install `rollup-plugin-visualizer` as devDependency
- Add to `vite.config.ts` plugins array with `{ filename: 'dist/stats.html', open: false, gzipSize: true }`
- Add `dist/stats.html` to `.gitignore`
- Add `"analyze": "vite build && open dist/stats.html"` script to `package.json`

**Files:** `package.json`, `vite.config.ts`, `.gitignore`

### 4. Image Upload in Editor Toolbar

**Problem:** Editor toolbar's image button uses `window.prompt('Enter image URL:')`. The real `useMediaUpload` hook (S3 presigned URL flow) exists but isn't wired in.

**Design:**
- Add a hidden `<input type="file" accept="image/*">` in `EditorToolbar`
- Image button click triggers the file input
- On file selection, call the existing `useMediaUpload` hook to upload to S3
- On success, insert the returned URL via `editor.chain().focus().setImage({ src }).run()`
- Show a loading/disabled state on the image button during upload
- `EditorToolbar` needs to accept a `legacyId` prop (required by `useMediaUpload`) — thread it from `StoryEditForm` through `StoryEditor`

**Files:** `src/features/editor/components/EditorToolbar.tsx`, `src/features/editor/components/StoryEditor.tsx`, `src/features/story/components/StoryEditForm.tsx`

### 5. Full `bg-theme-*` CSS Migration

**Problem:** 238 instances of verbose `[rgb(var(--theme-*))]` syntax across 52 files. The Tailwind config already has shorthand tokens registered (`bg-theme-primary`, etc.) but zero files use them.

**Design:** Mechanical find-and-replace across all files. Replacement patterns:

| Old | New |
|-----|-----|
| `bg-[rgb(var(--theme-primary))]` | `bg-theme-primary` |
| `bg-[rgb(var(--theme-primary-light))]` | `bg-theme-primary-light` |
| `bg-[rgb(var(--theme-primary-dark))]` | `bg-theme-primary-dark` |
| `bg-[rgb(var(--theme-accent))]` | `bg-theme-accent` |
| `bg-[rgb(var(--theme-accent-light))]` | `bg-theme-accent-light` |
| `bg-[rgb(var(--theme-background))]` | `bg-theme-background` |
| `bg-[rgb(var(--theme-surface))]` | `bg-theme-surface` |
| `from-[rgb(var(--theme-gradient-from))]` | `from-theme-gradient-from` |
| `to-[rgb(var(--theme-gradient-to))]` | `to-theme-gradient-to` |

Same pattern for `text-`, `border-`, `ring-`, `hover:`, `focus-within:`, and other variant prefixes. The variant prefix stays, only the value part changes.

Opacity modifiers are preserved: `ring-[rgb(var(--theme-primary))]/20` → `ring-theme-primary/20`.

**Verification:** TypeScript build + visual spot-check that theme colors still apply.

**Files:** ~52 files across `src/`

### 6. Delete Re-export Shims

**Problem:** `src/lib/api/index.ts` and `src/lib/hooks/index.ts` re-export from feature modules for migration compatibility. Investigation shows zero consumers import from these barrel files — all imports use direct paths.

**Design:** Delete both files. Verify with `npx tsc --noEmit` and `vite build`.

**Files:** `src/lib/api/index.ts`, `src/lib/hooks/index.ts`

---

## Dropped Items

### DOMPurify Sanitization — Not Needed

The completed plan doc incorrectly stated content is stored as HTML. Investigation confirmed the actual flow:

```
TipTap → tiptap-markdown.getMarkdown() → Markdown string → API → PostgreSQL
PostgreSQL → Markdown string → TipTap setContent() → TipTap parses → renders
```

Content is stored as **Markdown**, not HTML. TipTap's extension-based schema only creates ProseMirror nodes for registered extensions — arbitrary HTML in Markdown is ignored. DOMPurify would add overhead with no security benefit. If a non-TipTap rendering path is added later (emails, RSS), sanitization should be added at that boundary.

### Already Complete

- **MediaGallery real API** — Full TanStack Query integration with `/api/media/*` endpoints already in place
- **Image upload hooks** — `useMediaUpload` with S3 presigned URL flow already functional

---

## Execution Order

Items are ordered by dependency and risk:

1. **Delete re-export shims** — zero-risk cleanup, validates nothing depends on them
2. **Global 401 interceptor** — small change, high value, no dependencies
3. **Bundle analysis tooling** — install-and-configure, no code changes
4. **Image upload in editor toolbar** — moderate complexity, touches 3 files
5. **MSW test baseline** — new infrastructure + test migration, isolated from production code
6. **Full `bg-theme-*` migration** — highest file count, lowest risk (mechanical), best done last when branch is otherwise stable

## Verification

| Check | Command |
|-------|---------|
| TypeScript | `npx tsc --noEmit` |
| Tests | `npm run test -- --run` |
| Build | `npx vite build` |
| Bundle stats | `npm run analyze` (new) |
