# AI Agent Instructions (Pointer)

This file intentionally contains no standalone guidance. A previous version duplicated
CLAUDE.md and drifted stale (it still described LiteLLM and the graph database as
"deferred" after both were in production). Guidance lives in exactly one place per topic:

| Topic | Source of truth |
|---|---|
| Agent behavior, architecture, commands, local env | [`CLAUDE.md`](../../CLAUDE.md) |
| Engineering playbook, planning, approval rules | [`AGENTS.md`](../../AGENTS.md) |
| Spec-driven workflow (OpenSpec: propose → approve → apply → archive) | [`docs/developer/SPEC-DRIVEN-WORKFLOW.md`](../../docs/developer/SPEC-DRIVEN-WORKFLOW.md) |
| Style, testing, security standards | [`docs/developer/CODING-STANDARDS.md`](../../docs/developer/CODING-STANDARDS.md) |
| Copilot-specific quick reference | [`.github/copilot-instructions.md`](../copilot-instructions.md) |
| Current capability specs (living) | `openspec/specs/` |

Hard rules that apply everywhere: docker compose only (never standalone `docker`), `uv` only
(never `pip`), no git worktrees, GitOps-only production changes, `just validate-all` + tests +
in-app verification before any work is called done.
