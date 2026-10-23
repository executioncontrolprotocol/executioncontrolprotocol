# ECP Reset Plan — deterministic delegation for agents

> Status: committed plan · branch `milestone/cli-reset` · baseline tag `pre-reset` (`07e91a8`)
> Decided 2026-10-19/20. Replaces the direction in `ecp-overhaul.md`.
> Detailed phase docs: [`reset/`](reset/README.md).

## 0. Summary

- **The flip.** ECP stops being the thing that orchestrates agents. It becomes the
  **deterministic delegation capability** that agents use. An orchestrating agent (Claude,
  Opus, …) authors workflows, runs them, watches them, and repairs them when they fail. ECP
  does the deterministic work so the agent doesn't spend reasoning on it.
- **ECP is part of a harness, never the whole harness.** No harnesses, prompts, intent
  routers or eval matrices ship from this repo. The only harness is one skill on the docs
  site.
- **Packages:** `core` is the environment-agnostic engine, and the `node` and `browser`
  environment packages run it. `cli` is the primary surface and `mcp` the second. Every capability set is its own npm plugin. The visual app is a plugin too.
- **One workflow = one file.** A Fluent TS file declares its steps (`.run()`) and, in a single
  `.with([...])` array, the extension and policy bindings ECP already has. Version pins
  go on the bindings (`.requires()`). Running it with missing plugins prompts to install them.
- **Environments are hosts.** Environment and runtime collapse into one object (Node, browser,
  later Temporal). It takes the same `.with([...])` as a workflow, owns custody and
  host-enforced policies, and the CLI ships the Node one by default. Extensions declare where
  they can run with `.supports(environmentId, range?)`.
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
│   product.ecp.ts → validate → run → journal                       │
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

### Where ECP sits on the determinism ladder

This framing comes from the Strata skill-execution research:

| Level | Behaviour | Who handles it now |
| --- | --- | --- |
| L0 | Fixed graph, no model at run time | ECP workflow |
| L1 | Fixed graph with model steps (generate, classify) | ECP workflow with model plugins |
| L2 | Fixed skeleton; a model picks parameters or branches from a declared set | ECP workflow with System-1 decision steps (`plugin-reflex`, later) |
| L3 | Bounded agency: a model picks among policy-constrained capabilities under budgets and approvals | ECP policies plus the outer agent choosing which workflow or capability to run |
| L4 | Free agency: plan, act, recover | **The outer agent**, using ECP for everything below it |

Automation tools sit at L0 and bolt AI on top; agent frameworks sit at L4 and retrofit
control downward. ECP covers L0 to L3 in one artifact, under one governance model, with one
trace, and hands L4 to the agent that operates it.

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
| Step through a run | `ecp run --to <step>` stops after a step; `ecp runs resume <id>` continues from where it stopped |
| Retry cheaply | `ecp runs rerun <id> --from <step> [--to <step>]`, reusing the outputs and state of earlier steps |
| Continue after an approval | `ecp runs resume <id> --approve` records the approval and continues a paused run |
| Fix dependencies | `ECP_PLUGINS_MISSING` with exact install commands |
| Be told when an unattended run breaks | `--on-failure <command>` hook to wake an agent with the journal path (Later phase) |

## 2. Desired outcome

This is what's true when `milestone/cli-reset` merges and ships as 1.0.

### 2.1 The experience

```bash
npm i -g @executioncontrolprotocol/cli
npx skills add executioncontrolprotocol/docs      # teaches any agent the ECP loop
```

1. A user asks Claude Code: *"Whenever I hand you a product photo and a description, make a
   1200px WebP, upload it to our Azure container, get a share link, and write a short
   caption."*
2. Claude runs `ecp search "resize image"` and `ecp discover azure`. It writes
   `product.ecp.ts`, a single file.
3. `ecp run product.ecp.ts --json` stops with `ECP_PLUGINS_MISSING`. Claude runs the listed
   `ecp plugins install …` commands and reruns.
4. The upload step fails with `ECP_INPUT_INVALID` at `steps.blob.with.file`. Claude reads the
   journal, fixes the reference to the resized image, and runs
   `ecp runs rerun <id> --from blob`. It passes, reusing the resize output.
5. The workflow is now a deterministic, reusable file. Later runs cost no reasoning tokens
   unless something breaks, and then the agent is called back.
6. The same user in Claude Desktop connects `ecp mcp serve` and gets the same capabilities as
   tools, through tool search.
7. `ecp app product.ecp.ts` opens a live graph of the workflow. As Claude edits the file the
   graph updates, and a node the user edits in the graph is written back to the file.

### 2.2 What ships to npm

| Package | What it is |
| --- | --- |
| `@executioncontrolprotocol/core` | The environment-agnostic engine, runs in Node or browsers. Entries: `.` and `./types` |
| `@executioncontrolprotocol/node` | The Node environment (id = package name). The CLI's default |
| `@executioncontrolprotocol/browser` | The browser environment, for apps that embed ECP in a page. No secrets provider in this phase |
| `@executioncontrolprotocol/cli` | The `ecp` binary: workflow commands, plugin management, bundled core plugins |
| `@executioncontrolprotocol/mcp` | MCP server library, and also the CLI plugin behind `ecp mcp serve` |
| `@executioncontrolprotocol/plugin-sdk` | Plugin SDK: `toCommands()`, the `EcpCommand` base class, `defineOperation()`, and the plugin build library behind `ecp plugins build`, so plugins contain no hand-written oclif code |
| `@executioncontrolprotocol/plugin-<name>` | One package per capability set, each versioned independently |
| `@executioncontrolprotocol/app` | The visual co-editor as a standalone package: React components, a host adapter interface, and a prebuilt static bundle. Usable without the CLI |
| `@executioncontrolprotocol/plugin-app` | The thin CLI plugin behind `ecp app`: local server, file watcher, and a bridge to the Node environment. Serves the prebuilt bundle from `app` |

Not shipped anymore: `types` (folded into `core/types`), `policies`, `extensions`,
`harnesses-*`, `evals`, `runtime-temporal` (returns later as `@executioncontrolprotocol/temporal`),
`browser-demo`. Their 0.x versions
stay on npm, marked deprecated with a pointer to the 1.0 packages.

### 2.3 What the repo looks like

```text
packages/
  core/          ~12K lines: fluent API, registry, validate, executor, policies,
                 encoding (json, fluent), patch, journal model
environments/
  node/          @executioncontrolprotocol/node: workflow file loader, journal on disk,
                 file and media loaders, OS secrets and process-env providers
  browser/       @executioncontrolprotocol/browser: browser executor, file and blob helpers
  cli/           ecp binary, workflow commands, plugin commands, hooks
  mcp/           MCP server + `ecp mcp serve`
  plugin-sdk/    toCommands(), EcpCommand, defineOperation(), plugin build library
  app/           visual co-editor: React components, host adapters, static bundle
plugins/
  plugin-anthropic  plugin-openai  plugin-ollama  plugin-fal
  plugin-jsonata  plugin-image-sharp  plugin-azure-blob-storage
  plugin-adobe-firefly-services  plugin-format-toon  plugin-format-mermaid
  plugin-budget  plugin-approval  plugin-state-control  plugin-app
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
   about 12K lines or less. The same workflow file validates against both the Node and the
   browser environment, and a Node-only extension in the browser fails with
   `ECP_ENVIRONMENT_UNSUPPORTED`.
6. The repo contains no harness, prompt, intent, EQL or eval code, and no eval CI.
7. **Dogfood A:** a fresh Claude Code session with only the `ecp` skill installed builds and
   runs three reference workflows on its own, including recovering from an injected failure.
   This is a manual check run three times, not an eval harness.
8. **Dogfood B:** the same three tasks succeed from Claude Desktop over `ecp mcp serve`.
9. **Dogfood C:** `ecp app` reflects file edits within a second, and graph edits round-trip to
   the file.
10. `ecp --help` with all 14 first-party plugins installed returns in under a second (oclif manifests in every
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
   policies, staged state and secrets custody. Core provides the *mechanism* (the policy
   engine, staged state, `registry-control`, custody through environments). Individual
   policies such as budget and approval are plugins, so core imposes nothing that isn't
   installed.
7. **Core runs anywhere.** No Node-only imports in core's root entry, so the same engine can be
   embedded in a browser or worker.
8. **Trim before building.**

## 4. Architecture

### 4.1 Core

`@executioncontrolprotocol/core` absorbs `types` and the `registry-control` policy. It's the environment-agnostic
engine; host wiring lives in the environment packages (§4.4).

| Entry | Contents | Runs in |
| --- | --- | --- |
| `.` | Fluent API (`workflow`, `step`, `ref`, `state`, flow control), `environment()`, binding builders (`extension`, `policy`) and config placeholders (`env`, `secrets`), definitions (`defineExtension`, `capabilityFor`, `definePolicy`, `defineEnvironment`), registry, validation, executor, policy engine and the `registry-control` policy, encoding (json, fluent), patch, journal model, error codes | Node and browsers |
| `./types` | Protocol types, schema IDs, generated JSON Schemas | Anywhere |

Rules:

- **Definitions are data.** `defineExtension(...).build()` returns a plain definition (schemas
  plus handlers). Plugins never register themselves into a global registry. The host (CLI, MCP,
  App, or an embedding app) owns the registry and registers definitions. This removes
  `catalogExtension` and `globalRegistry` side effects, and keeps two copies of core in a
  plugin's install folder harmless.
- Core has no dependency on oclif, the MCP SDK, or any provider SDK.

### 4.2 Plugin contract: no hand-written oclif

The goal is that a plugin author writes the extension definition and nothing oclif-specific.
Everything oclif needs is generated by `@executioncontrolprotocol/plugin-sdk`, and the CLI's
own commands use the same mechanism.

#### What the author writes

```ts
// plugins/plugin-jsonata/src/index.ts  (works in Node and browsers)
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

