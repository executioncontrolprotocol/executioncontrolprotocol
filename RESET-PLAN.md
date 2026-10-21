# ECP Reset Plan — deterministic delegation for agents

> Status: committed plan · branch `milestone/cli-reset` · baseline tag `pre-reset` (`07e91a8`)
> Decided 2026-10-19/20. Replaces the direction in `ecp-overhaul.md`.

## 0. Summary

- **The flip.** ECP stops being the thing that orchestrates agents. It becomes the
  **deterministic delegation capability** that agents use. An orchestrating agent (Claude,
  Opus, …) authors workflows, runs them, watches them, and repairs them when they fail. ECP
  does the deterministic work so the agent doesn't spend reasoning on it.
- **ECP is part of a harness, never the whole harness.** No harnesses, prompts, intent
  routers or eval matrices ship from this repo. The only harness is one skill on the docs
  site.
- **Packages:** `core` runs ECP in Node or browsers. `cli` is the primary surface and `mcp`
  the second. Every capability set is its own npm plugin. The visual app is a plugin too.
- **One workflow = one file.** A Fluent TS file declares its steps (`.run()`) and, in a single
  `.with([...])` array, the extension, policy and runtime bindings ECP already has. Version pins
  go on the bindings (`.requires()`). Running it with missing plugins prompts to install them.
- **Built to be supervised:** `--json` everywhere, stable error codes, a run journal, live
  events, and resume from any step. That is what makes the agent's self-healing loop possible.
- **Order:** trim → consolidate core → CLI and plugins → workflow files and observability → npm →
  docs and skill → MCP → App → 1.0.

## 1. The flip

### Before

```text
ECP harness (prompts, intent routing, repair loops, evals)
  └── model inside ECP authors and patches workflows
        └── workflow runs capabilities
```

ECP tried to own the whole agent experience. Every new model, prompt style or client meant
more harness code here, plus evals to keep it honest.

### After

```text
┌───────────────────────────────────────────────────────────────────┐
│ Orchestrating agent (Claude Code, Claude Desktop, any harness)    │
│   knowledge files + ecp skill + reasoning                         │
│   plans · authors workflows · monitors runs · repairs · reruns    │
└──────────────┬───────────────────────────────────▲────────────────┘
   delegates   │ CLI (ecp …) or MCP tools           │ JSON results, error codes,
   determinism │                                    │ journal, live events
┌──────────────▼───────────────────────────────────┴────────────────┐
│ ECP: deterministic, governed execution                            │
│   signups.ecp.ts → validate → run → journal                       │
│   capabilities from installed plugins:                            │
│     connectors · transforms · model calls · System-1 decisions    │
└───────────────────────────────────────────────────────────────────┘
```

- The **agent** owns judgement: what to build, what a failure means, how to fix it, and
  whether a change in the world needs a different workflow.
- **ECP** owns determinism: step order, data flow, retries, policies, budgets, approvals,
  staged state, secrets custody, and a faithful record of what happened.
- **Small agent actions inside workflows are fine.** A `generate` step or a System-1 typed
  decision is just a capability, and the outer agent supervises the run that contains it.

### The self-healing loop

```text
author ─► validate ─► run ─► observe
   ▲                           │
   │                     success? ── yes ─► workflow is reusable; schedule it
   │                           │ no
   └── repair ◄── diagnose ◄───┘  (error code + journal + step output)
```

A fixed workflow can't respond to an API change, a new data shape or a missing permission.
An agent watching a deterministic system can. ECP's job is to make every failure legible and
every fix cheap to retry. Concretely, ECP must provide:

| Need | ECP feature |
| --- | --- |
| Know what's possible | `ecp search`, `ecp describe`, `ecp discover`, `--help` written for models |
| Know a workflow is sound before running it | `ecp validate --json` with codes, paths and suggestions |
| Watch a run | `ecp run --events` (NDJSON per step) and `ecp runs show` |
| Understand a failure | Stable error codes plus a journal of each step's input, output, timing, policy decisions and error |
| Retry cheaply | `ecp runs rerun <id> --from <step>`, reusing the outputs of earlier steps |
| Fix dependencies | `ECP_PLUGINS_MISSING` with exact install commands |
| Be told when an unattended run breaks | `--on-failure <command>` hook to wake an agent with the journal path (Later phase) |

## 2. Desired outcome

This is what's true when `milestone/cli-reset` merges and ships as 1.0.

### 2.1 The experience

```bash
npm i -g @executioncontrolprotocol/cli
npx skills add executioncontrolprotocol/docs      # teaches any agent the ECP loop
```

1. A user asks Claude Code: *"Every Monday, pull last week's signups from our storage
   bucket, summarise them and post to Slack."*
2. Claude runs `ecp search "summarise text"` and `ecp discover slack`. It writes
   `signups.ecp.ts`, a single file.
3. `ecp run signups.ecp.ts --json` stops with `ECP_PLUGINS_MISSING`. Claude runs the listed
   `ecp plugins install …` commands and reruns.
4. Step 2 fails with `ECP_INPUT_INVALID` at `steps.summary.with.context`. Claude reads the
   journal, fixes the reference, and runs `ecp runs rerun <id> --from summary`. It passes.
5. The workflow is now a deterministic, reusable file. Later runs cost no reasoning tokens
   unless something breaks, and then the agent is called back.
6. The same user in Claude Desktop connects `ecp mcp serve` and gets the same capabilities as
   tools, through tool search.
7. `ecp app signups.ecp.ts` opens a live graph of the workflow. As Claude edits the file the
   graph updates, and a node the user edits in the graph is written back to the file.

