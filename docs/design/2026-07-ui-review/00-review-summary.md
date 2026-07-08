# UI/UX Review — Condensed Findings

**Date:** 2026-07-07
**Method:** 34 screens captured from the running local stack (desktop 1440px + mobile 390px, authenticated as the Keycloak `dev` user) plus a full code audit of `apps/web/src`. Verified at commit `9de7d52` on `develop`; production serves the same commit.
**Full narrative version:** https://claude.ai/code/artifact/9c41a8e7-650b-4088-be3a-cd225c4102c2
**Screenshots:** [`screens/`](screens/) (referenced by filename below)

This file is the durable record of *what was found*. The actionable proposals live in [`specs/`](specs/) — one per major area. When a spec and this summary disagree, the spec (post-owner-review) wins.

---

## Verdict

The visual foundation is good: coherent warm-amber identity, Merriweather/Inter pairing, consistent shadcn/ui usage, strong legacy profile page, consistent empty states, URL-driven filter state, decent a11y baseline (aria-labels, focus rings). The gaps are structural and finish-level, not a redesign:

1. **Every write path routes through the Evolve workspace** — the heaviest surface owns the most delicate action. (→ spec 01)
2. **Stories cannot be answered** — no comments/reactions; the social loop has nothing to circulate. (→ spec 02)
3. **Mock/stub surfaces shipped live** — Community, Explore, legacy gallery. (→ spec 03)
4. **System-language copy in a grief context** — "Death Date (if applicable)", "Discard session", AI-first framing. (→ spec 04)
5. **Trust-breaking finish details** — silent failures, native dialogs, emoji icons, raw UA strings, mobile truncation. (→ spec 05)

---

## Findings by area

### A. Story lifecycle (spec 01)

- No simple write/edit path exists. All create affordances POST an empty draft then navigate to `/legacy/:id/story/:storyId/evolve`: `LegacyProfile.tsx:90` (`handleAddStory`), `QuickActions.tsx:28`, `LegacyPickerDialog`, and the draft CTA in `StoryCreation.tsx`. `StoryCreation.tsx:91` redirects away if no `storyId` ("creation now goes through evolve").
- The story "view" is a read-only TipTap editor (`<StoryEditor readOnly>`) rendered inside a bordered box that looks like a disabled form. Component is misleadingly named `features/story/components/StoryCreation.tsx` (renders `StoryViewer.tsx`). Screenshot: `32-story-view.jpg`.
- Reading a story with an unfinished evolution shows a purple banner "You have a story evolution in progress" with a red **Discard** — on the *reading* page (`EvolutionResumeBanner`).
- `EvolveWorkspace.tsx:152–177` auto-starts a `biographer` session on 404 and creates an AI conversation **per persona on mount**. Observed result: 8 duplicate "The Biographer" conversations, 6 with zero messages (`15-my-conversations.jpg`).
- Default titles ("Untitled Story – May 20, 2026") leak to dashboard, hubs, and conversation names.
- Rewrite panel narrates internals: "No summary yet — extract context / No facts pinned — pin facts in Context / No conversation yet — chat with a persona" (`37-evolve-rewrite.jpg`).
- Evolve editor card doesn't fill panel height — cream void below on short stories (desktop `33-evolve-workspace.jpg`, mobile `m05-evolve.jpg`).
- Dead parallel implementation: `features/story-evolution/` (phase-based UI) is unrouted and unused.
- Evolve internals (kept, reframed): `EvolveWorkspace.tsx`, `store/useEvolveWorkspaceStore.ts`, tools in `features/evolve-workspace/tools/` (AIChatTool, ContextTool, RewriteTool, VersionsTool, MediaTool, SettingsTool), rewrite lifecycle idle→streaming→reviewing with `DiffView` (diff-match-patch).

### B. Social layer (spec 02)

- **No comments or reactions on stories.** The read page is a dead end; notifications/activity have nothing story-level to carry.
- What exists and works: members & roles (creator/admin/advocate/admirer; `features/members/`), invitations (`InviteMemberModal`, `/invite/:token`), user connections (`features/user-connections/`), legacy links (`features/legacy-link/`), access requests (`features/legacy-access/`), favorites, notifications (`features/notifications/`), activity feed (`features/activity/`).
- Activity feed emits raw system events: "You created 'Screenshot 2026-05-17 at 12.16.55 AM.png'" (`11-my-overview.jpg`).
- Invitation entry is buried in the legacy sidebar ("Invite someone"); no structural invite moment after creating a legacy or publishing a first story.

### C. Navigation & IA (spec 03)

