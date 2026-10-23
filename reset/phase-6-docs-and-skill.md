# Phase 6 — Docs site and skill

> Status: Done 2026-10-23 · Docs branch: `feat/cli-reset-docs` (PRs 1–3) · ECP branch:
> `feat/phase-6-dogfood-and-handoff` · Depends on: Phase 5 · Plan: §4.9
> · Do not start Phases 7 and 8 in this PR
>
> **Starting point after Phase 5:** 13 plugins under `plugins/`. Changesets in pre-`next`
> (`1.0.0-next.0` for core, node, browser, cli, plugin-sdk, and every plugin). No `@next` on
> the registry yet — install is proven with packed tarballs (`plugin-pack-smoke`). Journals
> and `ecp runs` shipped in Phase 4. MCP is still `0.14.1` until Phase 7.

## Goal

Rewrite the docs site around the CLI and the agent loop, and turn the `ecp` skill into the
only harness ECP ships, installable with `npx skills add`. A model should learn the rest from
`ecp --help`.

## Scope

**In:**

- The docs repo: navigation, page rewrites, generated reference pages.
- The skill.
- The dogfood run that proves it.

**Out:**

- MCP and App pages beyond placeholders. Phases 7 and 8 fill them in.

## Tasks

### 1. Navigation and pages

Current navigation (from `docs.json`) and what happens to each page:

| Page | Action |
| --- | --- |
| `index` | Rewrite. ECP as deterministic delegation for agents; the determinism ladder; install in two lines |
| `getting-started/quickstart` | Rewrite. `npm i -g @executioncontrolprotocol/cli`, `npx skills add …`, `ecp init`, `ecp run` |
| `getting-started/browser-demo`, `browser-demo-providers` | **Remove** |
| `getting-started/build-from-source` | Update for the new package layout and Changesets |
| `learn/why-ecp` | Rewrite around delegation and the self-healing loop |
| `learn/concepts` | Rewrite. Workflow, environment, extension, policy, plugin, run, journal |
| `learn/relationship-to-mcp` | Update. ECP capabilities are exposed *as* MCP tools |
| `learn/security` | Update. Plugin trust, custody in environments, additive policies, journal redaction |
| `guides/fluent-api` | Becomes **Workflow files**. `workflow().with([...]).run([...])`, `.requires()`, inference |
| `guides/environments` | Rewrite. Environments as hosts, `.supports()`, layering, user and team environment files |
| `guides/extensions` | Becomes **Writing a plugin**. `defineExtension`, `plugin-sdk`, `toCommands`, `plugins link`, publishing with the keyword |
| `guides/files-and-media` | Keep and update the imports |
| `guides/encode-decode-patch` | Becomes **Formats and converters**. Format plugins, `--format`, patch |
| `alternatives/*` | Keep; update positioning lines |
| `ai-tools/cursor`, `claude-code`, `windsurf` | Rewrite. Install the skill; optionally connect `ecp mcp serve` |
| `reference/cli` | **Generated** (see task 2) |
| `reference/schemas` | Update. Add the requirements schema and the journal format |
| `reference/packages` | Rewrite. The seven packages plus plugins |
| `reference/changelog` | Keep |

New pages:

- `guides/agent-loop`: author, validate, run, read the journal, rerun.
- `guides/policies`: budget, approval, state-control plugins; writing a policy.
- `guides/mcp` (placeholder until Phase 7).
- `guides/app` (placeholder until Phase 8).
- `reference/error-codes`: one section per `ECP_*` code with cause, example payload and fix.
- `reference/plugins`: generated catalogue.
- `reference/journal`: the `journalVersion: 1` format.

### 2. Generated reference

- `scripts/gen-cli-reference.mjs` builds `reference/cli.mdx` from the oclif manifests of the
  CLI and every first-party plugin, installed from `@next`. Each command gets its summary,
  flags, examples and `--json` output shape.
- `scripts/gen-plugin-catalog.mjs` builds `reference/plugins.mdx` from
  `registry.npmjs.org/-/v1/search?text=keywords:ecosystem:ecp-plugin`. First-party plugins come
  first; third-party plugins are labelled.
- A docs CI job reruns both and fails if the committed output is stale.
- Keep `llms.txt` and regenerate it from the new navigation.

### 3. The `ecp` skill

- Move `.mintlify/skills/ecp/` to a top-level `skills/ecp/` in the docs repo, so
  `npx skills add executioncontrolprotocol/docs` finds it. Keep a copy or link where Mintlify
  serves skills, if it still needs one.
- `SKILL.md` teaches:
  - When to delegate to ECP (repeatable, governed, deterministic work) and when not to.
  - The loop: `ecp search` / `discover` → write `*.ecp.ts` → `ecp validate --json` →
    `ecp run --json` → read `runs show` → fix → `runs rerun --from`.
  - How to read error codes and what each one asks the agent to do.
  - Installing plugins (and that third-party plugins need user approval).
  - Never putting secret values in workflow files.