### 2.2 What ships to npm

| Package | What it is |
| --- | --- |
| `@executioncontrolprotocol/core` | Runs ECP in Node or browsers. Entries: `.` (works in both), `./node`, `./browser`, `./types` |
| `@executioncontrolprotocol/cli` | The `ecp` binary: workflow commands, plugin management, bundled core plugins |
| `@executioncontrolprotocol/mcp` | MCP server library, and also the CLI plugin behind `ecp mcp serve` |
| `@executioncontrolprotocol/plugin-sdk` | Plugin SDK: the small authoring dependency that turns an extension definition into CLI commands |
| `@executioncontrolprotocol/plugin-<name>` | One package per capability set, each versioned independently |
| `@executioncontrolprotocol/plugin-app` | The visual co-editor, installed as a CLI plugin |

Not shipped anymore: `types` (folded into `core/types`), `node`, `browser`, `policies`,
`extensions`, `harnesses-*`, `evals`, `runtime-temporal`, `browser-demo`. Their 0.x versions
stay on npm, marked deprecated with a pointer to the 1.0 packages.

### 2.3 What the repo looks like

```text
packages/
  core/          ~12K lines: fluent API, registry, validate, executor, policies,
                 encoding (json, fluent), patch, journal model, node + browser entries
  cli/           ecp binary, workflow commands, plugin commands, hooks
  mcp/           MCP server + `ecp mcp serve`
  plugin-sdk/    toCommands(), shared flag and output helpers
plugins/
  plugin-secrets  plugin-storage   plugin-memory    plugin-jsonata
  plugin-anthropic plugin-openai   plugin-ollama    plugin-fal
  plugin-image-sharp plugin-azure-blob plugin-firefly plugin-slack
  plugin-toon     plugin-mermaid   plugin-telemetry plugin-app
examples/        single-file workflows only (*.ecp.ts)
fixtures/        consumer smoke fixtures
scripts/         build, lint, pack and publish helpers
skills/ecp-core/ contributor skill for agents working on this repo
```

The docs and the user-facing `ecp` skill live in the separate `executioncontrolprotocol/docs`
repo (Mintlify, executioncontrolprotocol.io).

### 2.4 Success criteria

The milestone is done when all of these are true:

1. On a clean machine, `npm i -g @executioncontrolprotocol/cli` then
   `ecp plugins install jsonata` works, and `ecp jsonata transform --help` shows the
   capability's summary, use cases and input fields.
2. `ecp run` on a workflow file with a missing plugin prompts to install it interactively, installs
   with `--yes`, and returns `ECP_PLUGINS_MISSING` with `--json`.
3. Every first-party extension is published as its own plugin, with an independent version
   and a one-line install in its README.
4. A plugin's capabilities show up as CLI commands and as MCP tools with no code beyond the
   extension definition and one export line.
5. `core` passes its unit tests in Node and in a browser (Vitest browser project), and is
   about 12K lines or less.
6. The repo contains no harness, prompt, intent, EQL or eval code, and no eval CI.
7. **Dogfood A:** a fresh Claude Code session with only the `ecp` skill installed builds and
   runs three reference workflows on its own, including recovering from an injected failure.
   This is a manual check run three times, not an eval harness.
8. **Dogfood B:** the same three tasks succeed from Claude Desktop over `ecp mcp serve`.
9. **Dogfood C:** `ecp app` reflects file edits within a second, and graph edits round-trip to
   the file.
10. `ecp --help` with 15 plugins installed returns in under a second (oclif manifests in every
    plugin).
11. The docs site is rewritten CLI-first, with a generated CLI reference, a plugin catalogue
    and an error code reference.

## 3. Principles

1. **Delegation, not orchestration.** ECP serves the agent. Any feature that makes ECP try to
   think for the agent is out of scope.
2. **CLI first.** Anything ECP can do is a CLI command. MCP and App are generated from the same
   registry, never written in parallel.
3. **Model-legible everywhere.** `--json`, stable error codes, journals, and help text written
   for a model reader.
4. **One plugin = one npm package = one extension definition.**
5. **One workflow = one file.** No config files and no environment modules.
6. **Governance is the reason to delegate through ECP** instead of calling APIs directly:
   policies, budgets, approvals, staged state and secrets custody stay first-class in core.
7. **Core runs anywhere.** No Node-only imports in core's root entry, so the same engine can be
   embedded in a browser or worker.
8. **Trim before building.**

## 4. Architecture

### 4.1 Core

`@executioncontrolprotocol/core` absorbs `types`, `runtimes/node`, the useful half of
`runtimes/browser`, and `policies`.

| Entry | Contents | Runs in |
| --- | --- | --- |
| `.` | Fluent API (`workflow`, `step`, `ref`, `state`, flow control), binding builders (`extension`, `policy`, `runtime`) and config placeholders (`env`, `secrets`, `browser`), definitions (`defineExtension`, `capabilityFor`, `definePolicy`), registry, validation, executor, policy engine and standard policies (budget, approval, state-control), encoding (json, fluent), patch, journal model, error codes | Node and browsers |
| `./types` | Protocol types, schema IDs, generated JSON Schemas | Anywhere |
| `./node` | Workflow file loader (transpile, `core` self-resolution), journal on disk, file and media loaders, node runtime binding | Node |
| `./browser` | Browser runtime binding, browser file and blob helpers | Browsers |

Rules:

