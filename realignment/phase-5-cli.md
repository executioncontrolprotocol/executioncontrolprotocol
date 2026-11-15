# Phase 5 — CLI and the background-host decision

**Goal:** the `ecp` CLI with every MVP command, host discovery with in-process fallback,
plugin management, and the benchmark-driven decision on the background host.

**Depends on:** Phases 3 and 4. **Spec:** 10, 06 (exit codes), 08 (install hook), 12 (benchmarks).

## Tasks

1. **Package and bin:** oclif config (`bin: ecp`, `dirname: ecp`, bundled core plugins per 10, `topicSeparator: " "`), `init` hook setting `ECP_DATA_DIR` and creating `$ECP_HOME`.
2. **Commands** exactly as in spec 10: `host start|stop|status|restart|logs`, `mcp start` (delegates to `mcp-relay` — implemented in Phase 6; until then the command exists and fails with a clear "not yet available" error that Phase 6 removes), `app` (Phase 7 completes the UI; this phase opens the URL), `retrieve`, `execute`, `commit`, `plugins *` (oclif) with manifest-check and marker hooks, `secrets set|unset|list`, `schema`.
3. **Host discovery** (10): HTTP client when healthy, `--start-host`, in-process fallback with the stderr tip, draining wait.
4. **Input handling:** `--input/--object/--patch` as JSON, `@file`, `-`; path resolution; positional `path | id` rule; `--filter key=value`.
5. **Output:** human formats, `--json` envelope only on stdout, `--out`, exit codes from the catalogue, `NO_COLOR`/non-TTY handling.
6. **Plugin hooks:** post-install/link manifest check (warn) and marker touch for install/uninstall/link/update. No trust check.
7. **Benchmarks:** implement `bench/run.mjs` (B1–B7), run on Ubuntu and Windows, apply the decision rule in spec 12, write the outcome and numbers into `REALIGNMENT-PLAN.md` "Measurements" and, if the rule says so, implement auto-start with idle shutdown (15 min idle and no active runs → supervisor stops; `ecp host start` stays available) in this phase. Set budgets in `bench/budgets.json` and enforce them in the CI `bench` job.

## Tests (E2E: spawned `ecp`, temp `ECP_HOME`)

- Every command's happy path and `--json` envelope; exit codes for 0/1/2/3/4 cases.
- `execute` with a path, an id, `--validate`, `--no-wait` then `retrieve --type run --id`, `--resume`, `--cancel`, `--out`.
- In-process vs warm-host parity (A9): same `data` for A1–A5 commands.
- `plugins link` of `plugin-test` → host restarts (when running) and `retrieve` shows capabilities; `plugins install` from a packed tarball of `plugin-test` (`pnpm pack`) into the temp data dir; manifest warning for a package without `ecp.manifest.json`.
- `secrets set` via stdin never echoes; `secrets list` shows keys and sources; `unset` missing key → exit 2.
- Human output snapshots (stable, no colour) for `retrieve` list, `execute` success, `execute` failure with issues.

## Exit criteria

- [x] All commands implemented and tested (e2e under `test/e2e/cli/**`; CI runs e2e on Ubuntu and Windows).
- [x] A1 (CLI half), A3, A4, A5, A7, A9 pass through the CLI (`test/e2e/cli/commands.test.ts`, `parity.test.ts`, `plugins.test.ts`).
- [x] Benchmark decision recorded in `REALIGNMENT-PLAN.md` Measurements: keep in-process fallback (B3 warm savings 85 ms &lt; ~300 ms). Budgets in `bench/budgets.json`, enforced by `pnpm run bench`. Spec 10 unchanged.