- **Community is 100% mock** (`features/community/`, hardcoded `communities.ts`, emoji avatars 🎖️📚🕊️ etc.). Join doesn't persist; `CreateCommunityModal.tsx:38` is `console.log` + close; shows "My Communities (4)" to signed-out visitors (`03-community.jpg`). Top-level nav item.
- **All four Explore pages are 19-line stubs** (`pages/Explore{Legacies,Stories,Media,People}Page.tsx`) despite working hooks (`useExploreLegacies` powers the public home grid) and an existing `features/user-search/` `PeopleSearch`.
- `pages/PersonalPage.tsx` is a 19-line stub. `ActivityTabContent.tsx:74` says "coming soon". `MediaDetailPanel.tsx:417` "AI Insights Coming Soon".
- **Mock gallery on a real route:** `/legacy/:legacyId/gallery` → `features/media/components/MediaGallery.tsx` imports `lib/mockData` (line 7); Upload/Like/Share/Download buttons non-functional (lines 53, 92, 133–138, 183–194). Duplicates the real `MediaSection`/`MediaBrowser`.
- **Nav label mismatch:** sidebar "Conversations" → page titled "Connections" (`/my/conversations`, `pages/ConnectionsPage.tsx`), which interleaves AI personas with human connections across 5 tabs + a second row of filter chips (`15-my-conversations.jpg`).
- Marketing footer (4 columns + social) renders on every authenticated page. Dead social buttons — "X"/"Li" divs with `cursor-pointer`, no handler (`Footer.tsx:107–114`); "Explore Legacies" links to `/` (`Footer.tsx:35–41`); hardcoded "2026 Mosaic Life" (`Footer.tsx:120`).
- Hub control overload: Legacies hub shows stat bar + 3 tabs + 4 filter chips + sort + search + 2 view toggles for a single legacy (`12-my-legacies.jpg`).
- Nav config centralized in `lib/navigation.ts` (`SECTIONS`); routes in `src/routes/index.tsx`.

### D. Voice & copy (spec 04)

- "Death Date (if applicable)" + native `mm/dd/yyyy` inputs in `LegacyCreation` (`22-legacy-new.jpg`); no approximate/partial dates.
- Gender helper text: "Used to personalize AI conversations about this person."
- "Discard session" (red) in `WorkspaceHeader`; "session" is engineering vocabulary.
- Homepage leads with "Digital tributes powered by AI" pill (`01-public-home.jpg`).
- Persona "The Digital Twin" (How It Works page) — ethically loaded name in a memorial context.
- "Evolved" stat on Stories hub (`StoryStatsBar`); "Personas Used" on Connections stats.
- "Ai Chat" capitalization (evolve ToolPanel header); "1 months ago" (RecentStoriesList).
- How It Works page is ~11,500px tall — reads as an internal feature spec (four personas with capability matrices). `AIAgentSection.tsx:50` has a raw HTML entity (`&#128173;`).

### E. Finish & feedback (spec 05)

- **No toast system mounted.** `sonner` installed, `components/ui/sonner.tsx` exists, no `<Toaster>` rendered, `toast()` never called. ~50 catch blocks end in `console.error` (e.g. `LegacyProfile.tsx:106,115`, `EvolveWorkspace.tsx:121,168,216,289`, `StoryCreation.tsx:146,161`, `QuickActions.tsx:44`). Failures are invisible to users.
- **Native dialogs:** `confirm()` in `MemberDrawer.tsx:101,107,114` and `MyConnectionsTab.tsx:124`; `window.prompt('Enter URL:')` in `EditorToolbar.tsx:33`. (`AlertDialog` already used elsewhere, e.g. delete story.)
- **Emoji as icons:** stat bars (🏛️📖🔗❤️) on Legacies/Stories hubs next to lucide icons; community avatars.
- **Placeholder covers:** legacies without photos show flat gray gradient + generic person icon everywhere (`11-my-overview.jpg`, `12-my-legacies.jpg`).
- **Mobile defects:** legacy hero truncates the person's name to a stray bracket at 390px (`m04-legacy-detail.jpg`); SectionNav tabs icon-only on mobile.
- **Account settings:** raw user-agent strings for sessions; Keycloak login labeled with Google icon + "Google" (`27-settings-account.jpg`). Settings pages use `gray-*` while the app uses `neutral-*` (hubs mix `stone-*`; counts: 967 neutral / 86 gray / 50 stone).
- **Themes:** 15 themes (`lib/themes.ts`, applied via `lib/themeUtils.ts`, Zustand `useTheme`, localStorage `mosaic-theme` + backend sync). "Vibrant Lime" et al. off-register for a memorial product (`24-settings-appearance` — not committed; see artifact).
- **Dark mode is dead code:** `darkMode: ["class"]` configured, `.dark` tokens in `index.css:41–61`, `dark:` variants exist — but nothing ever applies the `.dark` class (`next-themes` only imported by `sonner.tsx`).
- Dead code: entire `features/story-evolution/` directory unrouted.

---

## Screenshot index

| File | What it shows |
|---|---|
| `01-public-home.jpg` | Public homepage, AI-first pill, hero |
| `03-community.jpg` | Mock Community page (fake joins, emoji avatars) |
| `11-my-overview.jpg` | Dashboard: prompt card, placeholder covers, raw-filename activity |
| `12-my-legacies.jpg` | Hub control overload (9 controls, 1 card) |
| `15-my-conversations.jpg` | Conversation pollution; Conversations/Connections mismatch |
| `22-legacy-new.jpg` | Create Legacy form ("Death Date (if applicable)") |
| `27-settings-account.jpg` | Raw UA strings; wrong provider label |
| `30-legacy-detail.jpg` | Legacy profile — the reference-quality screen |
| `32-story-view.jpg` | Story read page: editor-box look, purple banner |
| `33-evolve-workspace.jpg` | Evolve on first open (skeleton AI panel, cream void) |
| `37-evolve-rewrite.jpg` | Rewrite panel narrating internals |
| `m04-legacy-detail.jpg` | Mobile: person's name truncated to a bracket |
| `m05-evolve.jpg` | Mobile evolve editor |