```jsonc
// plugins/plugin-jsonata/package.json  (the parts a person maintains)
{
  "name": "@executioncontrolprotocol/plugin-jsonata",
  "version": "1.0.0",
  "scripts": { "build": "tsc -b && ecp plugins build" },
  "peerDependencies": { "@executioncontrolprotocol/core": "^1" },
  "dependencies": { "@executioncontrolprotocol/plugin-sdk": "^1", "jsonata": "^2" },
  "devDependencies": { "@executioncontrolprotocol/cli": "^1" }
}
```

That's the whole plugin.

#### What `ecp plugins build` generates

Plugin authoring is part of the CLI itself, in the same `ecp plugins` topic that installs and
manages plugins. oclif already puts an author's command there (`ecp plugins link`), so the
whole loop lives in one place:

```text
ecp plugins new my-plugin → write the definition → ecp plugins build → ecp plugins link . → publish
```

The commands are host operations like any other CLI command (see below). The logic lives in
`plugin-sdk` as a library (`buildPlugin()`, `checkPlugin()`, `scaffoldPlugin()`), so CI or
scripts can call it without the CLI.

- **`ecp plugins new <name>`** scaffolds a plugin with the two files above. It's the authoring
  counterpart of `ecp init`.
- **`ecp plugins build [dir]`:**
  - Writes the generated `package.json` fields from the definition:
    - `ecp.extension`
    - `exports["./oclif"]`
    - The `oclif` block (explicit command strategy, `topics` from the extension's summary)
    - The `ecosystem:ecp-plugin` and `oclif-plugin` keywords
    - `files`
  - Loads the built definition and writes `dist/oclif.js`
    (`export const COMMANDS = toCommands(definition)`).
  - Writes `oclif.manifest.json` by loading the package through oclif's own `Config.load` and
    saving the computed manifest. That's what `oclif manifest` does, without the `oclif` dev
    tool.
- **`ecp plugins check [dir]`** runs in CI and fails if any generated file or field is stale.

Authors already have `ecp` installed. Plugins in this repo use the workspace CLI as a dev
dependency, which works because the CLI never depends on any plugin.

Sharing a topic with `@oclif/plugin-plugins` is safe:

- Its commands today are `plugins`, `install`, `uninstall`, `link`, `inspect`, `reset` and
  `update`, so `new`, `build` and `check` don't collide.
- If it ever adds one of those names, oclif's priority rules run the root CLI's own command
  first (checked in `determine-priority` in `@oclif/core`).
- `ecp plugin …` (singular) is reserved, and the not-found hook redirects it to
  `ecp plugins …`.

The `oclif` block can't be skipped: `@oclif/plugin-plugins` refuses to install a package
without one ("plugin is invalid"). It's generated, never written by hand.

#### What `toCommands()` generates for each capability

- **Command id:** `<extension name> <capability>`, for example `ecp jsonata transform`.
- **Flags:** from the input schema's top-level fields:
  - Strings, numbers, booleans and enums become flags; arrays of primitives become repeatable
    flags.
  - Nested objects only come in through `--input <file|->`.
  - Flags override fields from `--input`.
- **`--json`:** prints the envelope `{ ok: true, data }` or
  `{ ok: false, error: { code, message, path, suggestions } }`.
- **Help:** from summary, description, use cases and projections.
- **Run:** looks up the host CLI's registry and executes through the same policy pipeline as a
  one-step workflow.

All generated commands extend one SDK base class, `EcpCommand`. It owns input merging, zod
validation, the envelope, error codes and exit codes. It must override oclif's JSON error
output: in the prototype, oclif replaced our error code with its own
`{"error":{"oclif":{"exit":2}}}`.

#### The CLI's own commands use the same interface

`run`, `validate`, `describe`, `search`, `compile`, `install`, `init`, `runs …`, `discover`,
`invoke` and `config secrets …` are defined as **host operations**:

```ts
defineOperation("run")
  .withInput(z.object({ file: z.string(), to: z.string().optional(), yes: z.boolean().optional(), … }))
  .withMetadata({ summary, description, useCases, cli: { args: ["file"] } })
  .withHandler(runWorkflow)
```

- Operations have a zod input, metadata and a handler, like capabilities. Two differences:
  they run on the host instead of inside a workflow's policy pipeline, and they can't be used
  as workflow steps.
- An optional `cli` hint lists positional arguments; everything else is a flag.
- The CLI's command map is `toCommands(operations)`, and the MCP meta tools (§4.7) are
  generated from the same operations.

The only hand-written oclif code left in the repo is the CLI's four hooks (§4.5) and its
`package.json` configuration.

#### Approaches considered

| Approach | Verdict |
| --- | --- |
| Hand-written oclif command classes per capability (oclif's default) | Rejected: the boilerplate this section removes |
| One manifest-less "capabilities" plugin inside the CLI that builds commands at run time for every installed ECP package | Rejected. oclif won't install a package without an `oclif` block anyway. Without per-plugin manifests, every startup would import every plugin (Firefly alone is about 8K lines). Help, `plugins inspect`, `plugins update` and JIT installs would all point at the wrong plugin. And it would duplicate oclif's data-directory logic |
| Explicit-strategy target pointing into `plugin-sdk` inside `node_modules` | Rejected: breaks when npm hoists dependencies in oclif's data directory |
| One authored line, `export const COMMANDS = toCommands(ext)` | A workable fallback, but generation removes even that and keeps `package.json` correct |
| **Generated per-plugin oclif files from the definition** | **Chosen.** Standard oclif behaviour (manifests, help, inspect, update, JIT) with nothing hand-written |

**Prototype (2026-10-21, `@oclif/core` 4.10)** confirmed the following:

- A package containing only a definition plus a generated `COMMANDS` export loads through
  oclif's explicit strategy.
- The manifest can be computed with `Config.load` and saved.
- Flags, enum options, `--input` merging, `--json` and help text all work as described.

MCP and App load the `ecp.extension` entry directly, without oclif.

#### Naming

- Extension `@<scope>/<name>` lives in package `@<scope>/plugin-<name>`, using the extension
  name exactly. Today's extension ids stay as they are, so capability ids in existing workflows
  keep working (for example `@executioncontrolprotocol/adobe-firefly-services` lives in
  `plugin-adobe-firefly-services`). Capability ids are `@<scope>/<name>.<capability>`.
- A plugin can add a short oclif topic alias for long names (for example `ecp firefly …`).
- The CLI sets `oclif.scope: "executioncontrolprotocol"`, so `ecp plugins install jsonata`
  resolves to `@executioncontrolprotocol/plugin-jsonata`.
- Third-party plugins use their own scope with the same `plugin-` prefix, plus the
  `ecosystem:ecp-plugin` keyword.

#### Format plugins are converters

A format plugin (`plugin-format-toon`, `plugin-format-mermaid`) is an ordinary extension whose
capabilities are `encode` and `decode`. That gives it two roles with no extra code:

- **Converters you can call.** Like any capability, they become CLI commands, MCP tools and
  workflow steps: `ecp format-toon encode --input workflow.json`,
  `ecp format-mermaid encode --input workflow.json`, or `step("@executioncontrolprotocol/format-toon.encode")`.
- **Formats for core commands.** Core's encoding layer already resolves formats by id
  (`encode().uses("@executioncontrolprotocol/format-toon")`), so installed format plugins also
  work with `--format` on built-in commands: `ecp describe --format toon` gives a compact
  catalogue for small-context clients, and `ecp compile product.ecp.ts --format mermaid` gives a
  diagram for docs and PR descriptions.

JSON and Fluent stay built into core.

### 4.3 Workflow files: one file runs the whole sequence

A workflow file is a single Fluent TS file (`*.ecp.ts`) that holds everything needed to run:
the plugins it uses, how they're configured, which policies govern it, and the steps. There's
no `ecp.yaml`, no separate environment module, and no `package.json` next to it.

**No new top-level objects.** A workflow file uses only the objects ECP already defines:
`workflow`, `step`, `ref`, and the binding builders `extension` and `policy`, with
the `env()` and `secrets()` config placeholders. There are two additions:

1. **`workflow(...).with([...])`:** one array for everything the workflow needs from its
   environment. Each item is an existing binding object, and its builder defines what it is.
   There are no separate `.with()`, `.with()` or `.requires()` methods on the
   workflow.
2. **`.requires(range, package?)` on binding objects:** the version pin lives on the binding it
   applies to, instead of in a separate list.

```ts
// product.ecp.ts
import { workflow, step, ref, extension, policy, secrets } from "@executioncontrolprotocol/core"

export default workflow("Product photo to web")
  .with([
    extension("@executioncontrolprotocol/anthropic", "Claude").with({
      apiKey: secrets("anthropic/api-key"),
      defaultModel: "claude-sonnet-5-5",
    }),
    extension("@executioncontrolprotocol/azure-blob-storage")
      .requires("^1")
      .with({ connectionString: secrets("azure/products-connection"), container: "products" }),
    policy("@executioncontrolprotocol/budget").with({ maxCostUsd: 1 }),
    policy("@executioncontrolprotocol/approval").with({
      requireApprovalFor: ["@executioncontrolprotocol/azure-blob-storage.upload"],
    }),
  ])
  .run([
    step("@executioncontrolprotocol/image-sharp.resize", "Web size")
      .with({ image: ref("input.photo"), width: 1200, format: "webp" })
      .as("web"),
    step("@executioncontrolprotocol/azure-blob-storage.upload", "Upload")
      .with({ file: ref("web.file") })
      .as("blob"),
    step("@executioncontrolprotocol/azure-blob-storage.create-sas-url", "Share link")
      .with({ blob: ref("blob.name") })
      .as("link"),
    step("@executioncontrolprotocol/anthropic.generate", "Caption")
      .with({ prompt: "Write a 20-word product caption.", context: ref("input.description") })
      .as("caption"),
  ])
```

Input and output field names here are illustrative.

`image-sharp` isn't in `.with()`: it needs no config or pin, so the step that uses it binds it
automatically. `budget` and `approval` are policy plugins, inferred and installed the same way
as extensions.

#### How this maps to today

| Today | In a workflow file |
| --- | --- |
| `environment(id).with([...]).with([...]).withRuntime(...)` in a separate `environment.ts` | `workflow(...).with([...])` in the same file |
| `import "@executioncontrolprotocol/extension-openai"` to load each plugin | Nothing to import. Plugins are referenced by id and installed by the CLI |
| `extension(id, label).with(config)` | Unchanged |
| `policy(id, label).with(config)` | Unchanged |
| `runtime(id, label).with(config)` | Removed. The environment is the and the workflow never names it (§4.4) |
| — | `.requires(range, package?)` on any binding |
| `secrets("key")`, `env("KEY")` | Unchanged |
| `browser("key")` | Removed with `browser-secrets`, its only resolver |

`environment()` stays, as the host the workflow runs in, and takes the same `.with([...])`
array (§4.4). The CLI, MCP and App build that environment
from installed plugins plus the workflow's `.with()` array.

#### The binding objects

| Builder | Methods | Notes |
| --- | --- | --- |
| `extension(id, label?)` | `.with(config)`, `.requires(range, package?)` | List it only when it needs config or a pin; steps bind the rest automatically |
| `policy(id, label?)` | `.with(config)`, `.requires(range, package?)` | Policies come from plugins (`plugin-budget`, `plugin-approval`, `plugin-state-control`, or third-party). Only `registry-control` is built into core |

Each binding carries its kind (`extension` or `policy`) from its builder. That kind
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

### 4.4 Environments: where a workflow runs

Environments and runtimes collapse into one object. An **environment** is the host a workflow
runs in (Node, browser, later Temporal). A workflow says *what* it needs; the environment
decides *where* it runs and owns what must not be the workflow author's choice.

| Object | Defined by | Holds |
| --- | --- | --- |
| `workflow` | The author, usually the agent. Self-contained and declarative | Steps, plus `.with([...])` for the extensions it uses, their config, and its own policies |
| `environment` | The host | Executor, secrets providers (custody), blob and artifact stores, host-enforced policies, preinstalled extensions |
| `Ecp` | `await environment(id).with([...]).init()` | `run(workflow)`, `validate`, `describe`, `search`, as today |

**Environment id = package name.** The ids already exist as today's runtime ids, and they
already match the runtime package names, so nothing is renamed:

| Environment id and package | Status | Ships with |
| --- | --- | --- |
| `@executioncontrolprotocol/node` | Exists (`packages/environments/node`, moving to `environments/node`) | The CLI, as the default environment. Takes in today's `secrets` and `process-env` extensions as its built-in secrets providers |
| `@executioncontrolprotocol/browser` | Exists (`packages/environments/browser`, moving to `environments/browser`). No secrets provider in this phase: `browser-secrets` is removed, so a workflow that needs secrets runs through the CLI | Apps that embed ECP in a page; later, the App's in-page mode |
| `@executioncontrolprotocol/temporal` | Stub today (`runtime-temporal`, removed in Phase 1) | Later, as a separately installed package |

`defineEnvironment` becomes `defineEnvironment`. An environment definition owns the executor and
the host wiring that is programmatic today: `withBlobStore`, `withArtifactStore` and
`withRemoteInvoke` move from the environment builder into the definition. The `runtime()`
binding builder goes away, since there's nothing left to bind.

**Same `.with([...])` as workflows.** An environment takes the same binding objects as a
workflow, so there's one fluent API for extensions and policies:

```ts
// team.env.ecp.ts  (optional: only hosts that need defaults or enforced policies write one)
import { environment, extension, policy, secrets } from "@executioncontrolprotocol/core"

export default environment("@executioncontrolprotocol/node")
  .with([
    extension("@executioncontrolprotocol/secrets"),                 // custody: OS keychain
    extension("@executioncontrolprotocol/anthropic").with({ defaultModel: "claude-sonnet-5-5" }),
    policy("@executioncontrolprotocol/budget").with({ maxCostUsd: 5 }),
    policy("@executioncontrolprotocol/approval").with({
      requireApprovalFor: ["@executioncontrolprotocol/azure-blob-storage.upload"],
    }),
  ])
```

`withExtensions()`, `withPolicies()` and `withRuntime()` are removed. `.with([...])` replaces
them on both objects.

**`.supports()` on definitions.** Extension definitions (and policy definitions, for
consistency) declare which environments they can run in, using the environment id and an
optional version range. This mirrors `.requires(range)` on bindings. It replaces today's
`supportsPLACEHOLDER([NODE_ENVIRONMENT_ID])`, which 15 files use.

```ts
defineExtension("@executioncontrolprotocol", "image-sharp")
  .supports("@executioncontrolprotocol/node", "^1")     // native dependency: Node only
  .withCapabilities([...])
  .build()
```

- No `.supports()` means the extension runs in any environment (as today).
- Several `.supports()` calls accumulate.
- Because the id is the package name, the range applies directly to that package.

#### How workflow and environment bindings combine at run time

1. **Compatibility.** Every extension the workflow uses must support the environment it's
   running in. Otherwise `ecp validate` and `ecp run` fail with `ECP_ENVIRONMENT_UNSUPPORTED`,
   naming the extension and the environments it does support. A workflow never names its
   environment, so the same file runs under `ecp run` (Node) and later on Temporal without
   changes.
2. **Extensions merge.** The environment's bindings provide defaults. When both bind the same
   extension, the workflow's config is merged over the environment's.
3. **Policies are additive.** Environment policies always apply, and workflow policies add to
   them. Every bound policy's hooks run, and a deny or pause from any of them wins. A workflow
   can tighten governance but never remove a host policy. This matters because an agent writes
   most workflows.
4. **Custody belongs to the environment.** Secrets providers (extensions that register a config
   resolver, such as `secrets` and `process-env`) can only be bound by the environment. A
   workflow that binds one fails validation. Workflows only reference keys with `secrets("…")`.

#### What the CLI does

- `ecp run` uses the built-in `@executioncontrolprotocol/node` environment, which binds
  `secrets` and `process-env`. Most users never write an environment file.
- If `environment.ecp.ts` exists in the ECP config directory (the oclif data directory), it's
  used as the user's default. This is how a person or team sets host policies once.
- `--env <file>` runs against a specific environment file, for example one a team shares.

### 4.5 CLI

Workflow commands (core names are reserved, and plugins can't claim them as topics):

| Command | Purpose |
| --- | --- |
| `ecp init [name]` | Scaffold `<name>.ecp.ts` |
| `ecp plugins new <name>` | Scaffold a plugin: a definition file and a minimal `package.json` |
| `ecp plugins build [dir]` | Generate a plugin's oclif files and `package.json` fields from its definition |
| `ecp plugins check [dir]` | Fail if a plugin's generated files are stale (CI) |
| `ecp search <intent>` | Rank installed capabilities for an intent |
| `ecp describe [id]` | Full schema and metadata for installed capabilities. `--format <id>` renders through an installed format plugin (for example `toon`) |
| `ecp validate <workflow>` | Validate the workflow file against installed plugins |
| `ecp install <workflow>` | Install every plugin the workflow file needs |
| `ecp run <workflow>` | Install missing plugins (with a prompt), run, and journal. Flags: `--input`, `--yes`, `--json`, `--events`, `--dry-run`, `--env <file>`, `--to <step>` (stop after that step) |
| `ecp runs list` | Recent runs, filterable by status and workflow |
| `ecp runs show <id>` | Journal: resolved graph and per-step records |
| `ecp runs resume <id> [--to <step>] [--approve]` | Continue a stopped or paused run from its cursor. `--approve` records approval for the step a policy paused on |
| `ecp runs rerun <id> [--from <step>] [--to <step>]` | Re-execute from a step with the current file, restoring earlier steps' outputs and state. `--from X --to X` re-runs exactly one step |
| `ecp invoke <capability-id>` | Generic single-capability call |
| `ecp compile <workflow>` | Manifest + requirements. `--format <id>` renders through an installed format plugin (for example `mermaid`) |
| `ecp config secrets add\|get\|list\|remove` | Local secrets |
| `ecp discover [query]` | npm search for `ecosystem:ecp-plugin` packages, first-party flagged |
| `ecp update` / `ecp rollback` | Update user plugins / remove user overrides of core plugins |
| `ecp plugins …` | install, uninstall, link, inspect, reset (from `@oclif/plugin-plugins`), plus new, build, check for authoring (above) |
| `ecp mcp serve` | JIT plugin (`@executioncontrolprotocol/mcp`) |
| `ecp app [workflow]` | JIT plugin (`@executioncontrolprotocol/plugin-app`) |

Plus generated `ecp <plugin> <capability>` commands for every installed plugin.

**Bundled core plugins:** `@oclif/plugin-help`, `@oclif/plugin-plugins`,
`@oclif/plugin-not-found`, `@oclif/plugin-autocomplete`,
and `@oclif/plugin-warn-if-update-available`. The CLI also depends on the
`@executioncontrolprotocol/node` environment, so secrets work with no plugin installed.

#### Hooks

- `command_not_found` maps an unknown topic to a plugin and offers to install it.
- `jit_plugin_not_installed` installs `mcp` or `app` at a pinned version.
- A plugin-trust check runs before any install.

### 4.6 Run journal, events and error codes

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
  | `ECP_BINDING_INVALID` | Extension or policy config fails the `withConfig` schema its definition declares, or a workflow binds a secrets provider |
  | `ECP_ENVIRONMENT_UNSUPPORTED` | An extension doesn't `.supports()` the environment the workflow is running in |
  | `ECP_SECRET_MISSING` | A referenced secret has no value |
  | `ECP_POLICY_DENIED` | A policy blocked the step; names the policy and its reason (for example `budget`) |
  | `ECP_RUN_PAUSED` | A policy paused the run (for example `approval`); names the policy and the `ecp runs resume` command |
  | `ECP_STEP_FAILED` | The capability threw; the original message is preserved |
  | `ECP_OUTPUT_INVALID` | The capability's output fails its schema |
  | `ECP_PLUGIN_DENIED` | The plugin trust check refused an install |
  | `ECP_RERUN_INCOMPATIBLE` | A step before `--from` changed since the journal was written |

- **Run statuses:** `completed`, `failed`, `paused` (a policy paused it), `stopped` (reached
  `--to`), `cancelled`. Paused and stopped runs keep a cursor and can be resumed.
- **Exit codes:** `0` success, including a run that stopped at `--to` · `1` run failed ·
  `2` validation or usage error · `3` missing plugins · `4` paused by a policy.

### 4.7 MCP

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

### 4.8 App

The App is two packages, so its logic works with or without the CLI. This is the same
library-plus-plugin split as MCP (§4.7). The MCP library and plugin fit in one package because
the library is small; the App is split because its UI would otherwise drag React into every
CLI install.

| Package | Contains | Depends on |
| --- | --- | --- |
| `@executioncontrolprotocol/app` | The UI carved from the `pre-reset` browser demo: graph editor (React Flow), Monaco source pane, run panel. Exported as React components and as a prebuilt static bundle. Talks to its host only through a `HostAdapter` interface | `core`, React (peer, only when used as components) |
| `@executioncontrolprotocol/plugin-app` | `ecp app [product.ecp.ts]`: local server, file watcher, and the local host adapter's server side. Serves `app`'s prebuilt bundle | `plugin-sdk`, `node` environment. No React at run time |

**The `HostAdapter` interface** is the seam that lets the same UI run anywhere:

| Method | Purpose |
| --- | --- |
| `load()` / `save(source)` | Read and write the Fluent workflow source |
| `watch(onChange)` | Push file changes into the UI (hot reload) |
| `describe()` / `search(q)` | Capability catalogue for the graph palette |
| `validate(source)` | Diagnostics shown on the graph |
| `run(source, input)` | Start a run and return the `--events` stream |

**In this phase the App is a link to the CLI.** One adapter ships with `app`:

- **Local** (used by `plugin-app`): calls the CLI process over HTTP and WebSocket on
  loopback. Runs use the Node environment and the user's installed plugins. This is the
  `ecp app` experience: the agent edits the file in the terminal, the graph updates live, and
  graph edits are written back to the file.

The App stores no secrets. Custody stays with the CLI's Node environment.

The `HostAdapter` seam keeps a later **in-page** adapter possible: running entirely in the
browser on the browser environment, for a docs playground, a hosted demo or Strata embedding
the editor. That needs a browser custody provider first, so it's in Later.

Either way, the App is a viewer and co-editor, not a chat client and not a model host: no
provider modal, no Chrome AI, no harness.

### 4.9 Docs site and the skill

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
| `packages/policies` | 0.8K | Split | `registry-control` → core; `budget`, `approval`, `state-control` → one plugin each; `image-policy` removed |
| `packages/evals` | 3.5K | **Remove** | — |
| `packages/harnesses/browser-nano` | 5.0K | **Remove** | — |
| `packages/harnesses/browser-coding` | 4.3K | **Remove** | — |
| `packages/environments/node` | 0.2K | Keep and grow | `environments/node` (`@executioncontrolprotocol/node`), the default environment. Gains the workflow file loader, the journal on disk, and the `secrets` and `process-env` providers |
| `packages/environments/browser` | 1.7K | Keep part, remove part | `environments/browser` (`@executioncontrolprotocol/browser`): executor and builtins stay; authoring panels, `browser-guide` and session config are removed |
| `packages/environments/temporal` | 0.1K | **Remove** | Returns later as `@executioncontrolprotocol/temporal`, built with `defineEnvironment` |
| `packages/extensions/index` | 0.1K | **Remove** | Installing plugins replaces the aggregator |
| `apps/browser-demo` | 9.9K | Carve | Graph editor, Monaco and run panel → `app`; the rest is removed |
| — | — | **New** | `plugin-sdk` |

### 5.2 Inside core

| Module | Lines | Fate |
| --- | ---: | --- |
| `harness/**` (authoring, prompts, definitions, repair loop, call-model) | 6.0K | **Remove** |
| `compile/*harness-artifact*` | ~0.2K | **Remove** (harness artifacts). Keep `compile/evaluate-browser.ts` and `compile/prepare-browser-source.ts`: they compile workflow modules in the browser, not harness artifacts |
| `test-session/`, `runtime/test-session-state.ts` | ~0.2K | **Keep until Phase 4.** Its abilities (run up to a step, re-run one step, resume from saved state) move into the run journal and `ecp run --to` / `runs resume` / `runs rerun`; then the module is removed |
| `feedback/` | 0.1K | **Remove** (chat feedback for the harness) |
| `testing/test-model-generate.ts` | ~0.1K | **Remove**; keep the test extension helpers |
| `encoding/strip-harness-typescript-output`, `strip-markdown-fences` | ~0.1K | **Remove** (model-output cleanup). Keep `encoding/utility-context.ts`: it is the encode/decode capability context |
| `bindings/harness.ts`, `validate/harness.ts` | ~0.1K | **Remove** |
| `registry`, `definitions`, `bindings` (extension, policy, step) | ~0.9K | Keep; drop `catalogExtension` and `globalRegistry` side effects. `defineEnvironment` becomes `defineEnvironment`, `.supports()` replaces `supportsPLACEHOLDER`, and `bindings/runtime.ts` is removed |
| `workflow`, `helpers`, `fluent`, `formats` | ~0.9K | Keep; add `.with([...])` to the workflow builder and `.requires()` to the extension and policy binding builders |
| `environment` | 1.5K | Change: becomes the host object (§4.4). `.with([...])` replaces `withExtensions`, `withPolicies` and `withRuntime`; store and remote-invoke wiring moves into `defineEnvironment`; adds the binding merge and compatibility rules. `describe` and `search` stay |
| `runtime` | 1.9K | Keep; add journal writer and event emitter, and resume from a step |
| `validate`, `schema`, `encoding` (json, fluent), `patch`, `invoke` | ~2.6K | Keep |
| `media`, `file`, `loaders`, `util`, `compile` (transpile, extract) | ~1.6K | Keep; the workflow file loader moves to `@executioncontrolprotocol/node` |
| — | — | **New:** journal model, error code catalogue, dependency inference, `registry-control` (from `policies`) |

### 5.3 CLI commands

| Today | Fate |
| --- | --- |
| `run`, `validate`, `describe`, `search`, `invoke`, `compile`, `config secrets *` | Keep, rework for workflow files and `--json` |
| `init` | Rewrite: scaffold a workflow file |
| `test start\|run\|rerun\|status` | **Keep until Phase 4**, then replace: `test start` + `test run --to` → `ecp run --to`; continuing → `runs resume`; `test rerun <step>` → `runs rerun --from <step> --to <step>`; `test status` → `runs show` |
| `serve` | **Remove** → `mcp serve`, and the App server |
| `up` | **Remove** → `app` |
| `encode`, `decode` | **Remove** from the CLI → `ecp format-toon encode\|decode` in `plugin-format-toon` |
| — | **New:** `install`, `runs *`, `discover`, `update`, `rollback`, `plugins *`, generated plugin commands |

### 5.4 Extension and plugin audit

Audited at `pre-reset`: every package under `packages/extensions`, `packages/vendor` and
`packages/policies`. The archived `executioncontrolprotocol/extensions` repo holds only the
same six vendor packages, so nothing is missing from this list. "Consumers" are the other
places in the monorepo that import the package.

#### Model providers

| Extension | Capabilities | Lines · tests | Runs in | State | Consumers | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| `anthropic` | `generate`, `evaluate` | 450 · 1 | Node, browser | Real | evals, harness, demo, aggregator | **Keep** → `plugin-anthropic`. Remove `evaluate` (a harness eval judge) |
| `openai` | `generate`, `evaluate` | 160 · 1 | Node | Real | demo, examples 02/03 | **Keep** → `plugin-openai`. Remove `evaluate` |
| `ollama` | `generate`, `listModels`, `evaluate` | 530 · 3 | Node | Real | cli (direct dependency), harnesses, demo | **Keep** → `plugin-ollama`. Remove `evaluate`; drop the CLI's direct dependency |
| `fal` | `generate` | 200 · 1 | Node | Real | demo, vendor examples | **Keep** → `plugin-fal` |
| `chrome-ai` | `checkAvailability`, `startModelDownload`, `getModelInstallState`, `generate` | 810 · 1 | Browser | Real, but only the demo harness uses it | harnesses, demo | **Remove**. Reasoning comes from the outer agent; in-workflow model calls use the other providers |

#### Data, transforms and connectors

| Extension | Capabilities | Lines · tests | Runs in | State | Consumers | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| `jsonata` | `transform` | 140 · 1 | Any | Real, pure | demo | **Keep** → `plugin-jsonata`, the reference plugin |
| `storage` | `read`, `write`, `workflow-save`, `workflow-load`, `workflow-list`, `workflow-delete` | 1,070 · 1 | Any | Real (local disk) | cli (direct dependency), demo | **Remove**. `azure-blob-storage` covers real storage; the `workflow-*` capabilities backed the demo's save feature, and workflows are now files. Persisting between steps is committed state; persisting between runs is the journal |
| `azure-blob-storage` | `upload`, `download`, `create-sas-url` | 800 · 3 | Any | Real | demo, vendor examples | **Keep** → `plugin-azure-blob-storage` |
| `slack` | `send` | 55 · 1 | Node | **Mock** (returns a fake timestamp) | vendor example | **Remove**. A real Slack plugin can come later |
| `memory` | `search`, `remember` (+ auto-remember hooks) | 90 · 1 | Any | **Stub**: process memory, lost when a CLI run ends | core tests, examples | **Remove**. Example 02 takes its signals as workflow input instead |

#### Media and creative

| Extension | Capabilities | Lines · tests | Runs in | State | Consumers | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| `image-sharp` | 11: `inspect`, `metadata`, `stats`, `resize`, `crop`, `convert`, `normalize`, `thumbnail`, `transform`, `composite`, `derive` | 1,550 · 2 | Node (native `sharp`) | Real | cli, harnesses, demo, examples | **Keep** → `plugin-image-sharp` |
| `adobe-firefly-services` | 84, generated from OpenAPI, across Firefly, Photoshop, Illustrator, InDesign, Express, Audio/Video, Substance 3D and Creative Production | 7,960 · 5 | Node | Real (generated clients) | harness, demo, vendor examples | **Keep** → `plugin-adobe-firefly-services`, migrated last, with a `firefly` topic alias. Stays one plugin |

#### Formats

| Extension | Capabilities | Lines · tests | Runs in | State | Consumers | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| `format-toon` | `encode`, `decode` | 500 · 2 | Any | Real | cli, mcp, core, harnesses, examples | **Keep** → `plugin-format-toon`, a converter (§4.2): `ecp format-toon encode`, and `ecp describe --format toon` |
| `format-mermaid` | `encode` | 350 · 2 | Any | Real | demo | **Keep** → `plugin-format-mermaid`, a converter: `ecp compile --format mermaid` for docs and PR descriptions |
| `format-reactflow` | `encode` + 12 run-progress hooks | 1,450 · 2 | Any | Real | demo | **Fold** into `app` |
| `format-eql` | `encode`, `decode` | 3,230 · 14 | Any | Real, but only the nano harness uses it | harnesses, demo | **Remove** |

#### Secrets providers (custody)

| Extension | Role | Lines · tests | Runs in | Decision |
| --- | --- | --- | --- | --- |
| `secrets` | OS keychain resolver for `secrets("…")` | 330 · 3 | Node | **Fold** into the `@executioncontrolprotocol/node` environment |
| `process-env` | Env-var resolver for `env("…")` | 70 · 0 | Node | **Fold** into the Node environment; add tests |
| `browser-secrets` | Passphrase-encrypted browser vault | 430 · 1 | Browser | **Remove**. In this phase the App is a link to the CLI and stores no secrets |

#### Lifecycle and aggregation

| Extension | Role | Lines · tests | Decision |
| --- | --- | --- | --- |
| `telemetry` | Four no-op lifecycle hooks (placeholder) | 30 · 1 | **Remove**. The run journal and `--events` replace it. A real OpenTelemetry plugin on oclif hooks (the Adobe pattern) can come later |
| `extensions` (`packages/extensions/index`) | Aggregator that registers nine extensions | 65 · 1 | **Remove**. Installing plugins replaces it |

#### Policies (`packages/policies`)

| Policy | Role | Decision |
| --- | --- | --- |
| `budget` | Cost, model-call, retry and token limits | **Keep as a plugin** → `plugin-budget`. Core doesn't impose policies that aren't installed |
| `approval` | Pause before listed capabilities | **Keep as a plugin** → `plugin-approval` |
| `state-control` | Allowed and denied mutation paths and ops | **Keep as a plugin** → `plugin-state-control` |
| `registry-control` | Authorizes dynamic extension registration through `policy:pre` | **Fold** into core. It becomes the basis of the plugin trust check (§4.5) |
| `image-policy` | Image input and output limits | **Remove** |

One plugin per policy keeps the naming rule (`@executioncontrolprotocol/budget` →
`plugin-budget`), so a workflow that uses a policy gets it installed the same way as an
extension.

**Result:**

- **14 first-party plugins:** anthropic, openai, ollama, fal, jsonata, azure-blob-storage,
  image-sharp, adobe-firefly-services, format-toon, format-mermaid, budget, approval,
  state-control, and app.
- **Folded:** 2 extensions into the Node environment (`secrets`, `process-env`) and 1 policy
  into core (`registry-control`).
- **Removed (9):** format-eql, chrome-ai, memory, telemetry, the aggregator, storage, slack,
  browser-secrets and image-policy.

### 5.5 Everything else

| Area | Fate |
| --- | --- |
| `examples/01-echo`, `02-weekly-brief`, `03-secrets-bind`, `06-invoke`, `07-accepts-returns`, `create-then-summarize-ollama`, `ollama-filesystem-documents`, `ollama-mcp-tools` | Convert to single-file `*.ecp.ts` workflows (`02-weekly-brief` takes its signals as workflow input instead of `memory`) |
| `examples/vendor/03-fal-chain`, `04-image-prep` (without `image-policy`), `adobe-firefly-smoke`, `azure-adobe-assets`, `azure-photoshop-manifest` | Convert; each moves next to its plugin as `plugins/<name>/examples/` |
| `examples/04-compile-and-run`, `04-encode-decode`, `05-test-session`, `harness-ollama`, `controller-specialist`, `vendor/browser-demo-host`, `vendor/02-weekly-brief-with-slack` | **Remove**; covered by docs or by removed features |
| `docs/*.md` (assessments, reports, harness, EQL, daemon, browser review), `docs/ui-example` | **Remove**; conceptual content moves to the docs site |
| `ecp-overhaul.md` | **Remove**; superseded by this plan |
| `SPEC.md`, `ARCHITECTURE.md`, `README.md`, `SETUP.md`, `RELEASING.md` | Rewrite for workflow files, plugins, delegation and Changesets |
| `AGENTS.md`, `CLAUDE.md` | Rewritten for the milestone ahead of Phase 1 (2026-10-21): they defer to this plan, mark frozen code, and give each package its reset status. Each phase updates the sections it changes |
| `CHANGELOG.md`, `LICENSE` | Keep |
| `archive/legacy-v0.5` | **Remove** (still at tags `v0.5.0` and `v0.5-latest`) |
| `config/ecp.config.example.yaml` | **Remove** (no config files) |
| `.gitmodules` (empty), `.cursor/eval-timing.ndjson` | **Remove** |
| `.cursor/rules/*` | Updated ahead of Phase 1 (2026-10-21): new always-on `reset-milestone.mdc`; `harness-prompt-language.mdc` removed; the rest corrected (several still described the v0.5 CLI). Each phase keeps them current |
| `skills/ecp-core` | Updated ahead of Phase 1 to point at the plan, with now-and-after references. Phase 1 deletes `harness-eval.md` |
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
| TypeScript lines | ~83K | ~50K (about 27K removed outright; about half of the 12K demo and React Flow code survives in `app`) |
| Shippable packages | 31 | 7 (core, node, browser, cli, mcp, plugin-sdk, app) + 14 plugins |
| Packages a user needs to start | CLI + an environment module that imports each extension | `cli`, then plugins installed on demand |
| Model-facing harness code | ~19K (core harness, harnesses, EQL, evals) | 0, plus one skill |

### 5.7 Removal checklist

Everything that leaves the repo, in one place. Phase 1 works through this list, except the
two moves noted at the end. Everything stays recoverable at the `pre-reset` tag.

#### Packages and apps

- `packages/evals`
- `packages/harnesses/browser-nano`, `packages/harnesses/browser-coding`
- `packages/extensions/format-eql`, `chrome-ai`, `memory`, `telemetry`, `index`, `storage`,
  `browser-secrets`
- `packages/vendor/slack`
- `packages/policies/src/image-policy*.ts`
- `packages/environments/temporal`
- `apps/browser-demo` (its graph editor, Monaco and run panel come back in Phase 8 as `app`)

#### Inside surviving packages

- `core/src/harness/**` (authoring prompts, intent classification, EQL normalisers, repair
  loops, `call-model`, prompt primers)
- `core/src/compile/*harness-artifact*` (`evaluate-browser.ts` and `prepare-browser-source.ts`
  stay: they compile workflow modules in the browser)
- `core/src/feedback/` (`test-session/` and the `ecp test` commands stay until Phase 4 replaces
  them)
- `types/src/harness*.ts`, `intent.ts`, `probe-context.ts`, and the harness-only parts of
  `model.ts`
- The `browser()` config placeholder and `BROWSER_SECRETS_RESOLVER_ID`
- The `evaluate` capabilities in `anthropic`, `openai` and `ollama`
- `core/src/testing/test-model-generate.ts`
- `core/src/encoding/strip-harness-typescript-output.ts`, `strip-markdown-fences.ts`
  (`utility-context.ts` stays: encode/decode capability context)
- `core/src/bindings/harness.ts`, `core/src/validate/harness.ts`, and `withHarnesses` on the
  environment builder
- `runtimes/browser/src/authoring/*`, `extensions/browser-guide.ts`,
  `extensions/browser-session-config.ts`
- CLI commands `serve`, `up`, `encode`, `decode`, and `src/lib/up/*`, `src/lib/http/*`
- The CLI's direct dependencies on `extension-ollama` and `extension-storage`

#### Examples, docs and root files

- `examples/04-compile-and-run`, `04-encode-decode`, `05-test-session`, `harness-ollama`,
  `controller-specialist`, `vendor/browser-demo-host`, `vendor/02-weekly-brief-with-slack`
- `docs/*` (assessments, reports, harness and eval docs, EQL, daemon, browser review,
  `ui-example`)
- `ecp-overhaul.md`, `archive/legacy-v0.5`, `config/ecp.config.example.yaml`, `.gitmodules`,
  `.cursor/eval-timing.ndjson`
- `skills/ecp-core/references/harness-eval.md`

#### Scripts and CI

- `scripts/ecp-up-demo.mjs`, `scripts/migrate-deps-to-pnpm.mjs`
- `scripts/bump-all-ecp-versions.mjs`, `publish-workspaces.mjs`,
  `check-version-gt-published.mjs` (in Phase 5, when Changesets replaces them)
- `.github/workflows/evals.yml`, `pages.yml`; `development.yml` (in Phase 5)
- The demo and eval jobs in `ci-pipeline.yml`
- Root scripts `test:eval:*`, `eval:*`, `dev:demo`, `up:demo`, `build:demo`, `test:demo`

#### Moved, not deleted

- `extensions/format-reactflow` → `app` (Phase 8)
- `policies` `budget`, `approval`, `state-control` → their own plugins (Phase 5);
  `registry-control` → core (Phase 2)

#### Outside this repo

- Archive the GitHub repos `executioncontrolprotocol/extensions` and
  `executioncontrolprotocol/browser-demo` (both already say they moved into the monorepo).
- Deprecate the retired 0.x npm packages at 1.0 (Phase 9).

## 6. Borrowed from Adobe I/O CLI

Studied: `adobe/aio-cli`, `aio-cli-plugin-app`, `aio-cli-plugin-runtime`,
`aio-cli-plugin-telemetry`, `@oclif/plugin-plugins`, and oclif's JIT plugins and explicit
command loading.

| Adobe I/O pattern | ECP adoption |
| --- | --- |
| Thin root CLI; every feature is an `@adobe/aio-cli-plugin-*`, with a set of core plugins in `oclif.plugins` | `ecp` bundles only the oclif essentials plus the Node environment |
| Logic in `aio-lib-*` libraries; plugins are thin CLI shells | Logic lives in the extension definition; `plugin-sdk` generates the whole shell (commands, manifest, `package.json` fields), so there's no hand-written shell at all |
| `aio discover` queries the npm registry and offers an interactive install (keyword-based search was planned but never finished) | `ecp discover` on keyword `ecosystem:ecp-plugin`, with `--json` |
| `aio update` splits core and user plugins and warns when a user install shadows a newer core one; `aio rollback` | `ecp update` and `ecp rollback`, same logic |
| `oclif.scope` and the `plugin` prefix for short install names | `ecp plugins install jsonata` → `@executioncontrolprotocol/plugin-jsonata` |
| `@oclif/plugin-not-found` plus a `command_not_found` hook | Unknown topic → offer the matching plugin |
| Telemetry as its own plugin on `init`, `prerun`, `postrun` and `command_error` hooks | A future opt-in telemetry plugin (OpenTelemetry) on the same hooks. Today's no-op `telemetry` extension is removed |
| oclif JIT plugins (`jitPlugins`, `jit_plugin_not_installed`) | `mcp` and `app` appear in help before install |
| `plugins link` for local development | The documented plugin-author loop |

From our own closed PR #23 (`feat/plugin-install`): plugin trust policy (allowed source types,
third-party plugins on or off), re-implemented as a pre-install check on top of
`@oclif/plugin-plugins`.

## 7. Phases

Each phase is a `feat/<phase>-…` branch with a PR into `milestone/cli-reset`. CI must be green
on the milestone branch after every phase. The summaries below are the outline; **each phase
has a detailed doc in [`reset/`](reset/README.md)** with scope, file-level tasks, design notes,
tests and exit criteria. Phases 6, 7 and 8 can run in parallel after Phase 5.

### Phase 0 — Merge and freeze ✅ 2026-10-19

Detail: [`reset/phase-0-merge-and-freeze.md`](reset/phase-0-merge-and-freeze.md)

- PR #32 merged into `development`, tagged `pre-reset` (`07e91a8`).
- `milestone/cli-reset` created with this plan. `main` untouched and nothing published.
- Left over: delete the stale branches `feat/build-cleanup`, `feat/delegation-testing`,
  `feat/memory-recall`, `feat/plugin-install`, `cursor/development-environment-setup-593c`,
  and the merged local branches.

### Phase 1 — Trim ✅ 2026-10-22

Detail: [`reset/phase-1-trim.md`](reset/phase-1-trim.md)

1. Add `milestone/**` to the CI triggers.
2. Work through the §5.7 removal checklist (packages, core modules, CLI commands, examples,
   docs, scripts, workflows, root scripts). Leave the Changesets replacements for Phase 5.
3. Move `apps/browser-demo` and `format-reactflow` out of the workspace (they come back from
   `pre-reset` in Phase 8).
4. Fix the build, lint and tests on what's left.

**Exit:** green CI; no harness, eval, EQL or demo code; the workspace builds.

### Phase 2 — Consolidate core and environments ✅ 2026-10-23

Detail: [`reset/phase-2-core-and-environments.md`](reset/phase-2-core-and-environments.md)

1. Fold `types` into `core/types` and `registry-control` into core.
2. Collapse runtimes into environments:
   - `defineEnvironment` becomes `defineEnvironment`, which owns the executor and the store and
     remote-invoke wiring.
   - `environment(id).with([...])` replaces `withExtensions`, `withPolicies` and
     `withRuntime`. The `runtime()` binding is removed.
   - `packages/environments/{node,browser}` move to `environments/{node,browser}`, keeping their
     package names (which are their environment ids).
   - `secrets` and `process-env` fold into the Node environment.
   - `browser-secrets` is removed; the browser environment has no secrets provider yet.
3. Add `.supports(environmentId, range?)` to extension and policy definitions, replacing
   `supportsPLACEHOLDER` in the 15 files that use it.
4. Make definitions data: remove `catalogExtension` and `globalRegistry` side effects; the
   host owns the registry.
5. Lint that core has no Node-only imports, and run core's unit tests in both the Node and
   browser Vitest projects.

**Exit:** `core` about 12K lines and environment-agnostic; tests green in Node and browser;
the Node and browser environments build on `defineEnvironment`.

### Phase 3 — Plugin SDK and CLI

Detail: [`reset/phase-3-plugin-sdk-and-cli.md`](reset/phase-3-plugin-sdk-and-cli.md)

1. `plugin-sdk`: `toCommands()`, the `EcpCommand` base class (flag generation, `--input`, the
   `--json` envelope and errors, help rendering), `defineOperation()`, and the plugin build
   library that generates every oclif file (§4.2).
2. Define the CLI's own commands as operations and generate them with `toCommands()`,
   including the authoring commands `ecp plugins new|build|check`.
3. Rebuild `cli` around §4.5: bundled core plugins, scope and prefix, the `command_not_found`
   and trust hooks, `discover`, `update`, `rollback`.
4. Migrate `plugin-jsonata` as the reference plugin, with no hand-written oclif code.

**Exit:** `ecp plugins link plugins/plugin-jsonata` gives a working
`ecp jsonata transform --json`.

### Phase 4 — Workflow files and observability

Detail: [`reset/phase-4-workflow-files-and-observability.md`](reset/phase-4-workflow-files-and-observability.md)

1. `workflow(...).with([...])`, `.requires(range, package?)` on the extension and policy
   builders, and auto-binding of extensions used only in steps. Also: the workflow file loader
   with core self-resolution, dependency inference, and validation of bound config against
   each definition's `withConfig` schema.
2. Environment layering (§4.4): merge environment and workflow bindings, additive policies,
   environment-only secrets providers, the `ECP_ENVIRONMENT_UNSUPPORTED` compatibility check,
   the user default `environment.ecp.ts`, and `--env <file>`.
3. `ecp run`, `validate`, `install` and `compile` on workflow files; the missing-plugin flow.
4. Run journal, `--events`, error code catalogue, exit codes, `ecp run --to`, and
   `ecp runs list|show|resume|rerun`, replacing `ecp test` and `test-session`.
5. Convert the examples to single-file workflows.

**Exit:** on a machine without `plugin-jsonata`, `ecp run demo.ecp.ts` prompts, installs and
runs; `--json` returns `ECP_PLUGINS_MISSING`; a failed step reruns with `--from`.

### Phase 5 — Plugins to npm

Detail: [`reset/phase-5-plugins-to-npm.md`](reset/phase-5-plugins-to-npm.md)

1. Migrate the remaining extensions and policies per §5.4. Order: anthropic, openai, ollama,
   format-toon, format-mermaid (with `--format` support in `describe` and `compile`), budget,
   approval, state-control, fal, image-sharp, azure-blob-storage, then adobe-firefly-services.
2. Changesets with independent versions; `plugin-pack-smoke` in CI for every plugin.
3. Prerelease publishing from the milestone branch under the `next` dist-tag.

**Exit:** criteria 1, 3 and 4 of §2.4 pass with `@next` packages.

### Phase 6 — Docs site and skill

Detail: [`reset/phase-6-docs-and-skill.md`](reset/phase-6-docs-and-skill.md)

CLI-first rewrite of the docs repo, generated reference pages, and the rewritten `ecp` skill
installable with `npx skills add`.

**Exit:** Dogfood A (§2.4 criterion 7).

### Phase 7 — MCP

Detail: [`reset/phase-7-mcp.md`](reset/phase-7-mcp.md)

`@executioncontrolprotocol/mcp` per §4.7.

**Exit:** Dogfood B.

### Phase 8 — App

Detail: [`reset/phase-8-app.md`](reset/phase-8-app.md)

`app` and `plugin-app` per §4.8, carved from `pre-reset`: the `HostAdapter` interface and the
local adapter behind `ecp app`.

**Exit:** Dogfood C.

### Phase 9 — 1.0 release

Detail: [`reset/phase-9-release.md`](reset/phase-9-release.md)

1. Confirm every §2.4 criterion.
2. Merge `milestone/cli-reset` → `development` → `main`. This publishes 1.0 (publishing runs
   on `main`).
3. Deprecate the retired 0.x packages on npm with a pointer to their replacements.

### Later

Detail: [`reset/later.md`](reset/later.md)

- **Healing automation:** `--on-failure <command>` wakes an agent (for example `claude -p`)
  with the journal path when an unattended run fails, plus a scheduler (`ecp schedule`).
- **`plugin-reflex`:** `decide.choice`, `decide.yesno` and `decide.score` backed by so1
  readout, Laya or Jev. Decisions become ordinary steps; logit fingerprints flag drift to the
  supervising agent.
- **Hosted MCP + cloud secrets binding** (Strata).
- **In-page App:** an in-page `HostAdapter` on the browser environment, once a browser custody
  provider exists (docs playground, hosted demo, Strata embedding).
- **Temporal environment** (`@executioncontrolprotocol/temporal`, built with `defineEnvironment`)
  once hosted execution needs durable runs. Workflows run on it unchanged.

## 8. What carries forward

Knowledge from the earlier design notes (agent-os `personal/knowledge/topics/ecp/`, `reflex/`,
`strata/`, `ecp-design-intelligence/`) that still holds after the reset. Anything here that the
reset changes is called out.

### 8.1 Model invariants (unchanged)

- **Definitions, bindings, invocations** stay distinct: `defineExtension` / `extension().with()`
  / `step().with().as()`.
- **Binding grammar:**
  - Intrinsic: `thing(ref).with(config)`, used for extensions, policies and environments.
  - Delegating: `thing(ref).uses(capability).with(config)`. It survives for encoders and
    decoders; its harness and eval uses are gone.
  - Invocation: `step(cap).with(input).as(key)`.
- **State model:**
  - `ref()` reads committed state, and `state()` is a mutable handle for `ctx.store`.
  - Writes are staged, inspected in `policy:post`, then committed together with the `.as()`
    output, or discarded on failure or deny.
  - `.as(key)` is the only normal path into committed state.
- **Lifecycle:**
  - Public scopes are `run`, `step` and `policy`, plus the `environment:*` events secrets
    providers use.
  - No workflow-authored hooks.
  - Policy decisions are `allow`, `deny`, `pause` or `modify`, and `policy:finally` can't change
    the outcome.
- **Retries:** business loops live in the workflow; technical retries live in the runtime or a
  policy.
- **Validation layers:**
  - Workflow-only checks: schema, unique step ids, graph shape, ref order.
  - Environment-aware checks: capabilities, schemas, required config, approvals, and now
    `.supports()` compatibility.
  - Every issue has `code`, `message`, `path`, `suggestions` and `severity`.
- **Capability handlers** are `(input, ctx) => output`, with `ctx.store`, read-only `state`,
  `run`, `step`, `logger`, `usage`, and mediated `capabilities.call`.
- **Operational API** lives on `Ecp` after `init()`, not on the builder.
- **Ids:** the `@executioncontrolprotocol/*` namespace, and schema ids such as
  `@executioncontrolprotocol.workflow` v1.0. The compiled manifest format doesn't change.
- **Registry mechanism vs policy:** registration and freezing are mechanism (the environment);
  authorizing a registration is policy (`registry-control`).

### 8.2 Positioning and strategy

- **Embrace-and-extend MCP:** ECP doesn't redefine tool calling. It hosts and governs
  capabilities, and now also exposes them as MCP tools.
- **Custody is a binding:** which vault answers `secrets("…")` is decided by the environment,
  never the workflow.
- **Strata never diverges:**
  - Strata is hosted ECP. It may add *environments* (Temporal, a cloud vault provider) and
    plugins, never workflow semantics.
  - Anything a Strata workflow expresses must run under `ecp run`.
  - New capabilities land in ECP or its plugin ecosystem first.
- **Connectors are commodity:** governance and composition are the value. Breadth can come
  later from an adapter plugin that wraps n8n nodes as capabilities, after a license and
  credential review. Governance-critical paths stay ECP-native.
- **Moats from the Strata research:**
  - The run journal is the start of the *compilation corpus*: every workflow, run and outcome
    is a structured, trace-paired record. Keep journals structured and versioned from the
    first release.
  - The governance record (policy decisions, approvals) is a compliance artifact; plan for
    retention and export when hosted.
  - Deterministic replay removes inference cost, which incumbents billing on consumption can't
    easily match.

### 8.3 Reflex (System-1 decisions)

- Typed decisions become ordinary capabilities in a later `plugin-reflex`. Backends are tried in
  this order: a deterministic graph, then so1 readout, then Laya, then Jev.
- The skill-as-workflow structure ladder (L0 prose skill → L1 annotated skill → L2 compiled
  graph) maps to the outer agent writing workflow files and promoting repeated successful
  traces into fixed graphs.
- Logit fingerprints and canaries are drift signals that should escalate to the supervising
  agent through the same failure path as `--on-failure`. Schema guards on step outputs come
  first, since they're free.

### 8.4 Creative and design direction

- **Design Intelligence** (portable `CreativeDocument`, `design.*` capabilities, brand rules) is
  a future domain plugin on this architecture. The source of truth is always the document.
- Host-native document scripting (Photoshop, InDesign assembly) is reached through capabilities
  that `.supports()` the Node environment. That's where the old local-daemon idea now lives.
- `plugin-adobe-firefly-services`, `plugin-image-sharp` and `plugin-fal` are the image pipeline
  that feeds or post-processes design documents.

### 8.5 App UI preferences

These carry over from the demo into the `app` package:

- Dark mode, Tailwind with shadcn, and Lucide icons.
- Monaco and Mermaid.
- Progressive panel reveal, with the workflow opening full-screen from the right.
- The "Solaris Slate" design tokens from the demo's `DESIGN.md`.

The bottom-docked chat doesn't carry over, because the App isn't a chat client.

### 8.6 Contributor rules (carried into the new `AGENTS.md`)

- Extensions depend on core only, never on an environment, the CLI or MCP. Heavy SDKs stay in
  their own plugin packages.
- Be honest about stubs: anything mocked or unimplemented is labelled as such, and isn't
  shipped as if it were real. The audit removed the `slack` mock and the `memory` and
  `telemetry` stubs for this reason.
- Don't weaken a valid failing test or a quality gate to get CI green.
- Agents discover capabilities with `describe` and `search` instead of hard-coding them.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| A plugin's install folder gets its own copy of core, so registries split | Definitions are data and the host owns the registry (§4.1). Core is a peer dependency of plugins |
| oclif startup slows as plugins pile up | `oclif manifest` in every plugin; criterion 10 is the budget |
| Dependency inference picks the wrong package | The naming convention plus `.requires()` pins; `validate` names every inferred package |
| Loose model output in flags (nested input) | Flags only for top-level primitives; `--input` JSON for everything else |
| Existing 0.x users and Strata break | 1.0 is a major release; 0.x stays installable and deprecated; `pre-reset` keeps the full history |
| The browser demo disappears from GitHub Pages | Point the docs site at `ecp app`; the demo stays buildable from `pre-reset` |
| One user-level plugin install can't satisfy two workflows pinning different majors | Warn on the mismatch now; consider per-workflow installs later |

## 10. Open decisions

1. **Flag depth.** Only top-level primitives become flags. Revisit after Dogfood A.
2. **Command namespace.** `ecp <plugin> <capability>` at the root, with core names reserved.
   The alternative is `ecp x <plugin> <capability>`.
3. **Per-workflow plugin isolation.** Deferred (see Risks).
4. **`plugin-sdk` as its own package** or a `cli/sdk` subpath. Own package is preferred so
   plugins don't depend on the whole CLI.
