# Phase 9 — 0.50.0 field-test

> Status: In progress · Branch: `feat/phase-9-050-versions` · Depends on: Phases 6, 7, 8 ·
> Plan: §2.4 (partial; live dogfood and 1.0 ship are Later)
>
> This is a **field-test**, not the 1.0 ship. Do not call the milestone Shipped. Do not
> `npm deprecate` 0.14 names. Do not dispatch `release-next.yml`. Do not reuse the existing
> `v1.0.0` tag (`a938230`). 1.0 leftovers live in [`later.md`](later.md).

## Goal

Publish **0.50.0** as npm `latest` from `main` so testers can `npm i -g @executioncontrolprotocol/cli`
and first-use JIT (`ecp mcp`, `ecp app`) can be proven against the registry. 0.14.0 stops being
the default. Stay on 0.x so testers do not treat this as stable 1.0.

## Honesty

- `RESET-PLAN.md` status stays a committed plan, not "Shipped".
- **Defer to 1.0** ([`later.md`](later.md)): `npm deprecate` of renamed/removed 0.14 packages;
  archive `extensions` / `browser-demo`; live Claude Code 3×3 / Desktop MCP / App graph
  sessions (criteria 7–9 as written).
- **§2.4 after publish:** criteria 1, 3, 4, 10 can run against the registry. Criterion 11
  needs docs `main`. Criteria 7–9 stay the local proofs in `reset/dogfood/` plus operator
  follow-up.
- Do not claim first-use JIT until post-publish smoke has run (`reset/dogfood/phase-9.md`).

## Tasks

### 1. Versions (do not let Changesets jump to 1.0.0)

Packages entered pre mode already at `1.0.0-next.0`. Exiting pre and applying the held
changesets as-is would produce 1.0.0.

1. `changeset pre exit` (removes `.changeset/pre.json`).
2. Set every workspace `package.json` that was `1.0.0-next.0` to `0.49.0`.
3. Replace pending changesets with one **minor** changeset listing every publishable package.
   A `major` from 0.49.0 would become 1.0.0.
4. `changeset version` → **0.50.0**. Consume the changeset so `main` has none left.
5. Point CLI `oclif.jitPlugins` at `"^0.50"` (`mcp` and `plugin-app`). `^1` would not install
   0.50.0.
6. Update `RELEASING.md`: pre mode off; `latest` is 0.50.0; 1.0 is Later.

`changesets/action` on `main` publishes when there are no remaining changesets
(`changeset publish` pushes any `package.json` version not yet on npm). Version on the
milestone; do not leave a Version Packages PR that could bump to 1.0.0.

### 2. Docs 0.50

Rewrite the public changelog/packages language to **0.50.0 field-test** (breaking vs 0.14,
1.0 later). Regenerate `llms.txt`. Merge into `feat/cli-reset-docs`, then PR to docs `main`
(Mintlify publishes `main`). Operator merges the docs-main PR.

### 3. Merge path

1. PR `milestone/cli-reset` → `development`. CI must be green.
2. Set `ENABLE_NPM_PUBLISH=true`. PR `development` → `main`. Operator merges. Publishing runs
   on `main` through `changesets/action`.
3. Verify on npm: every 0.50 package has `latest` = `0.50.0`. Optional annotated tag
   `ecp-0.50.0` on the release commit. Per-package tags come from Changesets. Do not reuse
   `v1.0.0`.

### 4. Post-publish smoke

After npm shows 0.50.0:

- Criterion 1: `npm i -g @executioncontrolprotocol/cli` then `ecp plugins install jsonata`
  and `ecp jsonata transform --help`.
- First-use JIT: `ecp mcp --help` / `ecp app --help` without `plugins link`.
- Record `reset/dogfood/phase-9.md`. Label Claude Code / Desktop / live graph as still
  operator follow-up.

## Exit criteria

- [ ] Packages are `0.50.0` (not `1.0.0` / `1.0.0-next.0`). CLI JIT pins `"^0.50"`. Changesets
  pre mode is off. No pending changesets that would bump to 1.0.0.
- [ ] `0.50.0` is npm `latest` after the `main` publish.
- [ ] Post-publish criterion 1 and JIT smoke recorded in `reset/dogfood/phase-9.md`.
- [ ] Docs on `feat/cli-reset-docs` say 0.50.0 field-test; docs `main` is an operator merge.
- [ ] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7 as **Done (0.50.0
  field-test)**. 1.0 leftovers stay in `later.md`. `milestone/cli-reset` is kept.

## Outcome

(Filled when the phase is Done.)

## Out of scope (1.0 / Later)

- `npm deprecate` of 0.14 names.
- Archive `executioncontrolprotocol/extensions` and `browser-demo`.
- Live Dogfood A/B/C sessions.
- `release-next.yml`, prerelease `@next`, or any 1.0.0 version bump.
