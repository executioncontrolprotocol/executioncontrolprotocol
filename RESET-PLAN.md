# ECP Reset Plan — the CLI is the product

> Status: proposal · 2026-10-19 · replaces the direction in `ecp-overhaul.md`

## 1. What ECP is now

**ECP is the deterministic execution capability that a reasoning model calls.** It is not a
harness that wraps a model. The model (Claude, or any strong reasoning model) is the harness:
it reads a skill, discovers capabilities, writes a workflow, runs it, reads structured errors,
fixes the workflow and reruns it until it succeeds. ECP takes the deterministic part off the
model's plate so the model never spends reasoning tokens on step sequencing, retries, data
plumbing or connector calls.

```text
┌────────────────────────────────────────────────────────────────┐
│ Reasoning model (Claude / Opus)  — the harness                 │
│   knowledge files + skill  →  plans, authors, supervises       │
└───────────────┬────────────────────────────────────▲───────────┘
                │ ecp search / describe / validate    │ JSON results,
                │ ecp run / runs rerun                │ typed errors, run journal
┌───────────────▼────────────────────────────────────┴───────────┐
│ ECP  — deterministic, governed execution                       │
│   workflow (Fluent) → validate → run → journal                 │
│   capabilities from installed plugins:                         │
│     connectors · transforms · model calls · System-1 decisions │
└────────────────────────────────────────────────────────────────┘
```

Short reasoning still lives *inside* workflows, as capabilities: a `generate` step on a model
plugin, or a typed decision from a System-1 model (Reflex: Laya / so1 / Jev). The outer model
supervises the whole run; the inner calls are just steps.

**One-liner:** ECP is the agentic n8n/Zapier: an extensible CLI that a reasoning model drives
to build, run and repair governed automation, with every capability installable as a plugin.

This keeps the old thesis (reason at authoring, execute deterministically) and changes who
does the authoring and repair loop: the outer model, not an ECP-owned harness.

### What changes

| Before | After |
| --- | --- |
| ECP owns harnesses, prompts, intent routing, repair loops, evals | The host model is the harness. ECP ships a skill and a self-describing CLI |
| Browser demo is the main surface | The CLI is the main surface. MCP and App are plugins on top of it |
| Extensions bundled through aggregator packages | Each capability set is its own npm plugin, installed with `ecp plugins install` |
| Workflow file + environment module + imports of every extension package | One routine file: steps, bindings, policies and plugin needs together; missing plugins are offered for install on run |
| Many surfaces (serve, up, test, demo, harness) | Three modules: **CLI** (now), **MCP** (next), **App** (last) |

## 2. Principles

1. **CLI first.** Any capability ECP has is reachable as a CLI command. MCP and App are
   generated from the same registry, never hand-written in parallel.
2. **One plugin = one npm package = one extension.** Plugins declare capabilities with the
   existing `defineExtension` builder; nothing else is required to appear in both CLI and MCP.
3. **Model-legible everywhere.** `--json` on every command, stable error codes with `path`
   and `suggestions`, a run journal the model can read, and help text written for a model.
4. **No harness code.** No prompts, intent classifiers, EQL normalisers or eval matrices in
   this repo. If a model needs to know something, it goes in `--help`, `ecp describe`, or the
   skill.
5. **Governance stays.** Policies, staged state, approvals and budgets are the reason to run
   through ECP instead of calling APIs directly. They stay in core.
6. **Trim before adding.** Phase 1 deletes before Phase 2 builds.

## 3. Target architecture

### 3.1 Packages after the reset

```text
packages/
  types/            protocol types + JSON schema           (kept)
  core/             fluent API, registry, validate, runtime, policies hooks,
                    encoding (json + fluent), run journal  (trimmed)
  plugin-kit/       defineExtension re-export + toCommands() + toMcpTools()   (new)
  cli/              `ecp` bin: workflow commands + bundled core plugins       (rebuilt)
plugins/
  plugin-secrets      plugin-storage     plugin-jsonata      plugin-policies
  plugin-anthropic    plugin-openai      plugin-ollama       plugin-fal
  plugin-image-sharp  plugin-azure-blob  plugin-firefly      plugin-slack
  plugin-toon         plugin-mermaid
  plugin-mcp          (module 2)
  plugin-app          (module 3, rebuilt from apps/browser-demo)
  plugin-reflex       (later: System-1 decision capabilities)
```

