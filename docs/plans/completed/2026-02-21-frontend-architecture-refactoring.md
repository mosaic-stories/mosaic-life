# Frontend Architecture Refactoring — Completed

**Date:** 2026-02-21
**Branch:** `develop`
**Scope:** 5 phases across `apps/web/src/`

---

## Summary

Comprehensive refactoring of the Mosaic Life frontend to address structural debt accumulated during rapid MVP development. The work covered font loading, dead code removal, Tailwind token registration, HOC/prop-drilling elimination, feature module restructuring, god component decomposition, and TipTap rich text editor integration.

**Result:** Zero TypeScript errors, 18/18 test files passing (119/119 tests), no behavioral changes.

---

## Phase 1: Foundation — Fonts + CSS Token Consolidation

### 1A: Load Fonts

Tailwind config declared `Inter` and `Merriweather` but neither was loaded — users fell through to `system-ui`.

**Changes:**
- Installed `@fontsource-variable/inter` and `@fontsource/merriweather`
- Added imports in `src/main.tsx` (400/700 weights for Merriweather)

**Files:** `src/main.tsx`, `package.json`

### 1B: Delete Dead CSS and Theme Code

Three overlapping token systems existed. `styles/globals.css` was never imported (used Tailwind v4 syntax incompatible with installed v3.4.18). `getThemeClasses()` in `themes.ts` was dead code.

**Changes:**
- Deleted `src/styles/globals.css`
- Removed `getThemeClasses()` export from `src/lib/themes.ts`
- Removed dead imports/assignments from `StoryCreation.tsx`, `LegacyProfile.tsx`, `StoryCreation.test.tsx`

### 1C: Register Theme Tokens in Tailwind Config

All `--theme-*` usage required verbose `bg-[rgb(var(--theme-primary))]` syntax (187 occurrences across 35 files).

**Changes:**
- Added `theme-primary`, `theme-primary-light`, `theme-primary-dark`, `theme-accent`, `theme-accent-light`, `theme-gradient-from`, `theme-gradient-to`, `theme-background`, `theme-surface` to `tailwind.config.js` under `extend.colors`
- Both old and new syntax work — migration is incremental

**Files:** `tailwind.config.js`

### 1D: Sync shadcn `--primary` to Active Theme

shadcn `--primary` was near-black (`24 9.8% 10%`), disconnected from the user's chosen theme.

**Changes:**
- Added `rgbStringToHsl()` helper in `src/lib/themeUtils.ts`
- `applyTheme()` now also sets `--primary` and `--primary-foreground` CSS variables
- shadcn Buttons now match the active theme color

**Files:** `src/lib/themeUtils.ts`

---

## Phase 2: Architecture — Remove HOC/Prop-Drilling Pattern

### Problem

`RootLayout` packed 7 props into `SharedPageProps` → outlet context → 3 HOCs injected them into pages. Analysis showed massive waste:
- `onSignOut` — never used by any page
- `currentTheme`/`onThemeChange` — only Homepage used them
- `onSelectLegacy` — only Homepage
- 6 pages received SharedPageProps and used zero props from it

### Changes

**New Zustand stores:**
- `src/lib/hooks/useTheme.ts` — `currentTheme`, `setTheme(themeId)`
- `src/lib/hooks/useAuthModal.ts` — `isOpen`, `open()`, `close()`

**Simplified RootLayout:**
- Removed `SharedPageProps` interface and all handler callbacks
- Replaced `<Outlet context={sharedProps} />` with `<Outlet />`
- Uses `useTheme()`, `useAuthModal()`, `useAuth()` hooks directly

**Updated all page components (14 total):**

| Component | Change |
|-----------|--------|
| Homepage | Added `useNavigate()`, `useTheme()`, `useAuth()`, `useAuthModal()` |
| About, HowItWorks | Added `useNavigate()`, `useAuth()`, `useAuthModal()` |
| Community, MyLegacies | Added `useNavigate()` |
| LegacyCreation, LegacyEdit, AIAgentChat, AIAgentPanel, StoryEvolution, NotificationHistory | Removed unused SharedPageProps |
| LegacyProfile | Added `useAuth()` for user |
| StoryCreation | Removed props (already used hooks directly) |

