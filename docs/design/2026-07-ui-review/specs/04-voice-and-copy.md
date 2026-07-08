# Spec 04: Voice & Copy — Writing in the Grief Register

**Status:** SEED — awaiting owner second pass
**Priority:** P1 (low risk, high trust payoff)
**Evidence:** [`../00-review-summary.md`](../00-review-summary.md) §D · screenshots `01-public-home.jpg`, `22-legacy-new.jpg`, `37-evolve-rewrite.jpg`
**Depends on:** coordinates with Spec 01 (several strings live in Evolve surfaces it touches)
**Blocks:** nothing

## Context capsule

Mosaic Life's audience includes people days into a loss, alongside celebrants of living milestones (retirements, graduations). The interface currently mixes three voices: warm product copy (good), engineering vocabulary leaking through ("session", "extract context", "Evolved"), and clinical phrasing ("Death Date (if applicable)"). This spec is a single copy inventory + the small mechanical fixes copy alone can't solve (partial dates). Test for every string: *would a kind funeral director say it out loud?*

## Problem

See the inventory below — each row is a finding. Beyond individual strings, two structural issues:

1. **AI-first framing.** The homepage's first words are "Digital tributes powered by AI"; the legacy form justifies its gender field with "Used to personalize AI conversations about this person." AI is the differentiator for *writing help*, not the reason people come; in a grief context AI-first framing reads as synthetic sentiment.
2. **The How It Works page is a spec sheet** (~11,500px): four AI personas with capability matrices and conversation-style comparisons. Marketing pages should tell the story in one screen's worth; persona details belong in-context in the workspace.

## Goals

- Every user-facing string passes the register test; no engineering vocabulary in the UI.
- AI is presented as a helper you can reach for, never the headline.
- Date entry accommodates what families actually know (year-only, approximate).
- How It Works communicates the product in ≤4 steps + one short AI section.

## Non-goals

- Renaming the **Evolve** feature itself (see Q1 — owner call).
- Restructuring pages beyond How It Works (spec 03 owns navigation).
- Localization/i18n infrastructure.
- Legal pages (Terms/Privacy).

## Copy inventory (the actionable core)

| # | Location | Today | Proposed |
|---|----------|-------|----------|
| 1 | `LegacyCreation` form | "Death Date (if applicable)" | "Date of passing (optional)" |
| 2 | `LegacyCreation` form | Native `mm/dd/yyyy` date inputs | Support year-only / approximate ("Spring 1957") — see mechanics below |
| 3 | `LegacyCreation` gender helper | "Used to personalize AI conversations about this person." | "Helps us refer to them correctly (she/he/they)." |
| 4 | `WorkspaceHeader` (Evolve) | "Discard session" (red) | "Delete AI draft" |
| 5 | Story read page banner | "You have a story evolution in progress." + Discard/Continue | Quiet inline: "You have an unfinished draft of this story — continue editing" (spec 01 restyles; this spec owns wording) |
| 6 | `PublicHomePage` hero pill | "Digital tributes powered by AI" | Lead human, e.g. "A place to gather the stories of a life" (AI moves into a supporting section) |
| 7 | How It Works personas | "The Digital Twin" | Rename — e.g. "In Their Voice" — framed explicitly as a writing aid |
| 8 | `StoryStatsBar` (Stories hub) | "Evolved: N" stat | Remove |
| 9 | Connections stats | "Personas Used" | "AI personas" (or remove with spec 03 split) |
| 10 | Evolve `ToolPanel` header | "Ai Chat" | "AI chat" |
| 11 | `RewriteTool` empty states | "No summary yet — extract context" / "No facts pinned — pin facts in Context" / "no conversation yet — chat with a persona" | "The AI hasn't read your story yet — Start" / "Details from your story appear here" / "Chat with a companion to add more" |
| 12 | `ContextTool` vocabulary | "Extract context", "facts", "pin" | "Details from your story", "keep" |
| 13 | `RecentStoriesList` | "1 months ago" | Correct pluralization ("1 month ago") |
| 14 | `Footer.tsx:120` | "2026 Mosaic Life" (hardcoded) | "© {currentYear} Mosaic Life" |
| 15 | `AIAgentSection.tsx:50` | Raw HTML entity `&#128173;` | Remove/replace with icon |
| 16 | Default story titles | "Untitled Story – May 20, 2026" | Spec 01 owns (auto-title); listed for completeness |

## Mechanics beyond strings

**Partial dates (#2).** Store birth/death as year + optional month + optional day (or a precision flag on a date column) rather than a full date; render what's known ("1957 – 2025", "June 1957"). Requires a small migration + serializer change in `core-api` and a custom date input (year required, month/day optional) replacing the native control. This is the one item in this spec with backend impact — it can ship as its own PR or be cut to frontend-only ("year only" convention) per Q3.

**How It Works rewrite.** Keep the 4-step opener; compress the persona encyclopedia to one short section ("Four companions, four ways of asking"); move per-persona detail into the workspace's persona selector as in-context help.

## Open questions (owner second pass)

1. **"Evolve" as a name.** Keep it (it's distinctive, and spec 01 makes it opt-in), or rename the user-facing label to something plainer ("AI workspace", "Writing studio")? Internal code names can stay either way.
   → Decision:
2. **Homepage positioning.** The hero currently spans memorials *and* celebrations ("memorials, retirements, graduations, and living legacies"). Is the primary audience memorial-first (sharpen the copy accordingly) or genuinely both (keep the broad framing, soften the AI pill only)?
   → Decision:
3. **Partial dates scope.** Full backend support (precision-aware storage), or frontend-only year-optional convention for now?
   → Decision:
4. **"The Digital Twin".** Rename (proposed), or remove the persona from marketing until the ethics framing is worked out?
   → Decision:

## Acceptance criteria

- [ ] Every row in the inventory table is resolved (changed or explicitly owner-rejected).
- [ ] No user-visible string contains: "session", "extract", "context" (as a noun for AI data), "persona" outside AI-labeled surfaces, or "Death Date".
- [ ] A legacy can be created knowing only birth/death years, and renders "1957 – 2025".
- [ ] The homepage above-the-fold contains no AI mention; AI appears in a supporting section.
- [ ] How It Works fits in ~3 viewport heights at 1440×900.
- [ ] Grep for `Ai ` (broken casing) and `months ago` singular returns nothing.

## Suggested PR breakdown (<400 LOC each)

1. **String sweep** — inventory rows 1, 3–5, 8–15 in one pass (pure copy, no logic).
2. **Homepage reframe** — hero pill/copy + AI section (row 6; per Q2).
3. **Partial dates** — per Q3 (backend migration + custom input, or frontend convention).
4. **How It Works rewrite** — compress page; move persona detail in-context (rows 7 with Q4).