Docs and the user-facing skill live in the existing `executioncontrolprotocol/docs` repo
(Mintlify, executioncontrolprotocol.io). The monorepo's `skills/ecp-core` is a contributor
skill for agents working on this repo; it gets trimmed to match the new package layout.

`runtimes/node` folds into core's node entry (`core/node`). The browser runtime goes because
the App now executes through the local CLI process, not in the browser.

### 3.2 The plugin contract

A plugin author writes one extension definition (as today) and one export line:

```ts
// plugins/plugin-jsonata/src/index.ts
import { defineExtension, capabilityFor, toCommands } from "@executioncontrolprotocol/plugin-kit"

export const extension = defineExtension("@executioncontrolprotocol", "jsonata")
  .withMetadata({ summary, description, useCases })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/jsonata", "transform")
      .withInput(inputSchema).withOutput(outputSchema)
      .withMetadata({ summary, description, useCases, projections })
      .withHandler(runJsonataTransform),
  ])
  .build()

export const COMMANDS = toCommands(extension)   // oclif explicit strategy
export default extension
```

```jsonc
// plugins/plugin-jsonata/package.json
{
  "name": "@executioncontrolprotocol/plugin-jsonata",
  "keywords": ["ecosystem:ecp-plugin", "oclif-plugin"],
  "ecp": { "extension": "./dist/index.js" },
  "oclif": {
    "commands": { "strategy": "explicit", "target": "./dist/index.js", "identifier": "COMMANDS" },
    "topics": { "jsonata": { "description": "Transform JSON payloads with JSONata expressions" } }
  },
  "peerDependencies": { "@executioncontrolprotocol/plugin-kit": "^1" }
}
```

What `toCommands()` generates for each capability:

- Command id `<plugin> <capability>`, e.g. `ecp jsonata transform`.
- Flags from top-level primitive fields of the input schema (`--expression`), plus
  `--input <file|->` for the whole input as JSON (stdin with `-`).
- `--json` output envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message, path, suggestions } }`.
- Summary, description, use cases and projections rendered into `--help`.
- Execution through the same policy pipeline as a one-step workflow (today's `ecp invoke`).

Generation is deterministic from the package's own definitions, so `oclif manifest` runs at
build time and startup stays fast. The `ecp` field lets MCP and App load the extension
directly without going through oclif.

### 3.3 Module 1 — the CLI

Core commands (reserved root names; plugins cannot claim these topics):

| Command | Purpose |
| --- | --- |
| `ecp init [name]` | Create an example routine file, `<name>.ecp.ts` |
| `ecp search <intent>` / `ecp describe [id]` | Capability discovery across installed plugins |
| `ecp validate <routine>` | Validate; missing plugins are listed with the install command |
| `ecp run <routine>` | Install missing plugins (with a prompt), then run with policies; writes a journal under `.ecp/runs/<id>/` |
| `ecp install <routine>` | Install every plugin the routine needs, without running it |
| `ecp runs list \| show <id> \| rerun <id> [--from <step>]` | Inspect and resume runs (replaces `ecp test *`) |
| `ecp invoke <capability-id>` | Generic single-capability call (generated commands are sugar for this) |
| `ecp compile <routine>` | Routine → portable workflow manifest + requirements |
| `ecp config secrets …` | Kept |
| `ecp plugins …` | From `@oclif/plugin-plugins`: install, uninstall, link, update, inspect, reset |
| `ecp discover` | Search npm for `ecosystem:ecp-plugin` packages (first-party flagged) |
| `ecp update` / `ecp rollback` | Update user plugins / remove user overrides of core plugins |

Removed: `serve`, `up` (moves to `plugin-app`), `test *` (folds into `runs`), `encode` and
`decode` (move to the format plugins).

**One file runs the whole routine.** There's no project config file and no separate
environment module. A routine is a single Fluent TS file that holds the steps, the bindings
(extension config), the policies, and optional plugin version pins:

```ts
// weekly-brief.ecp.ts
import { routine, step, ref, secret, policy } from "@executioncontrolprotocol/core"