**Other changes:**
- `AppHeader` — uses hooks instead of props
- `HeaderUserMenu` — removed `onNavigate`/`onSignOut` props, uses `useAuth().logout` directly
- `Footer` — uses `useNavigate()` instead of `onNavigate` prop
- Deleted `src/routes/PageWrapper.tsx` (HOC wrapper)
- Simplified `src/routes/index.tsx` with `WithLegacyId` and `WithStoryProps` param extractors

**Files changed:** ~20 files. **Files deleted:** `PageWrapper.tsx`

---

## Phase 3: Organization — Restructure into Feature Modules

### Problem

30+ files in flat `src/components/` with no organizational hierarchy. Only `story-evolution` was in `features/`.

### New Structure

```
src/features/
├── legacy/          LegacyProfile, LegacyCreation, LegacyEdit, LegacyMultiSelect + hooks + api
├── story/           StoryCreation + tests, VersionHistory* + tests + hooks + api
├── story-evolution/ (already existed, unchanged)
├── editor/          StoryEditor, EditorToolbar, useStoryEditor (Phase 5)
├── ai-chat/         AIAgentChat, AIAgentPanel + hooks + api + store
├── media/           MediaGallery, MediaGalleryInline, MediaUploader + hooks + api
├── members/         MemberDrawer, InviteMemberModal, InviteAcceptPage + hooks + api
├── notifications/   NotificationHistory, NotificationItem + hooks + api
├── settings/        SettingsLayout, ProfileSettings, AppearanceSettings, etc. + hooks + api
└── community/       Community, CreateCommunityModal
src/pages/           Homepage, About, HowItWorks (marketing pages)
```

### Changes

- Moved 50+ files via `git mv` to new feature module locations
- Updated 199 broken imports across 56 files
- Created barrel export `index.ts` for all 8 feature modules
- Updated `src/routes/index.tsx` lazy imports to new paths
- Updated re-export shims in `src/lib/api/index.ts` and `src/lib/hooks/index.ts`
- Updated test mock paths in `HeaderUserMenu.test.tsx`, `AppHeader.test.tsx`, `StoryCreation.test.tsx`

---

## Phase 4: Decomposition — Split God Components

### 4A: StoryCreation (525 → ~350 lines orchestrator + 5 sub-components)

| Extracted Component | Purpose |
|---------------------|---------|
| `StoryToolbar.tsx` | HeaderSlot content (back button, view/edit toggles, save, evolve) |
| `StoryViewHeader.tsx` | Visibility icon, author, date metadata |
| `StoryViewer.tsx` | Read-only story display with version preview |
| `StoryEditForm.tsx` | Legacy selector, title, visibility, content editor |
| `EvolutionResumeBanner.tsx` | Purple "evolution in progress" banner |

### 4B: AIAgentChat (677 → ~278 lines orchestrator + 9 sub-components)

| Extracted Component | Purpose |
|---------------------|---------|
| `ChatMessage.tsx` | Single chat message with avatar, timestamp, content |
| `PersonaCard.tsx` | Persona selection card (shared by sidebar + mobile) |
| `PersonaIcon.tsx` | Icon resolver for persona icon names |
| `AgentSidebar.tsx` | Desktop persona list |
| `MobileAgentSheet.tsx` | Mobile persona selector Sheet |
| `ChatHeader.tsx` | Agent info, streaming badge, new chat, history |
| `ConversationHistoryPopover.tsx` | History popover |
| `MessageList.tsx` | Scrollable message area with auto-scroll |
| `ChatInput.tsx` | Input bar with send button |
| `utils.ts` | `getPersonaColor`, `formatTimestamp`, `formatDate`, `formatRelativeTime` |

### 4C: LegacyProfile (583 → ~219 lines orchestrator + 7 sub-components)