- **Definitions are data.** `defineExtension(...).build()` returns a plain definition (schemas
  plus handlers). Plugins never register themselves into a global registry. The host (CLI, MCP,
  App, or an embedding app) owns the registry and registers definitions. This removes
  `catalogExtension` and `globalRegistry` side effects, and keeps two copies of core in a
  plugin's install folder harmless.
- Core has no dependency on oclif, the MCP SDK, or any provider SDK.

### 4.2 Plugin contract

```ts
// plugins/plugin-jsonata/src/index.ts  (main entry: works in Node and browsers)
import { defineExtension, capabilityFor } from "@executioncontrolprotocol/core"

export default defineExtension("@executioncontrolprotocol", "jsonata")
  .withMetadata({ summary, description, useCases })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/jsonata", "transform")
      .withInput(inputSchema).withOutput(outputSchema)
      .withMetadata({ summary, description, useCases, projections })
      .withHandler(runJsonataTransform),
  ])
  .build()
```

```ts
// plugins/plugin-jsonata/src/oclif.ts  (CLI entry)
import { toCommands } from "@executioncontrolprotocol/plugin-sdk"
import extension from "./index.js"
export const COMMANDS = toCommands(extension)
```

```jsonc
// plugins/plugin-jsonata/package.json
{
  "name": "@executioncontrolprotocol/plugin-jsonata",
  "keywords": ["ecosystem:ecp-plugin", "oclif-plugin"],
  "exports": { ".": "./dist/index.js", "./oclif": "./dist/oclif.js" },
  "ecp": { "extension": "./dist/index.js", "runtimes": ["node", "browser"] },
  "oclif": {
    "commands": { "strategy": "explicit", "target": "./dist/oclif.js", "identifier": "COMMANDS" },
    "topics": { "jsonata": { "description": "Transform JSON payloads with JSONata expressions" } }
  },
  "peerDependencies": { "@executioncontrolprotocol/core": "^1" },
  "dependencies": { "@executioncontrolprotocol/plugin-sdk": "^1", "jsonata": "^2" }
}
```

What `toCommands()` generates for each capability:

- Command id `<plugin> <capability>`, e.g. `ecp jsonata transform`.
- Flags from the top-level primitive fields of the input schema, plus `--input <file|->` for
  the full JSON input.
- The `--json` envelope `{ ok: true, data }` or `{ ok: false, error: { code, message, path, suggestions } }`.
- Help text rendered from summary, description, use cases and projections.
- At run time, the command looks up the host CLI's registry and executes through the same
  policy pipeline as a one-step workflow.

Commands are generated deterministically from the package's own definition, so
`oclif manifest` runs at build time and startup stays fast. MCP and App load the `ecp.extension`
entry directly, without oclif.

**Naming:**

- Extension `@<scope>/<name>` lives in package `@<scope>/plugin-<name>`. Capability ids are
  `@<scope>/<name>.<capability>`.
- The CLI sets `oclif.scope: "executioncontrolprotocol"`, so `ecp plugins install jsonata`
  resolves to `@executioncontrolprotocol/plugin-jsonata`.
- Third-party plugins use their own scope with the same `plugin-` prefix, plus the
  `ecosystem:ecp-plugin` keyword.

### 4.3 Workflow files: one file runs the whole sequence

A workflow file is a single Fluent TS file (`*.ecp.ts`) that holds everything needed to run:
the plugins it uses, how they're configured, which policies govern it, and the steps. There's
no `ecp.yaml`, no separate environment module, and no `package.json` next to it.

**No new top-level objects.** A workflow file uses only the objects ECP already defines:
`workflow`, `step`, `ref`, and the binding builders `extension`, `policy` and `runtime`, with
the `env()`, `secrets()` and `browser()` config placeholders. There are two additions:

1. **`workflow(...).with([...])`:** one array for everything the workflow needs from its
   environment. Each item is an existing binding object, and its builder defines what it is.
   There are no separate `.withExtensions()`, `.withPolicies()` or `.requires()` methods on the
   workflow.
2. **`.requires(range, package?)` on binding objects:** the version pin lives on the binding it
   applies to, instead of in a separate list.

```ts
// signups.ecp.ts
import { workflow, step, ref, extension, policy, secrets } from "@executioncontrolprotocol/core"

export default workflow("Weekly signups to Slack")
  .with([
    extension("@executioncontrolprotocol/anthropic", "Claude").with({
      apiKey: secrets("anthropic/api-key"),
      defaultModel: "claude-sonnet-5-5",
    }),
    extension("@executioncontrolprotocol/slack")
      .requires("^1")
      .with({ botToken: secrets("slack/bot-token") }),
    policy("@executioncontrolprotocol/budget").with({ maxCostUsd: 1 }),
    policy("@executioncontrolprotocol/approval").with({
      requireApprovalFor: ["@executioncontrolprotocol/slack.send"],
    }),
  ])
  .run([
    step("@executioncontrolprotocol/storage.list", "Last week's signups")
      .with({ prefix: "signups/", since: "7d" })
      .as("signups"),
    step("@executioncontrolprotocol/anthropic.generate", "Summarise")
      .with({ prompt: "Summarise these signups for the team.", context: ref("signups.items") })
      .as("summary"),
    step("@executioncontrolprotocol/slack.send", "Post")
      .with({ channel: "#growth", message: ref("summary.text") })
      .as("posted"),
  ])
```

`storage` isn't in `.with()`: it needs no config or pin, so the step that uses it binds it
automatically.

`.with` means the same thing at every level: what a thing is given. A workflow is given its
bindings, a binding is given its config, and a step is given its input.

**How this maps to today:**