export default routine("Weekly leadership brief")
  .requires({ "@executioncontrolprotocol/plugin-anthropic": "^1" })  // optional pins
  .bind("@executioncontrolprotocol/anthropic", {
    apiKey: secret("anthropic/api-key"),       // a reference; the value lives in `ecp config secrets`
    defaultModel: "claude-sonnet-5-5",
  })
  .policies([policy("@executioncontrolprotocol/policies.budget", { maxUsd: 2 })])
  .run([
    step("@executioncontrolprotocol/memory.search", "Collect signals")
      .with({ query: "risks and decisions this week", since: "7d" })
      .as("signals"),
    step("@executioncontrolprotocol/anthropic.generate", "Write the brief")
      .with({ prompt: "Create a concise leadership brief.", context: ref("signals.results") })
      .as("brief"),
  ])
```

Rules that make this work:

1. **The file imports only `@executioncontrolprotocol/core`.** The CLI resolves that import to
   its own copy, so a routine needs no `package.json` or `node_modules`. Relative imports of
   other local files are allowed, for example shared bindings. Capabilities, policies and
   bindings are referenced by string id and never by importing a plugin package. Today's
   examples import every extension package for side effects
   (`import "@executioncontrolprotocol/extension-openai"`). That has to go, because the file
   can't even load when a plugin is missing.
2. **Dependencies are read from the file before anything runs.** Required plugins are the
   explicit `.requires()` pins plus everything inferred from step, policy and binding ids.
   Inference uses the naming convention: `@scope/<name>.<capability>` comes from the package
   `@scope/plugin-<name>`. Plugins that don't follow the convention must be listed in
   `.requires()`. `ecp validate` says so when one is missing.
3. **Missing plugins are offered, not assumed.** `ecp run` compares what's needed with what's
   installed:
   - In an interactive terminal it prompts: `Install @executioncontrolprotocol/plugin-anthropic@^1? (Y/n)`.
   - `--yes` installs without asking (for scheduled and CI runs).
   - With `--json`, or when not interactive, it stops with `ECP_PLUGINS_MISSING`, listing each
     package and the exact `ecp plugins install …` command. A model reads that, installs, and
     reruns.
   - Plugin trust policy (allowed sources, third-party on or off) applies to every install.
4. **Workflow and environment stay separate in the output, not the source.** `ecp compile`
   still emits a portable workflow manifest with no bindings, secrets or policies, plus a
   separate requirements block. One file to author; the shareable artifact stays
   environment-free. This replaces the old "never collapse workflow and environment" rule
   in `AGENTS.md` with "one file to author, two parts after compiling".
5. **Secrets are references only.** `secret("key")` resolves at run time from the bound
   secrets provider (OS keychain locally, a cloud vault when hosted). The file never holds a
   value, so it's safe to commit and share.

`--env` and environment modules are removed. If several routines need the same bindings, they
import a local `shared.ecp.ts` that exports them.

**The model loop this has to make easy:**

```text
skill → ecp search / discover → write brief.ecp.ts → ecp validate --json → fix
      → ecp run --json → ECP_PLUGINS_MISSING? → ecp plugins install … → rerun
      → read journal / error codes → edit → ecp runs rerun --from <step>
      → green → brief.ecp.ts is now a reusable, deterministic automation in one file