- References, rewritten from today's `cli-ops`, `environments`, `extensions`, `fluent`,
  `secrets-and-config`, `examples` and `escalation`:
  - `workflow-files.md`
  - `environments.md`
  - `plugins.md`
  - `errors.md`
  - `examples.md` (the three dogfood workflows)
  - `escalation.md`: when to stop and ask the user, such as approvals, missing secrets or
    untrusted plugins.
- Keep the skill short; point to `ecp <command> --help` for anything the CLI already says.

### 4. Dogfood A

The test for this phase, from §2.4 criterion 7. Run it three times, each in a fresh Claude
Code session with only the skill installed and the CLI from `@next`.

| Task | Plugins | Injected failure |
| --- | --- | --- |
| Reshape a JSON export into a summary object and save the result | jsonata | A wrong JSONata path, which fails `ECP_STEP_FAILED` |
| Resize a product photo, upload it with approval, return a share link | image-sharp, azure-blob-storage, approval | A wrong `ref()` field on upload (`ECP_INPUT_INVALID`) |
| Generate a caption with a model, convert the workflow to Mermaid for a PR | anthropic or ollama, format-mermaid | Plugin not installed (`ECP_PLUGINS_MISSING`) |

Record each run in `reset/dogfood/phase-6-<n>.md` in the ECP repo:

- The prompt used.
- Commands the agent ran.
- Where it got stuck.
- Whether it recovered without help.

Pass means all three tasks succeed in all three runs, with recovery from the injected
failure, and no human edits to the workflow file. Anything the agent stumbles on becomes a
docs, skill or `--help` fix in this phase.

## Exit criteria

- [ ] Docs site deployed with the new navigation; no page mentions harnesses, the browser
      demo, Chrome AI or EQL. **Correction:** rewrite is on `feat/cli-reset-docs`; docs `main`
      was not merged (public site unchanged).
- [x] CLI reference and plugin catalogue are generated and checked in CI (from the ECP
      checkout, not unpublished `@next`).
- [ ] `npx skills add executioncontrolprotocol/docs` installs the rewritten skill.
      **Correction:** `skills/ecp/SKILL.md` exists on `feat/cli-reset-docs`; GitHub
      default-branch discovery is unproven until that rewrite is on the default branch.
- [ ] Dogfood A passes (three tasks × three runs), with records committed.
      **Correction:** three local proofs in `reset/dogfood/phase-6-1.md` … `phase-6-3.md`.
      The 3×3 Claude Code matrix is operator follow-up after `@next` exists.
- [x] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Outcome

Phase 6 is **Done** with the corrections below. Docs PRs 1–3 merged into `feat/cli-reset-docs`
([docs#1](https://github.com/executioncontrolprotocol/docs/pull/1),
[docs#2](https://github.com/executioncontrolprotocol/docs/pull/2),
[docs#3](https://github.com/executioncontrolprotocol/docs/pull/3)). This ECP PR records
dogfood fixtures and handoff.

- First-party npm is still unpublished. Generated reference and dogfood use the ECP checkout /
  local CLI (`node packages/cli/bin/run.js` + `ecp plugins link`), not
  `npm i -g @executioncontrolprotocol/cli@next`.
- Plugin catalogue first-party list comes from `plugins/plugin-*`. The npm keyword search for
  `ecosystem:ecp-plugin` was empty.
- Docs live on `feat/cli-reset-docs` and were **not** merged to docs `main`. `release-next.yml`
  was not dispatched.
- `npx skills add executioncontrolprotocol/docs` is the install path. The skill is at
  `skills/ecp/` (`.mintlify/skills/ecp/` is a pointer). Unproven against GitHub default-branch
  discovery until merge to the docs default branch.
- Dogfood records three local proofs; §2.4 criterion 7 (3 tasks × 3 fresh Claude Code
  sessions) is operator follow-up.
- MCP and App pages are placeholders.

Local proof notes the engine actually returned:

- Task 1 injected failure: `ECP_STEP_FAILED` (wrong JSONata path).
- Task 2 injected failure: `ECP_STEP_FAILED` (wrong `ref()` field; Zod `invalid_type`).
  `ECP_REF_UNRESOLVED` for `thumb.nope`. `ECP_SECRET_MISSING` if `secrets()` is unbound.
  Fixed graph paused with `ECP_RUN_PAUSED` (approval).
- Task 3 injected failure: `ECP_PLUGINS_MISSING`. Encode needs a compiled workflow wrap
  (`source` + `sourceSchema`). Ollama generate 404 for `llama3.2` on this host.

Do not start Phase 7 or Phase 8 in this PR.

## Risks

| Risk | Mitigation |
| --- | --- |
| The skill and `--help` drift apart | The skill points to `--help` instead of copying it; generated reference pages are checked in CI |
| Dogfood depends on paid API keys | Task 3 can use Ollama; tasks 1 and 2 need no model |
