# ECP reset — phase docs

These are the working docs for the `milestone/cli-reset` milestone. `RESET-PLAN.md` at the
repo root holds the decisions and the target architecture; each phase doc here holds the
detail needed to do the work: scope, file-level tasks, design notes, tests and exit criteria.

| Phase | Doc | Status | Depends on |
| --- | --- | --- | --- |
| 0 | [Merge and freeze](phase-0-merge-and-freeze.md) | ✅ Done 2026-10-19 | — |
| 1 | [Trim](phase-1-trim.md) | ✅ Done 2026-10-22 | 0 |
| 2 | [Consolidate core and environments](phase-2-core-and-environments.md) | ✅ Done 2026-10-23 | 1 |
| 3 | [Plugin SDK and CLI](phase-3-plugin-sdk-and-cli.md) | ✅ Done 2026-10-23 | 2 |
| 4 | [Workflow files and observability](phase-4-workflow-files-and-observability.md) | ✅ Done 2026-10-23 | 3 |
| 5 | [Plugins to npm](phase-5-plugins-to-npm.md) | Planned | 4 |
| 6 | [Docs site and skill](phase-6-docs-and-skill.md) | Planned | 5 |
| 7 | [MCP](phase-7-mcp.md) | Planned | 5 |
| 8 | [App](phase-8-app.md) | Planned | 5 |
| 9 | [1.0 release](phase-9-release.md) | Planned | 6, 7, 8 |
| — | [Later](later.md) | Not scheduled | 9 |

Phases 6, 7 and 8 only depend on Phase 5 and touch different packages, so they can run in
parallel once Phase 5 lands.

## How every phase works

- **Branch:** `feat/phase-<n>-<slug>` cut from `milestone/cli-reset`. One PR per phase into
  `milestone/cli-reset`. Large phases may split into several PRs; each must leave CI green.
- **One commit per phase** (or per PR when a phase splits). Follow-up commits only for CI
  failures that don't reproduce locally. Tests run at checkpoints (`build` + `test:unit` after
  source/test work; `check` + `test:browser` before the phase commit), not after every task.
  The pre-commit hook still runs once on that commit.
- **Never touch `main` or `development`** until Phase 9. Pushes to `main` publish to npm.
- **Recovery point:** tag `pre-reset` (`07e91a8`) has everything as it was before the reset.
  Code that a later phase revives (the demo UI for `app`, the React Flow encoder) is copied
  from there with `git checkout pre-reset -- <path>`.
- **Commit trailers:** end each commit with the `Co-Authored-By` trailer used in this repo.
- **Pre-commit:** husky runs lint and unit tests. Don't skip it.
- **Honesty rule:** if something is stubbed, mocked or deferred, say so in the PR description
  and in the code, and never ship it as if it were real.
- **Docs for handoff:** every phase commit updates its phase doc (status + Outcome), the next
  phase doc's file paths, this table, `RESET-PLAN.md` §7, `AGENTS.md`, affected rules/skills
  and package READMEs. A fresh agent must be able to start the next phase from the repo alone.
- **Done means:** every exit criterion in the phase doc is checked off in the PR description,
  and the phase's status in this table and in `RESET-PLAN.md` §7 is updated in the same PR.

## Running a phase with a coding agent

The repo's agent instructions are already set up for the milestone:

- `CLAUDE.md` (Claude Code) and `AGENTS.md` (other agents) point here.
- `.cursor/rules/reset-milestone.mdc` (always on) does the same for Cursor.

Start a fresh agent session in the repo for each phase and give it this prompt, replacing the
phase number and doc name:

```text
You're executing Phase 1 of the ECP CLI reset in this repo.

Read first, in order: RESET-PLAN.md (decisions and target architecture), reset/README.md
(how phases work), then reset/phase-1-trim.md (your task). On this branch those documents
override AGENTS.md, .cursor/rules and any older docs wherever they disagree.

Work on a new branch feat/phase-1-trim cut from milestone/cli-reset, and open one PR into
milestone/cli-reset. Never push to main or development (pushes to main publish to npm).

Follow the phase doc's task order. One commit per phase (or per PR when splitting). Keep the
pre-commit hook on; don't skip tests or weaken gates to get green. If something in the doc
turns out to be wrong or impossible, stop and tell me rather than improvising; propose the
fix to the doc in the PR.
Label anything stubbed or deferred honestly.

Done = every exit criterion in the phase doc checked off in the PR description with
evidence, CI green on the PR, and the phase status updated in reset/README.md and
RESET-PLAN.md §7.
```

Then:

1. Review the PR against the phase doc's exit criteria, not just green CI.
2. Merge it into `milestone/cli-reset`.
3. Start the next phase in a new session.

Run one phase at a time through Phase 5; Phases 6, 7 and 8 can run in parallel after that.

## Section references

`§` numbers refer to `RESET-PLAN.md`:

| Section | Topic |
| --- | --- |
| §4.1 | Core |
| §4.2 | Plugin contract, naming, format plugins |
| §4.3 | Workflow files and `.with([...])` |
| §4.4 | Environments |
| §4.5 | CLI commands, bundled plugins, hooks |
| §4.6 | Run journal, events, error codes |
| §4.7 | MCP |
| §4.8 | App |
| §4.9 | Docs site and skill |
| §5.4 | Extension and plugin audit |
| §5.7 | Removal checklist |
| §8 | What carries forward |