| Today | In a workflow file |
| --- | --- |
| `environment(id).withExtensions([...]).withPolicies([...]).withRuntime(...)` in a separate `environment.ts` | `workflow(...).with([...])` in the same file |
| `import "@executioncontrolprotocol/extension-openai"` to load each plugin | Nothing to import. Plugins are referenced by id and installed by the CLI |
| `extension(id, label).with(config)` | Unchanged |
| `policy(id, label).with(config)` | Unchanged |
| `runtime(id, label).with(config)` | Unchanged and optional. Defaults to the host's runtime (`node` for the CLI) |
| — | `.requires(range, package?)` on any binding |
| `secrets("key")`, `env("KEY")`, `browser("key")` | Unchanged |

`environment()` and its `withExtensions()`, `withPolicies()` and `withRuntime()` methods stay
as the programmatic API for apps that embed core. The CLI, MCP and App build that environment
from installed plugins plus the workflow's `.with()` array.

**The binding objects:**

| Builder | Methods | Notes |
| --- | --- | --- |
| `extension(id, label?)` | `.with(config)`, `.requires(range, package?)` | List it only when it needs config or a pin; steps bind the rest automatically |
| `policy(id, label?)` | `.with(config)`, `.requires(range, package?)` | `budget`, `approval` and `state-control` are built into core and need no pin; other policies come from plugins |
| `runtime(id, label?)` | `.with(config)`, `.requires(range, package?)` | Optional |

Each binding carries its kind (`extension`, `policy` or `runtime`) from its builder. That kind
is what validation, dependency inference and the compiled requirements block read. If a new
binding type is needed later, for example if harness bindings ever come back, it's a new
builder whose objects go in the same `.with()` array, with no new workflow method.
(`HarnessBindingBuilder` is removed in Phase 1 along with the harnesses.)

**Gap found while checking the current model:** definitions already declare a config schema
(`withConfig(zod)`), and `describe` shows it, but bound config is never validated against it
today. Phase 4 adds that check at load time (`ECP_BINDING_INVALID`), so a model learns about a
bad `apiKey` field before the first step runs.

Rules:

1. **Imports:** the file imports only `@executioncontrolprotocol/core`, which the CLI resolves
   to its own copy, plus relative local files (for example a shared `bindings.ecp.ts` that
   exports an array of bindings to spread into `.with()`). No `package.json` or `node_modules`
   is needed next to a workflow file.
2. **Dependencies by id:** steps and bindings reference plugins by string id. The builders
   also accept an `ExtensionDefinition` or `PolicyDefinition` object; that form stays for apps
   that embed core, but a workflow file must use ids (`ecp validate` warns otherwise).
   - The required plugin set is every id used in `.with()` and in steps, mapped to packages by
     the naming convention (`@scope/<name>` → `@scope/plugin-<name>`), with the version range
     from `.requires()` or latest otherwise.
   - A plugin that doesn't follow the convention names its package in the second argument:
     `extension("@acme/crm").requires("^2", "@acme/ecp-crm")`.
3. **Missing plugins:**
   - In an interactive terminal: a prompt per package.
   - `--yes`: installs without asking.
   - `--json` or non-interactive: `ECP_PLUGINS_MISSING` with the exact commands.
   - Plugin trust policy (allowed sources, third-party on or off) applies to every install.
4. **Compile:** `ecp compile` splits the file in two. The `.run()` steps become the portable
   workflow manifest, in the same format as today, with no bindings, secrets or policies. The
   `.with()` bindings become a separate requirements block (each binding's kind, id, package,
   version range and config shape, with secret references but never values). One file to
   author, two parts after compiling. This replaces the `AGENTS.md` rule "never collapse
   workflow and environment".
5. **Secrets:** `secrets("key")` resolves at run time from the bound secrets provider (the OS
   keychain locally, a cloud vault when hosted). Values never appear in the file.
6. **File name:** `*.ecp.ts`, so tools can find workflow files by glob.

### 4.4 CLI

