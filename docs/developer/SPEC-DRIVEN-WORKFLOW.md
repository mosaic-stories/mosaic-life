# Spec-Driven Workflow

**Status:** Active — this is the canonical description of how changes move from idea to production.
**Audience:** Humans and AI assistants (Claude Code, GitHub Copilot, Codex). Assistant instruction files (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`) reference this document rather than restating it.

## Tooling decision

We use **[OpenSpec](https://openspec.dev)** (`@fission-ai/openspec`, initialized in this repo) as the spec-driven backbone. Its change-based model — proposal, design, tasks, and spec *deltas* that archive into living capability specs — fits our incremental, PR-scale delivery better than heavier alternatives.

We evaluated **[Spec Kit](https://speckit.org)** and are not adopting its CLI: running two scaffolds with overlapping slash commands would confuse humans and agents alike. We borrow its two best ideas instead:

- **Constitution** → we already have one: `AGENTS.md` + `docs/developer/CODING-STANDARDS.md`. Proposals never restate these; they inherit them.
- **Clarify-before-plan** → every proposal carries an explicit **Open Questions** section that must be answered by a human before implementation begins (see the gate below).

Revisit this decision only if OpenSpec stops being maintained or the workflow outgrows it.

## The pipeline

```
Requirements ──► Propose ──► Approve ──► Apply ──► Validate ──► PR ──► Archive
 (inputs)      /opsx:propose  (human)  /opsx:apply  (gates)   (merge)  /opsx:archive
```

### 0. Requirements capture (inputs)

Requirements arrive as: design-review findings (e.g. `docs/design/2026-07-ui-review/specs/`), GitHub issues, or direct product decisions. A requirement is ready for the pipeline when a human has made the judgment calls — a seed doc with unanswered "Decision:" lines is **not** ready to propose.

### 1. Propose — `/opsx:propose`

Creates an OpenSpec change (managed by the CLI under `openspec/`) containing:

- **proposal.md** — what & why. Must include **Non-goals** and **Open Questions**.
- **design.md** — how. For anything non-obvious (schema/contract changes, new dependencies, auth flows, cross-cutting concerns), present **1–3 approach options with trade-offs and a recommendation** — this preserves the AGENTS.md planning ethos inside the OpenSpec artifact.
- **tasks.md** — implementation steps, each sized so the resulting PR stays **< 400 LOC**, each ending with its validation step (see gates).
- **spec deltas** — ADDED/MODIFIED/REMOVED requirements against the living specs in `openspec/specs/`.

Run `openspec validate` before requesting review.

### 2. Approve (human gate)

No implementation starts until a human has:
1. Answered every Open Question in the proposal.
2. Selected an approach where design.md offers options.

For assistants: if you find yourself implementing against an unapproved proposal, stop and ask. Exceptions (no proposal needed): internal refactors with no behavior change, test additions, doc fixes, CI fixes that don't affect deploy behavior.

### 3. Apply — `/opsx:apply`

Implement tasks in order. Work on `develop` or a feature branch in the main workspace (no git worktrees — they disconnect from the running compose stack). Each task lands as its own commit(s); Conventional Commits format.

### 4. Validate (quality gates — all changes, every time)

| Gate | Command / action | Applies to |
|---|---|---|
| Lint + types (backend) | `just validate-backend` | any `services/` change |
| Lint + types (frontend) | `just validate-frontend` | any `apps/web` change |
| Both | `just validate-all` | full-stack changes |
| Unit/integration tests | `uv run pytest` / `npm run test` | code with new behavior; ≥80% coverage on new code |
| E2E | `npm run test:e2e` (Playwright) | user-facing flows touched |
| **Verification** | Drive the affected flow in the running app (compose stack) and observe the behavior — not just tests passing | every change with a runtime surface |
| Migrations | `uv run alembic upgrade head` on a fresh DB + downgrade check | schema changes |

A task is not done because it compiles; it is done when the gate evidence exists. Record verification evidence (what was exercised, what was observed) in the tasks.md checklist or PR description.

### 5. PR

- **< 400 LOC**, squash-merge, Conventional Commit title, linked GitHub issue, and a reference to the OpenSpec change ID.
- PR description states: what changed, gate evidence, migration/rollback notes if applicable.

### 6. Archive — `/opsx:archive`

After merge, archive the change. This folds the spec deltas into `openspec/specs/` — the living, always-current description of what the system does. This is the maturity step `docs/plans/` never had: knowledge stops being frozen in dated files.

## Directory roles

| Location | Role |
|---|---|
| `openspec/specs/` | **Living truth** — current capability specs, updated only via archive |
| `openspec/` changes (CLI-managed) | In-flight work: proposal / design / tasks / deltas |
| `openspec/config.yaml` | Project context + per-artifact rules injected into AI-generated artifacts |
| `docs/design/` | Design reviews & research → requirement sources for proposals |
| `docs/plans/` | **Legacy, read-only.** Pre-OpenSpec design/plan pairs. Do not add new documents; migrate content into proposals as areas get touched |
| `docs/adr/` | Architecture decision records (unchanged) |

## Slash commands (all three assistants)

Installed by `openspec init` for Claude Code (`.claude/commands/opsx/`), Codex (`.codex/skills/`), and GitHub Copilot (`.github/prompts/`):

- `/opsx:propose` — create a change with all artifacts
- `/opsx:apply` — implement an approved change's tasks
- `/opsx:archive` — archive after merge, updating living specs
- `/opsx:explore` — think through a problem against current specs
- `/opsx:sync` — refresh spec state

Keep integrations current with `openspec update` after upgrading the CLI.

## Worked example: the July 2026 UI review

The review at `docs/design/2026-07-ui-review/` produced five seed docs with `→ Decision:` lines. The flow for each:

1. Owner answers the decision lines, flips the seed to `APPROVED` (requirements ready).
2. `/opsx:propose` referencing the seed — e.g. spec 01 becomes changes like `story-read-page`, `story-edit-page`, `evolve-lazy-sessions` (one change per coherent slice, honoring the seed's PR breakdown).
3. Approve → apply → gates → PR per slice → archive.

The seed docs remain as requirement provenance; the living specs in `openspec/specs/` become the current truth about story reading/editing behavior.