```

Every error a model can hit gets a stable code (`ECP_CAPABILITY_MISSING`,
`ECP_INPUT_INVALID`, `ECP_POLICY_DENIED`, `ECP_STEP_FAILED`, …), documented on the docs site.

### 3.4 Module 2 — MCP (`plugin-mcp`)

`ecp mcp serve [--stdio | --http]` boots the same oclif config, so it sees exactly the
installed plugins, loads each one's `ecp.extension`, and registers tools with
`toMcpTools()`:

- **Meta tools, always on:** `ecp_search`, `ecp_describe`, `ecp_validate`, `ecp_run`,
  `ecp_runs_show`, `ecp_invoke`.
- **Capability tools:** one per capability (`jsonata_transform`), with name, description and
  JSON schema from the same metadata as `--help`. Clients that support tool search (Claude
  Code does) load them on demand, so a large catalogue costs nothing up front.
- `notifications/tools/list_changed` fires when a plugin is installed or removed.

Hosted MCP later is the same plugin behind HTTP with a cloud secrets binding (the
"custody is a binding" rule from the conceptual architecture still holds).

### 3.5 Module 3 — App (`plugin-app`)

`ecp app [routine.ecp.ts]` (a JIT plugin: the first call offers to install it) starts a local
server and opens the browser:

- Watches the Fluent file. When Claude edits it, the graph re-renders (hot reload).
- Edits in the graph write back to the Fluent file with the Fluent encoder, so the model sees
  them on its next read.
- Runs go through the local CLI process; per-step progress streams to the graph (reuses the
  React Flow run-progress hooks from `format-reactflow`).
- It's a viewer and co-editor, not a chat client and not a model host. No provider modal, no
  Chrome AI, no in-browser harness.

Built by carving the graph editor, Monaco pane and run panel out of `apps/browser-demo`; the
rest of the demo is dropped.

### 3.6 Docs site and the skill

- Keep the existing Mintlify site (`executioncontrolprotocol/docs`, executioncontrolprotocol.io,
  with `llms.txt`). Rewrite it around the CLI: concepts, the model loop, error codes, plugin
  authoring, a CLI reference generated from the oclif manifest, and a plugin catalogue
  generated from npm search. Pages that document harnesses, the browser demo and in-browser
  providers go.
- The existing `ecp` skill in the docs repo (`.mintlify/skills/ecp/` today) becomes the only
  harness ECP ships, rewritten to teach the loop above and point to `ecp --help`. Expose it at
  a path `npx skills add` can install from (for example a top-level `skills/ecp/SKILL.md` in
  the docs repo): `npx skills add executioncontrolprotocol/docs`. Everything else the model
  learns from the CLI.
- The monorepo's GitHub Pages workflow (which deploys the browser demo today) is removed in
  Phase 1.

## 4. What we borrow from Adobe I/O CLI

Studied: `adobe/aio-cli` (root), `aio-cli-plugin-app`, `aio-cli-plugin-runtime`,
`aio-cli-plugin-telemetry`, and `@oclif/plugin-plugins`.

| Adobe I/O pattern | How ECP uses it |
| --- | --- |
| Thin root CLI; everything else is `@adobe/aio-cli-plugin-*` listed in `oclif.plugins` (core plugins) | `ecp` bundles only help, plugins, not-found, autocomplete, update-warning and `plugin-secrets`. Everything else is a user plugin |
| Libraries split from plugins (`aio-lib-*` holds logic, plugin is a thin CLI shell) | Logic stays in the extension definition, and `plugin-kit` generates the CLI shell. Plugins never hand-write oclif commands |
| `aio discover` searches the npm registry and offers an interactive install | `ecp discover`, keyed on keyword `ecosystem:ecp-plugin` (the keyword Adobe planned and never finished), with `--json` for models |
| `aio update` separates core and user plugins and warns when a user plugin shadows a newer core one | `ecp update` and `ecp rollback`, same logic |
| `@oclif/plugin-plugins` with `oclif.scope` | `oclif.scope: "executioncontrolprotocol"` + `pluginPrefix: "plugin"`, so `ecp plugins install slack` resolves to `@executioncontrolprotocol/plugin-slack` |
| `@oclif/plugin-not-found` + a `command_not_found` hook | Unknown `ecp slack send` → suggest the plugin to install (prompt when interactive; print the exact command with `--json`) |
| Telemetry as a plugin built on hooks (`init`, `prerun`, `postrun`, `command_error`) | Fold today's `extension-telemetry` into an opt-in plugin built on the same hooks |
| oclif JIT plugins (`oclif.jitPlugins` + `jit_plugin_not_installed` hook) | `ecp app` and `ecp mcp` show in help before they are installed; the first use installs a pinned version |
| `plugins link` for local development | `ecp plugins link ./plugins/plugin-x` is the plugin-author workflow in the docs |

Also worth taking from our own closed `feat/plugin-install` branch (PR #23): plugin trust
policy (allowed source types, third-party plugins on or off). Re-implement it as an oclif
`preinstall`-style hook on top of `plugin-plugins` rather than as custom install code.

## 5. Keep, cut, move

Current size: about 83K lines of TS. The reset removes about 28K and moves about 12K into
`plugin-app`.

| Area | Lines | Decision |
| --- | ---: | --- |
| `core/src/harness/**` (authoring prompts, intent, repair loops) | 6.0K | **Cut** |
| `packages/harnesses/*` (browser-nano, browser-coding) | 9.3K | **Cut** |
| `packages/evals` + eval workflows + `test:eval:*` scripts | 3.5K | **Cut** |
| `format-eql` (only served the nano harness) | 4.5K | **Cut** |
| `chrome-ai`, `browser-secrets`, `runtimes/browser` | 3.2K | **Cut** (App runs through the CLI) |
| `runtimes/temporal` (stub) | 0.1K | **Cut**; revisit when hosted |
| `core` test-session, feedback, harness-artifact compile | ~1.2K | **Cut**; journal + `runs` replace them |
| `cli` serve, up, test | ~1K | **Cut / move** to App and `runs` |
| `apps/browser-demo` + `format-reactflow` | 12.2K | **Move**, slimmed, into `plugin-app` |
| `docs/*.md` reports and assessments, `ecp-overhaul.md` | — | **Archive** (git tag), replace with docs site |
| `core` registry, definitions, bindings, validate, runtime, encoding, fluent, patch, media, file | ~6.5K | **Keep** |
| `types`, `policies` | 3.2K | **Keep** (`policies` becomes `plugin-policies`) |
| All model, connector and transform extensions | ~25K | **Keep**, each as its own plugin |
| `extensions/index` aggregator | 0.1K | **Cut**; installing plugins replaces it |

Recovery: everything deleted is still at the `pre-reset` tag.

## 6. Phases

### Branching

All reset work happens on the long-lived branch `milestone/cli-reset`, cut from `development`
at `pre-reset`. Each phase is a `feat/…` branch with a PR into the milestone branch. When the
milestone is done, it merges to `development` and then to `main` as the 1.0 release.
Publishing only runs on `main` (`ENABLE_NPM_PUBLISH=true`), so nothing reaches npm until then.
Prerelease publishing for Phase 3 testing can come from the milestone branch under a `next`
dist-tag if needed.

### Phase 0 — Merge and freeze ✅ (2026-10-19)

1. PR #32 (`feat/projections`) merged into `development`.
2. `development` tagged `pre-reset` (`07e91a8`). `main` is untouched and nothing was published.
3. `milestone/cli-reset` created from `pre-reset`, starting with this plan.
4. Still to do: delete the stale branches `feat/build-cleanup`, `feat/delegation-testing`,
   `feat/memory-recall`, `feat/plugin-install`, `cursor/development-environment-setup-593c`,
   and the merged local branches.

### Phase 1 — Trim

Delete everything marked **Cut** in §5 in one PR, and park `apps/browser-demo` and
`format-reactflow` on the `pre-reset` tag (they come back in Phase 6). Drop the eval and demo
CI jobs. Make `build`, `lint` and the unit and integration tests green on what's left.

**Exit:** green CI, no harness or eval code, `core` under about 12K lines.

### Phase 2 — Plugin kit and the CLI core

1. `plugin-kit`: `toCommands()` (flags, `--input`, `--json` envelope, help rendering) and
   `toMcpTools()` (built now and unit-tested so the MCP phase is thin).
2. Rebuild `cli` around the §3.3 command table. Bundle the core oclif plugins, set the scope
   and prefix, and add the `command_not_found` hook, `discover`, `update` and `rollback`.
3. Error code catalogue and the run journal (`.ecp/runs/<id>/`: resolved graph, per-step
   input/output/timing/policy decisions/error).
4. Routine files (§3.3):
   - `routine()` with `.requires()`, `.bind()`, `.policies()` and `.run()`.
   - A loader that resolves `@executioncontrolprotocol/core` to the CLI's own copy.
   - Dependency inference from ids.
   - The missing-plugin prompt, `--yes` and `ECP_PLUGINS_MISSING`.
   - `ecp install <routine>`.
   - `compile` splitting the manifest from the requirements.
   - Port the examples from workflow + environment pairs to single routine files.

**Exit:** on a machine where `plugin-jsonata` isn't installed, `ecp run demo.ecp.ts` prompts
to install it, installs, and runs. With `--json`, it stops with `ECP_PLUGINS_MISSING` instead.

### Phase 3 — Plugins to npm

1. Move each extension to `plugins/plugin-<name>` with the §3.2 contract. Order: jsonata,
   storage, secrets, policies, anthropic, openai, ollama, then fal, image-sharp, azure-blob,
   firefly, toon, mermaid. `slack` stays unpublished until it has a real send handler (it's
   a mock today).
2. Switch from lockstep `bump-all` to Changesets: independent versions, `plugin-kit` as a
   peer with a `^1` range.
3. CI: `oclif manifest` + `npm pack` smoke test per plugin, and
   `ecp plugins install <tarball>` in a clean home directory.
4. Publish `cli` 1.0.0-beta + `plugin-kit` 1.0.0 + each plugin.

**Exit:** `npm i -g @executioncontrolprotocol/cli && ecp plugins install jsonata` works on a
clean machine.

### Phase 4 — Docs site and skill

In the `docs` repo: a CLI-first rewrite, generated CLI reference and plugin catalogue, error
code pages, and the rewritten `ecp` skill installable with `npx skills add`.

**Exit:** a fresh Claude Code session with only the skill installed builds and runs a
three-step workflow on its own. This is a manual dogfood run, not an eval harness.

### Phase 5 — MCP (`plugin-mcp`)

`ecp mcp serve` over stdio and HTTP, meta tools plus generated capability tools, and
list-changed notifications. Retire `packages/mcp`.

**Exit:** Claude Desktop connected over MCP can do the same three-step task through tool
search.

### Phase 6 — App (`plugin-app`)

Carve the graph editor, Monaco and run panel out of the `pre-reset` demo. Add the file watcher,
two-way Fluent sync and streamed run progress. Ship as a JIT plugin.

**Exit:** Claude edits `brief.ecp.ts` in the terminal and the graph updates live; a node edit
in the App shows up in the file.

### Later

- `plugin-reflex`: `decide.choice`, `decide.yesno` and `decide.score` capabilities backed by
  so1 readout, Laya or Jev. Typed decisions become ordinary workflow steps, and the outer
  model stays the supervisor.
- Hosted MCP plus a cloud secrets binding (Strata).
- Durable runtime (Temporal) once hosted execution is real.

## 7. Open decisions

1. **Routine file name.** Proposal: `*.ecp.ts`, so the CLI, the App watcher and editors can
   find routines by glob.
2. **User vs per-routine plugin versions.** oclif installs plugins per user, while a routine
   can pin with `.requires()`. If two routines pin incompatible majors, only one can be
   installed. Proposal: warn on a mismatch now and consider per-routine installs later.
3. **Flag generation depth.** Top-level primitives become flags and everything else goes
   through `--input` JSON. Revisit if models struggle with it.
4. **Command naming.** `ecp <plugin> <capability>` puts plugin names in the root namespace.
   The alternative is `ecp x <plugin> <capability>`. Proposal: root namespace, with core names
   reserved.
5. **Authoring format.** The single Fluent routine file is the canonical artifact. Patch and
   encode stay in core for MCP clients that can't edit files.