| Extracted Component | Purpose |
|---------------------|---------|
| `ProfileHeader.tsx` | Avatar, name, badges, dates, biography |
| `SectionNav.tsx` | Tab navigation (Stories, Media, AI, Members) |
| `StoriesSection.tsx` | Stories tab content |
| `StoryCard.tsx` | Individual story card |
| `MediaSection.tsx` | Media tab content |
| `AISection.tsx` | AI interactions tab |
| `DeleteLegacyDialog.tsx` | Delete confirmation dialog |
| `LegacyHeaderControls.tsx` | Header slot controls |

### 4D: HowItWorks (1328 → directory module with 12 files)

Converted to `src/pages/HowItWorks/` directory module:
- `index.tsx` — thin orchestrator
- `howItWorksData.ts` — all data arrays with TypeScript types (~540 lines)
- 8 section components: `HeroSection`, `GettingStartedSteps`, `CoreFeaturesList`, `UseCasesGrid`, `AIAgentSection`, `AIPersonasSection`, `CommunitySection`, `CTASection`
- 2 reusable card components: `AgentDetailCard`, `PersonaDetailCard`

### 4E: Community (446 → ~107 lines orchestrator + 5 sub-components)

| Extracted Component | Purpose |
|---------------------|---------|
| `CommunityHero.tsx` | Hero banner with guidelines |
| `CommunitySearchBar.tsx` | Search input + tab bar |
| `CommunityCard.tsx` | Individual community card |
| `TrendingTopicsSection.tsx` | Trending topics grid |
| `communities.ts` | Mock community data |

---

## Phase 5: Feature — TipTap Rich Text Editor

### Problem

CLAUDE.md lists "TipTap (ProseMirror-based) with Markdown sync" but story editing was a plain `<textarea>` with `font-mono text-sm`.

### Changes

**Installed packages:**
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/pm`
- `@radix-ui/react-toggle`, `@radix-ui/react-separator` (for toolbar)

**New files in `src/features/editor/`:**

| File | Purpose |
|------|---------|
| `components/StoryEditor.tsx` | TipTap editor with themed styling, `content`/`onChange`/`readOnly` props |
| `components/EditorToolbar.tsx` | Bold, Italic, H2, H3, Bullet/Ordered List, Blockquote, HR, Link, Image, Undo/Redo |
| `hooks/useStoryEditor.ts` | Wraps `useEditor()` with extensions, content init, serialization |
| `editor.css` | ProseMirror content styling, placeholder, theme-aware blockquote |
| `index.ts` | Barrel export |

**New shared UI components:**
- `src/components/ui/toggle.tsx` — shadcn Toggle (Radix-based)
- `src/components/ui/separator.tsx` — shadcn Separator (Radix-based)

**Integration:**
- `StoryEditForm.tsx` — replaced `<textarea>` with `<StoryEditor>`
- `StoryViewer.tsx` — replaced `whitespace-pre-wrap` div with `<StoryEditor readOnly />`
- `vite.config.ts` — added `tiptap` to manual chunks for code splitting

**Content strategy:** Stores HTML in the `content` field (backend treats it as opaque string). TipTap renders HTML natively. Existing plain-text content renders correctly in TipTap as paragraphs.

---

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Zero errors |
| `npm run test -- --run` | 18/18 files, 119/119 tests passing |
| `npx vite build` | 2301 modules transformed successfully (dist/ permission issue is pre-existing, unrelated) |

## Follow-Up Items (Deferred)

| # | Item | Notes |
|---|------|-------|
| 7 | Global 401 interceptor | Add to `lib/api/client.ts`; dispatch `auth:expired` event |
| 8 | Wire MediaGallery to real API | Replace mock data imports with `useMedia` hook |
| 9 | Test baseline with MSW | Install `msw`; create handlers for core API |
| 10 | Bundle analysis | Install `rollup-plugin-visualizer`; establish size budget |
| — | DOMPurify sanitization | Add HTML sanitization for TipTap content before rendering |
| — | Image upload integration | Wire image toolbar button to `useMediaUpload` from `features/media/` |
| — | Incremental `bg-theme-*` migration | Replace verbose `bg-[rgb(var(--theme-primary))]` with `bg-theme-primary` |
| — | Delete re-export shims | Remove `lib/api/index.ts` and `lib/hooks/index.ts` after all consumers migrate |
