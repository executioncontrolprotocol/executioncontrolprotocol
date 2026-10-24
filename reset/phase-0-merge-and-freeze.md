# Phase 0 — Merge and freeze

> Status: ✅ Done 2026-10-19 · Branch: none (direct merges) · Depends on: —

## Goal

Land the open feature work, mark a recovery point, and open the milestone branch before
anything is deleted.

## What was done

| Step | Result |
| --- | --- |
| Merge PR #32 (`feat/projections` → `development`) | Merge commit `07e91a8`. CI was green: build, lint, unit, integration, browser, demo, consumer CLI |
| Tag the recovery point | Annotated tag `pre-reset` on `07e91a8`, pushed to `origin` |
| Leave `main` alone | `main` untouched. Pushes to `main` publish to npm (`ENABLE_NPM_PUBLISH=true`), and 0.14.1 is unpublished |
| Open the milestone | `milestone/cli-reset` cut from `pre-reset`; `RESET-PLAN.md` is its first commit |

## Still to do

Delete the stale branches. Each is either superseded or already merged:

| Branch | Last commit | Why it can go |
| --- | --- | --- |
| `feat/build-cleanup` | 2026-09-18 | CI hardening for the pre-monorepo vendor setup; superseded by PR #30 |
| `feat/delegation-testing` | 2026-03-24 | Pre-revamp Ollama experiment |
| `feat/memory-recall` | 2026-03-28 | Closed PR #22 |
| `feat/plugin-install` | 2026-03-24 | Closed PR #23. Its plugin trust idea is carried into Phase 3 |
| `cursor/development-environment-setup-593c` | 2026-03-28 | Closed PR #21 |
| Merged local branches (`feat/claude`, `feat/demo-updates`, `feat/projections`, …) | — | Already in `development` |

```bash
git push origin --delete feat/build-cleanup feat/delegation-testing feat/memory-recall feat/plugin-install cursor/development-environment-setup-593c
```

```bash
git branch --merged development | grep -v -E "^\*|main|development" | xargs git branch -d
```

These are destructive on the remote. Confirm with the repo owner before running the first
command.
