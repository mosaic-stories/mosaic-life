# Spec 05: Finish & Feedback — The Trust Layer

**Status:** SEED — awaiting owner second pass
**Priority:** P0 for items 1–2; P1–P2 for the rest
**Evidence:** [`../00-review-summary.md`](../00-review-summary.md) §E · screenshots `m04-legacy-detail.jpg`, `27-settings-account.jpg`, `11-my-overview.jpg`
**Depends on:** nothing (all items independent; can interleave with other specs)
**Blocks:** nothing

## Context capsule

Mosaic Life's frontend (React + Tailwind + shadcn/ui in `apps/web/src/components/ui/`, ~70 components) is visually consistent at the macro level. This spec collects the finish-level defects that individually are small but together account for most of the "unpolished" impression: silent failures, native browser dialogs, emoji standing in for icons, raw system strings, mobile layout breaks, and dead theming code. Items are independent — this spec is a punch list, not a design.

## The punch list

### 1. Failures are silent (P0)
`sonner` is installed and `components/ui/sonner.tsx` exists, but no `<Toaster>` is mounted and `toast()` is never called. ~50 catch blocks end in `console.error` (`LegacyProfile.tsx:106,115`, `EvolveWorkspace.tsx:121,168,216,289`, `StoryCreation.tsx:146,161`, `QuickActions.tsx:44`, …). If a save fails, the user learns nothing.
**Fix:** mount `<Toaster>` in `App.tsx`; establish the convention (mutations toast on error, quiet or inline on success); sweep the catch blocks to surface user-relevant failures.

### 2. Mobile: the person's name doesn't render (P0)
At 390px the legacy hero truncates "Karen Hewitt" to a stray bracket (`m04-legacy-detail.jpg`). The memorialized person's name is the one string that must never break.
**Fix:** stack the hero vertically on small screens; the name wraps to two lines before anything else compresses. (`ProfileHeader` in `features/legacy/`)

### 3. Native `confirm()` / `prompt()` (P1)
`confirm()` in `MemberDrawer.tsx:101,107,114` (remove member, leave legacy) and `MyConnectionsTab.tsx:124` (remove connection); `window.prompt('Enter URL:')` in `EditorToolbar.tsx:33` (insert link).
**Fix:** reuse the existing `AlertDialog` pattern (already used for delete-story); small popover with input for editor links.

### 4. Emoji standing in for icons (P1)
Stat bars use 🏛️📖🔗❤️ (`LegaciesPage`/`StoriesPage` stat components) on screens that otherwise use lucide icons; community cards use emoji avatars (spec 03 may remove that surface).
**Fix:** lucide equivalents in stat bars; no emoji as UI iconography anywhere.

### 5. Placeholder covers make legacies look abandoned (P1)
Legacies without an uploaded photo show a flat gray gradient + generic person icon across dashboard, hubs, and explore.
**Fix:** deterministic generated cover per legacy (soft gradient derived from the active theme + subtle mosaic pattern) with an initials monogram avatar. No upload required for a legacy to look cared-for.

### 6. Raw system strings in Account settings (P1)
Sessions listed as full user-agent strings ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit…"); a Keycloak login is labeled with a Google icon and "Google" (`27-settings-account.jpg`).
**Fix:** parse UA → "Chrome on macOS · last active 41 days ago"; display the actual identity provider. (`AccountSettings`)

### 7. Fifteen themes; dark mode is dead code (P2)
15 themes in `lib/themes.ts` include a Vibrant tier (Lime, Coral, Sunset…) that's off-register for a memorial product. Meanwhile `darkMode: ["class"]` is configured and `.dark` tokens exist in `index.css:41–61`, but nothing ever applies the class — dark mode is unreachable, and `dark:` variants throughout the codebase are inert.
**Fix:** curate to ~6 themes (drop Vibrant tier); then either ship dark mode (add a Light/Dark/System toggle in Appearance that applies the class — tokens already exist) or delete the dead CSS. Recommendation: ship it; evening use is real for this audience.

### 8. Evolve editor doesn't own its space (P2)
The white editor card ends after content and cream void fills the rest of the panel (desktop `33-evolve-workspace.jpg`, mobile `m05-evolve.jpg`).
**Fix:** editor surface fills panel height; content area grows within. (`EditorPanel` in `features/evolve-workspace/`)

### 9. Codebase hygiene that leaks into UX (P2)
Entire unrouted `features/story-evolution/` directory (older phase-based evolve UI) confuses future work; neutral palette mixes `neutral-*` (967 uses) with `gray-*` (86, concentrated in settings pages) and `stone-*` (50, hubs); hardcoded semantic colors (role badges etc.) aren't tokenized; the story viewer is named `StoryCreation.tsx` (spec 01 Q5 may own the rename).
**Fix:** delete dead feature; standardize on `neutral-*`; tokenize recurring semantic colors.

## Goals

- Every user action produces visible success/failure feedback.
- No native browser chrome (confirm/prompt) in product flows.
- No emoji as iconography; no raw system strings user-facing.
- Mobile renders every identity-critical string.
- Theming offering is curated and fully functional (no dead modes).

## Non-goals

- New features of any kind; copy changes (spec 04); navigation changes (spec 03).
- A design-token overhaul beyond the neutral-color standardization.
- Storybook/visual-regression infrastructure (worth considering separately).

## Open questions (owner second pass)

1. **Dark mode: ship or delete?** (Recommendation: ship — tokens exist, cost is a toggle + QA pass over `dark:` variants.)
   → Decision:
2. **Theme curation.** Keep which 6? Proposed: warm-amber (default), serene-blue, gentle-rose, forest-green, muted-sage, deep-navy.
   → Decision:
3. **Success toasts.** Toast on success too ("Story saved"), or errors-only with inline/quiet success states? (Recommendation: errors always; success only for actions without visible in-place results.)
   → Decision:
4. **Generated covers.** Approve the theme-derived gradient + initials direction, or prefer a fixed neutral set of preset artwork?
   → Decision:

## Acceptance criteria

- [ ] Killing the API mid-session and attempting any mutation produces a visible, human error message for every core flow (save story, invite, upload, role change).
- [ ] `grep -rn "window.confirm\|window.prompt\|confirm(" apps/web/src --include="*.tsx"` returns no product-flow hits.
- [ ] No emoji renders as an icon anywhere in the authenticated app.
- [ ] At 390px, the legacy hero shows the full name (wrapped if needed) for a 24-character name.
- [ ] Account sessions read as "Browser on OS · last active …"; provider label matches the actual provider.
- [ ] Theme picker shows the curated set; if dark mode ships, toggling persists and every screen in the core loop is legible in both modes.
- [ ] `features/story-evolution/` no longer exists; `gray-*` usage in settings pages is migrated.

## Suggested PR breakdown (<400 LOC each)

1. **Toaster + error surfacing** (punch item 1). (`App.tsx`, mutation hooks — may split into 2 PRs: mount+convention, then sweep)
2. **Mobile hero fix** (item 2). (`ProfileHeader`)
3. **Dialog replacement** (item 3). (`MemberDrawer`, `MyConnectionsTab`, `EditorToolbar`)
4. **Icons + generated covers** (items 4–5). (stat bars, `LegacyCard`, new cover util)
5. **Account settings cleanup** (item 6). (`AccountSettings` + tiny UA-parse util)
6. **Theme curation ± dark mode** (item 7). (`themes.ts`, `AppearanceSettings`, `useTheme`; dark-mode QA pass)
7. **Evolve panel height** (item 8). (`EditorPanel`)
8. **Hygiene** (item 9). (delete dead dir; neutral-color sweep — mechanical, reviewable)