Workflow commands (core names are reserved, and plugins can't claim them as topics):

| Command | Purpose |
| --- | --- |
| `ecp init [name]` | Scaffold `<name>.ecp.ts` |
| `ecp search <intent>` | Rank installed capabilities for an intent |
| `ecp describe [id]` | Full schema and metadata for installed capabilities |
| `ecp validate <workflow>` | Validate the workflow file against installed plugins |
| `ecp install <workflow>` | Install every plugin the workflow file needs |
| `ecp run <workflow>` | Install missing plugins (with a prompt), run, and journal. Flags: `--input`, `--yes`, `--json`, `--events`, `--dry-run` |
| `ecp runs list` | Recent runs, filterable by status and workflow |
| `ecp runs show <id>` | Journal: resolved graph and per-step records |
| `ecp runs rerun <id> [--from <step>]` | Resume, reusing the outputs of earlier steps |
| `ecp invoke <capability-id>` | Generic single-capability call |
| `ecp compile <workflow>` | Manifest + requirements |
| `ecp config secrets add\|get\|list\|remove` | Local secrets |
| `ecp discover [query]` | npm search for `ecosystem:ecp-plugin` packages, first-party flagged |
| `ecp update` / `ecp rollback` | Update user plugins / remove user overrides of core plugins |
| `ecp plugins …` | install, uninstall, link, inspect, reset (from `@oclif/plugin-plugins`) |
| `ecp mcp serve` | JIT plugin (`@executioncontrolprotocol/mcp`) |
| `ecp app [workflow]` | JIT plugin (`@executioncontrolprotocol/plugin-app`) |

Plus generated `ecp <plugin> <capability>` commands for every installed plugin.

**Bundled core plugins:** `@oclif/plugin-help`, `@oclif/plugin-plugins`,
`@oclif/plugin-not-found`, `@oclif/plugin-autocomplete`,
`@oclif/plugin-warn-if-update-available`, and `@executioncontrolprotocol/plugin-secrets`.

**Hooks:**

- `command_not_found` maps an unknown topic to a plugin and offers to install it.
- `jit_plugin_not_installed` installs `mcp` or `app` at a pinned version.
- A plugin-trust check runs before any install.

### 4.5 Run journal, events and error codes

- **Journal:** `.ecp/runs/<run-id>/` holds `run.json` (workflow file path and hash, resolved graph,
  plugin versions, status, timing) and `steps/<step-id>.json` (input after ref resolution,
  output, policy decisions, staged mutations, error, attempts). `.ecp/` is gitignored. Secrets
  are redacted.
- **Events:** `ecp run --events` streams NDJSON: `run.start`, `step.start`, `step.policy`,
  `step.end`, `step.error`, `run.end`. The App and MCP progress notifications use the same
  stream.
- **Error codes,** each documented on the docs site with causes and fixes:

  | Code | Meaning |
  | --- | --- |
  | `ECP_WORKFLOW_LOAD` | The file failed to transpile or load |
  | `ECP_PLUGINS_MISSING` | Required plugins aren't installed |
  | `ECP_CAPABILITY_UNKNOWN` | An id doesn't match any installed capability |
  | `ECP_INPUT_INVALID` | Step input fails its schema |
  | `ECP_REF_UNRESOLVED` | A `ref()` points to a missing step or field |
  | `ECP_BINDING_INVALID` | Extension or policy config fails the `withConfig` schema its definition declares |
  | `ECP_SECRET_MISSING` | A referenced secret has no value |
  | `ECP_POLICY_DENIED` | A policy blocked the step |
  | `ECP_APPROVAL_REQUIRED` | The run is paused for approval |
  | `ECP_BUDGET_EXCEEDED` | A budget limit was reached |
  | `ECP_STEP_FAILED` | The capability threw; the original message is preserved |
  | `ECP_OUTPUT_INVALID` | The capability's output fails its schema |

- **Exit codes:** `0` success · `1` run failed · `2` validation or usage error ·
  `3` missing plugins · `4` paused for approval.

### 4.6 MCP

`@executioncontrolprotocol/mcp` is both a library (`createEcpMcpServer({ registry })`) and a
JIT CLI plugin (`ecp mcp serve --stdio | --http`).

- It boots the same oclif config, so it sees exactly the user's installed plugins.
- **Meta tools:** `ecp_search`, `ecp_describe`, `ecp_validate`, `ecp_run`, `ecp_runs_show`,
  `ecp_runs_rerun`, `ecp_invoke`, `ecp_plugins_install` (behind the trust policy).
- **Capability tools:** one per capability (`jsonata_transform`), described from the same
  metadata as `--help`. Clients with tool search load them on demand.
- `notifications/tools/list_changed` fires after plugin installs and removals. Run progress
  goes out as MCP progress notifications from the event stream.
- `ecp_run` accepts a workflow file path, or workflow source for clients that can't write files.
  Patch and encode stay in core for that case.
- Later, hosted MCP is the same package behind HTTP with a cloud secrets binding.

### 4.7 App

`@executioncontrolprotocol/plugin-app`, run as `ecp app [signups.ecp.ts]`:

- A local server plus a React UI, carved from the `pre-reset` browser demo: the graph editor
  (React Flow), the Monaco source pane and the run panel.
- Watches the workflow file and re-renders on change (hot reload).
- Graph edits are written back to the file with the Fluent encoder.
- Runs go through the CLI process and stream the `--events` feed into the graph.
- Not a chat client and not a model host: no provider modal, no Chrome AI, no harness.

### 4.8 Docs site and the skill

- **Docs:** the existing Mintlify site (`executioncontrolprotocol/docs`) gets a CLI-first
  rewrite:
  - Pages: concepts (delegation, workflow files, plugins, governance), the agent loop, CLI reference
    (generated from oclif manifests), plugin catalogue (generated from npm search), error
    codes, plugin authoring, MCP setup, App.
  - Harness, demo and in-browser provider pages are removed.
- **The skill:** the `ecp` skill in the docs repo is rewritten to teach the loop and point to
  `ecp --help`. It's exposed at a path that `npx skills add executioncontrolprotocol/docs`
  installs from. It's the only harness ECP ships.

## 5. Inventory: what stays, what goes, what changes

All removed code stays reachable at the `pre-reset` tag. Line counts are TypeScript, measured
at `pre-reset`.

### 5.1 Packages

| Today | Lines | Fate | Ends up as |
| --- | ---: | --- | --- |
| `packages/types` | 2.4K | Fold | `core/types` entry |
| `packages/core` | 25.1K | Keep and trim (see 5.2) | `core`, about 12K lines |
| `packages/cli` | 3.8K | Rebuild | `cli` (keeps run, validate, describe, search, invoke, compile, secrets) |
| `packages/mcp` | 0.6K | Rebuild | `mcp` (library + JIT plugin) |
| `packages/policies` | 0.8K | Fold | Standard policies in core; `image-policy` moves to `plugin-image-sharp` |
| `packages/evals` | 3.5K | **Remove** | — |
| `packages/harnesses/browser-nano` | 5.0K | **Remove** | — |
| `packages/harnesses/browser-coding` | 4.3K | **Remove** | — |
| `packages/runtimes/node` | 0.2K | Fold | `core/node` |
| `packages/runtimes/browser` | 1.7K | Fold part, remove part | Executor and builtins → `core/browser`; authoring panels, `browser-guide`, session config → removed |
| `packages/runtimes/temporal` | 0.1K | **Remove** | Revisit when hosted execution is real |
| `packages/extensions/index` | 0.1K | **Remove** | Installing plugins replaces the aggregator |
| `apps/browser-demo` | 9.9K | Carve | Graph editor, Monaco and run panel → `plugin-app`; the rest is removed |
| — | — | **New** | `plugin-sdk` |

### 5.2 Inside core

| Module | Lines | Fate |
| --- | ---: | --- |
| `harness/**` (authoring, prompts, definitions, repair loop, call-model) | 6.0K | **Remove** |
| `compile/*harness-artifact*`, `compile/evaluate-browser`, `compile/prepare-browser-source` | ~0.4K | **Remove** (harness artifacts) |
| `test-session/`, `runtime/test-session-state.ts` | ~0.2K | **Remove**; replaced by the run journal and `runs rerun` |
| `feedback/` | 0.1K | **Remove** (chat feedback for the harness) |
| `testing/test-model-generate.ts` | ~0.1K | **Remove**; keep the test extension helpers |
| `encoding/strip-harness-typescript-output`, `strip-markdown-fences`, `utility-context` | ~0.1K | **Remove** (model-output cleanup) |
| `bindings/harness.ts`, `validate/harness.ts` | ~0.1K | **Remove** |
| `registry`, `definitions`, `bindings` (extension, policy, runtime, step) | ~0.9K | Keep; drop `catalogExtension` and `globalRegistry` side effects |
| `workflow`, `helpers`, `fluent`, `formats` | ~0.9K | Keep; add `.with([...])` to the workflow builder and `.requires()` to the extension, policy and runtime binding builders |
| `environment` | 1.5K | Change: built by the host from installed plugins plus the workflow's `.with()` bindings. `describe` and `search` stay |
| `runtime` | 1.9K | Keep; add journal writer and event emitter, and resume from a step |
| `validate`, `schema`, `encoding` (json, fluent), `patch`, `invoke` | ~2.6K | Keep |
| `media`, `file`, `loaders`, `util`, `compile` (transpile, extract) | ~1.6K | Keep; the workflow file loader goes in `core/node` |
| — | — | **New:** journal model, error code catalogue, dependency inference, standard policies (from `policies`) |

### 5.3 CLI commands

| Today | Fate |
| --- | --- |
| `run`, `validate`, `describe`, `search`, `invoke`, `compile`, `config secrets *` | Keep, rework for workflow files and `--json` |
| `init` | Rewrite: scaffold a workflow file |
| `test start\|run\|rerun\|status` | **Remove** → `runs list\|show\|rerun` |
| `serve` | **Remove** → `mcp serve`, and the App server |
| `up` | **Remove** → `app` |
| `encode`, `decode` | **Remove** from the CLI → `ecp toon encode\|decode` in `plugin-toon` |
| — | **New:** `install`, `runs *`, `discover`, `update`, `rollback`, `plugins *`, generated plugin commands |

### 5.4 Extensions → plugins

| Today | Lines | Plugin | Notes |
| --- | ---: | --- | --- |
| `extensions/secrets` | 0.6K | `plugin-secrets` | Bundled with the CLI as a core plugin |
| `extensions/process-env` | 0.1K | Fold into `plugin-secrets` | Env vars as a secrets provider |
| `extensions/storage` | 1.3K | `plugin-storage` | |
| `extensions/memory` | 0.1K | `plugin-memory` | |
| `extensions/telemetry` | 0.1K | `plugin-telemetry` | Opt-in, built on oclif lifecycle hooks (Adobe pattern) |
| `extensions/anthropic` | 0.7K | `plugin-anthropic` | |
| `extensions/openai` | 0.2K | `plugin-openai` | |
| `extensions/ollama` | 0.9K | `plugin-ollama` | |
| `extensions/format-toon` | 0.7K | `plugin-toon` | Gets `encode` and `decode` commands |
| `extensions/format-mermaid` | 0.5K | `plugin-mermaid` | `ecp mermaid render <workflow>` |
| `extensions/format-reactflow` | 2.3K | Fold into `plugin-app` | |
| `extensions/format-eql` | 4.5K | **Remove** | Only served the nano harness |
| `extensions/chrome-ai` | 1.1K | **Remove** | In-browser model for the demo harness |
| `extensions/browser-secrets` | 0.5K | **Remove** | Browser vault for the demo; hosted vault comes later |
| `vendor/jsonata` | 0.3K | `plugin-jsonata` | First to migrate (smallest, pure) |
| `vendor/fal` | 0.3K | `plugin-fal` | |
| `vendor/image-sharp` | 1.7K | `plugin-image-sharp` | Takes `image-policy` from `policies` |
| `vendor/azure-blob-storage` | 1.2K | `plugin-azure-blob` | |
| `vendor/adobe-firefly-services` | 8.5K | `plugin-firefly` | Largest; migrates last |
| `vendor/slack` | 0.1K | `plugin-slack` | Needs a real send handler before publishing (mock today) |

### 5.5 Everything else

| Area | Fate |
| --- | --- |
| `examples/01-echo`, `02-weekly-brief`, `03-secrets-bind`, `06-invoke`, `07-accepts-returns`, `create-then-summarize-ollama`, `ollama-filesystem-documents`, `ollama-mcp-tools` | Convert to single-file `*.ecp.ts` workflows |
| `examples/vendor/02-weekly-brief-with-slack`, `03-fal-chain`, `04-image-prep`, `adobe-firefly-smoke`, `azure-adobe-assets`, `azure-photoshop-manifest` | Convert; each moves next to its plugin as `plugins/<name>/examples/` |
| `examples/04-compile-and-run`, `04-encode-decode`, `05-test-session`, `harness-ollama`, `controller-specialist`, `vendor/browser-demo-host` | **Remove**; covered by docs or by removed features |
| `docs/*.md` (assessments, reports, harness, EQL, daemon, browser review), `docs/ui-example` | **Remove**; conceptual content moves to the docs site |
| `ecp-overhaul.md` | **Remove**; superseded by this plan |
| `SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `SETUP.md`, `RELEASING.md` | Rewrite for workflow files, plugins, delegation and Changesets |
| `CHANGELOG.md`, `LICENSE` | Keep |
| `archive/legacy-v0.5` | **Remove** (still at tags `v0.5.0` and `v0.5-latest`) |
| `config/ecp.config.example.yaml` | **Remove** (no config files) |
| `.gitmodules` (empty), `.cursor/eval-timing.ndjson` | **Remove** |
| `.cursor/rules/*` | Rewrite to match the new `AGENTS.md`, or remove |
| `skills/ecp-core` | Rewrite as a contributor skill (package boundaries, plugin authoring); drop `harness-eval.md` |
| `fixtures/consumer-cli` | Rework into a clean-install plugin smoke test |
| `.ecp/` | Gitignore (run journals) |
| Scripts: `check-no-file-deps`, `clean-dist`, `lint-yaml`, `list-publishable-workspaces`, `resolve-pack-tarball` | Keep |
| Scripts: `consumer-cli-smoke`, `vendor-pack-smoke` | Rework → `plugin-pack-smoke` (pack, install into a clean `ecp`, run `--help`) |
| Scripts: `bump-all-ecp-versions`, `publish-workspaces`, `check-version-gt-published` | Replace with Changesets |
| Scripts: `ecp-up-demo`, `migrate-deps-to-pnpm` | **Remove** |
| CI `evals.yml`, `pages.yml` | **Remove** (the docs repo deploys the docs) |
| CI `development.yml` | Replace with a Changesets status check |
| CI `ci.yml` | Add `milestone/**` to push and PR triggers (first commit of Phase 1) |
| CI `ci-pipeline.yml` | Drop the demo and eval jobs; keep the browser job for core; add plugin pack smoke |
| Root `package.json` scripts | Drop `test:eval:*`, `eval:*`, `dev:demo`, `up:demo`, `build:demo`, `test:demo` |

### 5.6 Net effect

| | Today | After |
| --- | ---: | ---: |
| TypeScript lines | ~83K | ~50K (about 27K removed outright; about half of the 12K demo and React Flow code survives in `plugin-app`) |
| Shippable packages | 31 | 4 + 16 plugins |
| Packages a user needs to start | CLI + an environment module that imports each extension | `cli`, then plugins installed on demand |
| Model-facing harness code | ~19K (core harness, harnesses, EQL, evals) | 0, plus one skill |

## 6. Borrowed from Adobe I/O CLI

Studied: `adobe/aio-cli`, `aio-cli-plugin-app`, `aio-cli-plugin-runtime`,
`aio-cli-plugin-telemetry`, `@oclif/plugin-plugins`, and oclif's JIT plugins and explicit
command loading.

| Adobe I/O pattern | ECP adoption |
| --- | --- |
| Thin root CLI; every feature is an `@adobe/aio-cli-plugin-*`, with a set of core plugins in `oclif.plugins` | `ecp` bundles only the oclif essentials plus `plugin-secrets` |
| Logic in `aio-lib-*` libraries; plugins are thin CLI shells | Logic lives in the extension definition; `plugin-sdk` generates the shell |
| `aio discover` queries the npm registry and offers an interactive install (keyword-based search was planned but never finished) | `ecp discover` on keyword `ecosystem:ecp-plugin`, with `--json` |
| `aio update` splits core and user plugins and warns when a user install shadows a newer core one; `aio rollback` | `ecp update` and `ecp rollback`, same logic |
| `oclif.scope` and the `plugin` prefix for short install names | `ecp plugins install slack` → `@executioncontrolprotocol/plugin-slack` |
| `@oclif/plugin-not-found` plus a `command_not_found` hook | Unknown topic → offer the matching plugin |
| Telemetry as its own plugin on `init`, `prerun`, `postrun` and `command_error` hooks | `plugin-telemetry`, opt-in |
| oclif JIT plugins (`jitPlugins`, `jit_plugin_not_installed`) | `mcp` and `app` appear in help before install |
| `plugins link` for local development | The documented plugin-author loop |

From our own closed PR #23 (`feat/plugin-install`): plugin trust policy (allowed source types,
third-party plugins on or off), re-implemented as a pre-install check on top of
`@oclif/plugin-plugins`.

## 7. Phases

Each phase is a `feat/<phase>-…` branch with a PR into `milestone/cli-reset`. CI must be green
on the milestone branch after every phase.

### Phase 0 — Merge and freeze ✅ 2026-10-19

- PR #32 merged into `development`, tagged `pre-reset` (`07e91a8`).
- `milestone/cli-reset` created with this plan. `main` untouched and nothing published.
- Left over: delete the stale branches `feat/build-cleanup`, `feat/delegation-testing`,
  `feat/memory-recall`, `feat/plugin-install`, `cursor/development-environment-setup-593c`,
  and the merged local branches.

### Phase 1 — Trim

1. Add `milestone/**` to the CI triggers.
2. Remove everything marked **Remove** in §5 (packages, core modules, CLI commands, examples,
   docs, scripts, workflows, root scripts).
3. Move `apps/browser-demo` and `format-reactflow` out of the workspace (they come back from
   `pre-reset` in Phase 8).
4. Fix the build, lint and tests on what's left.

**Exit:** green CI; no harness, eval, EQL or demo code; the workspace builds.

### Phase 2 — Consolidate core

1. Fold `types` into `core/types`, `runtimes/node` into `core/node`, the browser executor and
   builtins into `core/browser`, and `policies` into core.
2. Make definitions data: remove `catalogExtension` and `globalRegistry` side effects; the
   host owns the registry.
3. Check that the root entry has no Node-only imports (lint rule), and run core's unit tests
   in both the Node and browser Vitest projects.

**Exit:** `core` about 12K lines, tests green in Node and browser.

### Phase 3 — Plugin kit and CLI

1. `plugin-sdk`: `toCommands()`, flag generation, `--input`, the `--json` envelope and help
   rendering.
2. Rebuild `cli` around §4.4: bundled core plugins, scope and prefix, the `command_not_found`
   and trust hooks, `discover`, `update`, `rollback`.
3. Migrate `plugin-jsonata` as the reference plugin.

**Exit:** `ecp plugins link plugins/plugin-jsonata` gives a working
`ecp jsonata transform --json`.

### Phase 4 — Workflow files and observability

1. `workflow(...).with([...])`, `.requires(range, package?)` on the extension, policy and
   runtime builders, and auto-binding of extensions used only in steps. Also: the workflow
   file loader with core self-resolution, dependency inference, and validation of bound config
   against each definition's `withConfig` schema.
2. `ecp run`, `validate`, `install` and `compile` on workflow files; the missing-plugin flow.
3. Run journal, `--events`, error code catalogue, exit codes, and `ecp runs list|show|rerun`.
4. Convert the examples to single-file workflows.

**Exit:** on a machine without `plugin-jsonata`, `ecp run demo.ecp.ts` prompts, installs and
runs; `--json` returns `ECP_PLUGINS_MISSING`; a failed step reruns with `--from`.

### Phase 5 — Plugins to npm

1. Migrate the remaining extensions per §5.4. Order: storage, secrets, memory, anthropic,
   openai, ollama, toon, mermaid, telemetry, fal, image-sharp, azure-blob, firefly, then
   slack once it has a real handler.
2. Changesets with independent versions; `plugin-pack-smoke` in CI for every plugin.
3. Prerelease publishing from the milestone branch under the `next` dist-tag.

**Exit:** criteria 1, 3 and 4 of §2.4 pass with `@next` packages.

### Phase 6 — Docs site and skill

CLI-first rewrite of the docs repo, generated reference pages, and the rewritten `ecp` skill
installable with `npx skills add`.

**Exit:** Dogfood A (§2.4 criterion 7).

### Phase 7 — MCP

`@executioncontrolprotocol/mcp` per §4.6.

**Exit:** Dogfood B.

### Phase 8 — App

`plugin-app` per §4.7, carved from `pre-reset`.

**Exit:** Dogfood C.

### Phase 9 — 1.0 release

1. Confirm every §2.4 criterion.
2. Merge `milestone/cli-reset` → `development` → `main`. This publishes 1.0 (publishing runs
   on `main`).
3. Deprecate the retired 0.x packages on npm with a pointer to their replacements.

### Later

- **Healing automation:** `--on-failure <command>` wakes an agent (for example `claude -p`)
  with the journal path when an unattended run fails, plus a scheduler (`ecp schedule`).
- **`plugin-reflex`:** `decide.choice`, `decide.yesno` and `decide.score` backed by so1
  readout, Laya or Jev. Decisions become ordinary steps; logit fingerprints flag drift to the
  supervising agent.
- **Hosted MCP + cloud secrets binding** (Strata).
- **Durable runtime** (Temporal) once hosted execution needs it.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| A plugin's install folder gets its own copy of core, so registries split | Definitions are data and the host owns the registry (§4.1). Core is a peer dependency of plugins |
| oclif startup slows as plugins pile up | `oclif manifest` in every plugin; criterion 10 is the budget |
| Dependency inference picks the wrong package | The naming convention plus `.requires()` pins; `validate` names every inferred package |
| Loose model output in flags (nested input) | Flags only for top-level primitives; `--input` JSON for everything else |
| Existing 0.x users and Strata break | 1.0 is a major release; 0.x stays installable and deprecated; `pre-reset` keeps the full history |
| The browser demo disappears from GitHub Pages | Point the docs site at `ecp app`; the demo stays buildable from `pre-reset` |
| One user-level plugin install can't satisfy two workflows pinning different majors | Warn on the mismatch now; consider per-workflow installs later |

## 9. Open decisions

1. **Flag depth.** Only top-level primitives become flags. Revisit after Dogfood A.
2. **Command namespace.** `ecp <plugin> <capability>` at the root, with core names reserved.
   The alternative is `ecp x <plugin> <capability>`.
3. **Per-workflow plugin isolation.** Deferred (see Risks).
4. **`plugin-sdk` as its own package** or a `cli/sdk` subpath. Own package is preferred so
   plugins don't depend on the whole CLI.
