# UI/UX Review — July 2026

Distilled output of a full interface review (34 live screens + `apps/web` code audit) conducted 2026-07-07 at commit `9de7d52`. Long-form narrative with annotated screenshots: https://claude.ai/code/artifact/9c41a8e7-650b-4088-be3a-cd225c4102c2

## Contents

| Doc | Role |
|---|---|
| [`00-review-summary.md`](00-review-summary.md) | Durable record of findings with all `file:line` evidence. Read-only reference — don't edit during spec work. |
| [`specs/01-story-lifecycle.md`](specs/01-story-lifecycle.md) | **P0.** Split Read / Edit / Evolve; kill workspace side effects; auto-titling. |
| [`specs/02-story-responses.md`](specs/02-story-responses.md) | **P1.** Comments + reactions on stories; invite moment; humanized activity. Backend work. |
| [`specs/03-navigation-ia.md`](specs/03-navigation-ia.md) | **P0/P1.** Gate mock surfaces (Community, Explore stubs, mock gallery); split People vs AI; footer. |
| [`specs/04-voice-and-copy.md`](specs/04-voice-and-copy.md) | **P1.** Grief-register copy inventory; partial dates; How It Works rewrite. |
| [`specs/05-finish-and-feedback.md`](specs/05-finish-and-feedback.md) | **P0–P2.** Toaster, native dialogs, emoji icons, covers, mobile name break, themes/dark mode, hygiene. |
| [`screens/`](screens/) | 13 compressed screenshots referenced by the docs (evidence, not documentation). |

## Status

| Spec | Owner second pass | Plan | Implementation |
|---|---|---|---|
| 01 story-lifecycle | ☑ | ☑ [`story-lifecycle-split`](../../../openspec/changes/story-lifecycle-split/proposal.md) | ☑ |
| 02 story-responses | ☐ | ☐ | ☐ |
| 03 navigation-ia | ☐ | ☐ | ☐ |
| 04 voice-and-copy | ☐ | ☐ | ☐ |
| 05 finish-and-feedback | ☐ | ☐ | ☐ |

## Workflow

Each spec is **self-contained** — it carries its own context capsule, evidence references, and PR breakdown, so a fresh session (or a teammate) can work one spec without loading this conversation, the summary, or the other specs.

1. **Second pass (you).** Edit the spec directly: answer each `→ Decision:` line inline, cut or rescope anything you disagree with, then flip `Status: SEED` to `Status: APPROVED`. The open-questions sections are the entire review surface — everything else is evidence and proposal.
2. **Propose (OpenSpec).** For each approved seed, run `/opsx:propose` referencing it (e.g. *"Propose `story-read-page` from `docs/design/2026-07-ui-review/specs/01-story-lifecycle.md`, PR 1"*). One OpenSpec change per coherent slice — the seed's PR breakdown is the natural slicing. The seed stays as requirement provenance; the change's proposal/design/tasks/spec-deltas are the implementation contract. See [docs/developer/SPEC-DRIVEN-WORKFLOW.md](../../developer/SPEC-DRIVEN-WORKFLOW.md).
3. **Track.** One GitHub issue per spec linking the doc; checkboxes per OpenSpec change/PR. Update the status table above as things land.
4. **Implement.** `/opsx:apply` per change; quality gates per SPEC-DRIVEN-WORKFLOW.md §4 (validate + tests + in-app verification); `/opsx:archive` after merge so `openspec/specs/` stays the living truth.

### Sequencing notes

- **01 first** — it's the core loop, and 02 renders onto its Read page.
- **05 items 1–2** (toaster, mobile name) are independent and can ship immediately, in parallel with anything.
- **03's mock-surface gating** is also independent and fast; the People/AI split lands better after 01 stops generating orphan conversations.
- **04** is a low-risk sweep; do it after 01 so the Evolve strings it renames aren't moving underneath it. Partial-dates (its one backend item) can ship anytime.
- **02** needs backend endpoints — spec flags the API surface; give the data model its own review during planning.
