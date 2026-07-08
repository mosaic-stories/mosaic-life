# Spec 03: Navigation & IA — Honest Surfaces

**Status:** SEED — awaiting owner second pass
**Priority:** P0 for mock-surface gating; P1 for the rest
**Evidence:** [`../00-review-summary.md`](../00-review-summary.md) §C · screenshots `03-community.jpg`, `15-my-conversations.jpg`, `12-my-legacies.jpg`
**Depends on:** nothing (independent of specs 01/02)
**Blocks:** nothing

## Context capsule

Mosaic Life's shell is: top header with three sections (**My Mosaic / Explore / Community**, config in `apps/web/src/lib/navigation.ts` `SECTIONS`), a collapsible left sidebar within My Mosaic and Explore (`components/navigation/SidebarLayout.tsx`), a mobile bottom tab bar, and routes in `src/routes/index.tsx`. Several surfaces reachable from primary navigation are mock data or stubs; some navigation labels don't match their destinations.

## Problem

For a product asking families to trust it with memories, a fake button is worse than a missing feature:

1. **Community** (top-level section) is fully hardcoded: 8 groups from `communities.ts` with emoji avatars, fake member counts, Join buttons that don't persist, "Create Community" that `console.log`s and closes (`CreateCommunityModal.tsx:38`), and "My Communities (4)" shown to signed-out visitors.
2. **Explore** (top-level section) has four 19-line stub pages — while a working data path exists (`useExploreLegacies` already powers the public-home grid) and `features/user-search/PeopleSearch` exists but isn't routed.
3. **Mock gallery on a real route:** `/legacy/:legacyId/gallery` renders hardcoded photos with dead Upload/Like/Share/Download buttons (`MediaGallery.tsx:7,53,92,133–138,183–194`), duplicating the real `MediaSection`/`MediaBrowser` used elsewhere.
4. **Label mismatch:** sidebar item "Conversations" opens a page titled "Connections" (`/my/conversations`), which interleaves AI persona chats with human connections across five tabs plus a second row of filter chips.
5. **Marketing footer inside the app** on every authenticated page, with dead "X"/"Li" social divs (`Footer.tsx:107–114`), "Explore Legacies" linking to `/` (`Footer.tsx:35–41`), and hardcoded "2026" (`Footer.tsx:120`).
6. **Hub control overload:** stats bar + tabs + filter chips + sort + search + view toggles rendered for collections of one (`12-my-legacies.jpg`). `pages/PersonalPage.tsx` is a stub in the sidebar.

## Goals

- Nothing reachable from primary navigation is mock or a dead end.
- Every nav label matches its destination's title and content.
- AI conversations and human relationships are distinct surfaces (different mental models: tool vs. family).
- The app shell feels like an app, not a website template (footer).
- Control density scales with collection size.

## Non-goals

- Building the real Community feature (own future spec when prioritized).
- Building net-new Explore capabilities beyond wiring what exists.
- Changing the role model, invitations, or connection mechanics.
- The story lifecycle (spec 01) and copy changes (spec 04).

## Proposed direction

**Community:** remove from `SECTIONS` and routes until real. Keep `features/community/` code behind an off-by-default flag if you want it for demos (see Q1).

**Explore:** wire the four tabs to existing data — Legacies via `useExploreLegacies`, People via `PeopleSearch`; Stories/Media only if a public-content endpoint already supports them, otherwise drop those tabs rather than stub them (see Q2).

**Gallery:** delete the `/legacy/:legacyId/gallery` route + `MediaGallery.tsx` (mock); the legacy page's Media tab (real `MediaSection`) is the single media surface.

**Conversations split:** sidebar gets **People** (human connections: My Connections / Requests / shared legacies) and **AI Conversations** (persona chats) as separate items; page titles match nav labels. Alternative: move AI conversations out of the sidebar entirely and surface them contextually (see Q3).

**Footer:** public/marketing pages keep the full footer (with dead social buttons removed and links fixed, year computed). Authenticated shell gets a one-line footer (Help · Privacy · Terms) or none.

**Progressive disclosure:** hubs hide search/sort/filter/view controls until the collection crosses ~5 items; stats bar hides until ~2. **Personal** leaves the sidebar until built.

## Open questions (owner second pass)

1. **Community disposition.** Remove entirely (delete code), hide behind a flag, or replace the page with an honest "coming soon" waitlist card kept out of primary nav?
   → Decision:
2. **Explore scope.** Which tabs ship: Legacies only? Legacies + People? All four (requires backend endpoints for public stories/media)?
   → Decision:
3. **AI conversations placement.** (a) Own sidebar item "AI Conversations", (b) folded into each legacy/story context with no global list, or (c) keep a global list but under Stories?
   → Decision:
4. **In-app footer.** One-line version or none?
   → Decision:
5. **Explore for signed-out visitors.** Explore routes are currently public. Keep public (good for SEO/discovery) or gate behind auth?
   → Decision:

## Acceptance criteria

- [ ] No route reachable from primary navigation renders mock data or non-functional primary actions.
- [ ] Signed-out visitors never see personalized fabrications ("My Communities (4)").
- [ ] Sidebar/nav labels are identical to the page titles they open.
- [ ] Human connections and AI persona chats do not share a tab bar.
- [ ] Authenticated pages show no marketing footer; no dead links/buttons anywhere in header or footer.
- [ ] A user with one legacy sees their legacy card and a primary action — no search/sort/filter chrome.
- [ ] `/legacy/:id/gallery` no longer exists; media is reachable only via the legacy Media tab.
- [ ] Old bookmarked URLs (`/community`, `/my/personal`, gallery) redirect sensibly (home or legacy page), not 404.

## Suggested PR breakdown (<400 LOC each)

1. **Gate mock surfaces** — remove Community + Personal from nav/routes (per Q1), delete mock gallery route, add redirects. (`navigation.ts`, `routes/index.tsx`)
2. **Wire Explore** — real data per Q2 decision; delete unused stubs. (`pages/Explore*.tsx`, `ExploreLayout.tsx`)
3. **Split People / AI Conversations** — per Q3; reconcile labels/titles. (`ConnectionsPage.tsx`, `navigation.ts`, `MyMosaicLayout`)
4. **Footer** — slim in-app variant; fix public footer (links, year, remove dead socials). (`Footer.tsx`, `RootLayout.tsx`)
5. **Progressive disclosure on hubs** — thresholds for controls/stats. (`LegaciesPage.tsx`, `StoriesPage.tsx`, hub components)
