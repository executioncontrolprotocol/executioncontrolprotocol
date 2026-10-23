# Phase 3 — Plugin SDK and CLI

> Status: Planned · Branch: `feat/phase-3-plugin-sdk-and-cli` · Depends on: Phase 2 ·
> Plan: §4.2, §4.5, §6

## Starting point after Phase 2

Protocol types live at `@executioncontrolprotocol/core/types` (`packages/core/src/types`).
There is no `packages/types` package. After Phase 2 PR 2 lands, hosts live in
`packages/environments/{node,browser}` and definitions are data (no `catalogExtension`).
Until then, PR 2 still has `packages/runtimes/*`, `withExtensions`, and `defineRuntime`.

## Goal

Rebuild the `ecp` CLI as a thin oclif host with plugin management, and ship
`@executioncontrolprotocol/plugin-sdk` so that one extension definition becomes CLI commands
with **no hand-written oclif code**: no command classes, no `oclif.ts`, no hand-maintained
`oclif` block in `package.json`. The CLI's own commands use the same mechanism. Prove it end
to end with `plugin-jsonata`. The design and the prototype that validated it are in §4.2.

## Scope

**In:**

- The `plugin-sdk` package.
- The CLI's oclif configuration, bundled plugins and hooks.
- `discover`, `update` and `rollback`.
- The host object that commands run against.
- Migrating `jsonata` as the reference plugin.

**Out:**

- Workflow files and `.with([...])` (Phase 4). `ecp run` keeps today's `--env <module>` path
  until then.
- Migrating other extensions (Phase 5).
- MCP (Phase 7).

## Tasks

### 1. `@executioncontrolprotocol/plugin-sdk`

New package at `packages/plugin-sdk`. It depends on `@oclif/core` and has `core` as a peer.

First, decide the oclif major. The repo is on `@oclif/core` 4.10, and 5.x is current. Every
plugin will depend on the SDK's oclif major, so pick it once here: check the 5.x changes to the
explicit strategy, manifests and JSON output, and prefer 5 unless something blocks it.

**Runtime API:**

```ts
export function toCommands(source: ExtensionDefinition | PolicyDefinition | OperationDefinition[]): Record<string, Command.Class>
export abstract class EcpCommand extends Command { /* input merge, validation, envelope, errors, exit codes */ }
export function defineOperation(name: string): OperationBuilder   // host operations: the CLI's own commands
export function getHost(config: Config): EcpHost        // the CLI's environment, registry and output
export type EcpHost = { ecp: Ecp; registry: Registry; environmentId: string; output: OutputMode }
```

**Plugin build library** (used by the `ecp plugins new|build|check` commands, task 4):

```ts
export function scaffoldPlugin(dir: string, name: string): Promise<void>
export function buildPlugin(dir: string): Promise<BuildReport>   // package.json fields, dist/oclif.js, oclif.manifest.json
export function checkPlugin(dir: string): Promise<CheckReport>   // stale generated files or fields
```

- `buildPlugin` writes the `package.json` fields from the definition:
  - `ecp.extension`
  - `exports["./oclif"]`
  - The `oclif` block (explicit strategy, `topics` from the extension summary)
  - The keywords and `files`
- It then writes `dist/oclif.js` (`COMMANDS = toCommands(definition)`).
- Then it writes `oclif.manifest.json` by loading the package with oclif's `Config.load` and
  saving the computed manifest. No `oclif` dev tool is needed.
- The `oclif` block must exist because `@oclif/plugin-plugins` refuses to install a package
  without one. `buildPlugin` keeps it generated.

For each capability, `toCommands` generates one command class:

- **Id:** `<extension name>:<capability>`, shown as `ecp jsonata transform` (topic separator is
  a space).
- **Flags from the input schema:**
  - Top-level `z.string()` → `Flags.string`; `z.number()` → `Flags.integer` or `Flags.string`
    parsed as a number; `z.boolean()` → `Flags.boolean`; `z.enum()` → `Flags.string` with
    `options`; arrays of primitives → `multiple: true`.
  - Nested objects, unions and unknowns get no flag; they come from `--input`.
  - Flag names are the field names in kebab-case. A field that collides with a reserved flag
    (`json`, `input`, `help`, `yes`) is input-only.
- **`--input <file|->`:** JSON for the full input, from a file or stdin. Flags override
  fields from `--input`.
- **Validation:** the merged input is parsed with the capability's zod input schema before
  invoking. A failure returns `ECP_INPUT_INVALID` with zod issue paths.
- **Output:**
  - `static enableJsonFlag = true`.
  - With `--json` or when stdout isn't a TTY, print the envelope `{ ok: true, data }` or
    `{ ok: false, error: { code, message, path, suggestions } }`.
  - In a TTY, pretty-print `data`.
- **Help:** `summary` from metadata; `description` from description + use cases + projections;
  `examples` generated from the input schema.
- **Run:** `getHost(this.config).ecp.invoke(capabilityId, input)`, which goes through the policy
  pipeline exactly like a one-step workflow.
- **Errors in `--json` mode:** `EcpCommand` overrides oclif's `catch`/`toErrorJson` so failures
  print our envelope with the `ECP_*` code and set the right exit code. Without this, oclif
  prints its own `{"error":{"oclif":{"exit":2}}}` and the code is lost (seen in the
  prototype).
- **Exit codes:** `0` ok · `1` capability failed · `2` invalid input or usage · `4` paused by a
  policy.

Policy-only plugins (Phase 5) produce no commands; `toCommands` returns an empty map, and the
policy shows up in `ecp describe --policies`.

### 2. The CLI host

- An `init` hook in the CLI creates the host once per process:
  1. Resolve the Node environment.
  2. Create a registry.
  3. Load the `ecp.extension` entry of every installed plugin (`this.config.getPluginsList()`)
     and register its definition.
  4. Store the host under `Symbol.for("ecp.host")` on `globalThis`.
- Generated commands and core commands both read it through `getHost`.
- Plugins never touch the registry themselves (definitions are data, Phase 2).
- Remove the deprecated `globalRegistry`.

### 3. oclif configuration (`packages/cli/package.json`)

```jsonc
"oclif": {
  "bin": "ecp", "dirname": "ecp", "topicSeparator": " ",
  "commands": "./dist/commands",
  "scope": "executioncontrolprotocol", "pluginPrefix": "plugin",
  "plugins": [
    "@oclif/plugin-help", "@oclif/plugin-plugins", "@oclif/plugin-not-found",
    "@oclif/plugin-autocomplete", "@oclif/plugin-warn-if-update-available"
  ],
  "jitPlugins": {
    "@executioncontrolprotocol/mcp": "^1",
    "@executioncontrolprotocol/plugin-app": "^1"
  },
  "hooks": {
    "init": "./dist/hooks/init-host.js",
    "command_not_found": "./dist/hooks/command-not-found.js",
    "jit_plugin_not_installed": "./dist/hooks/jit-install.js",
    "plugins:preinstall": "./dist/hooks/trust.js"
  }
}
```

- `@executioncontrolprotocol/node` is a regular dependency, so secrets work with no plugins
  installed.
- The JIT entries point at packages that don't exist until Phases 7 and 8. Add each entry in
  the phase that publishes it.

### 4. Core commands, defined as operations

**Plugin authoring is bundled in the CLI** in the `ecp plugins` topic, next to the install and
management commands from `@oclif/plugin-plugins` (which already include the author's
`plugins link`). They're built as operations over the library in task 1:

| Command | Does |
| --- | --- |
| `ecp plugins new <name>` | Scaffold a plugin with only `src/index.ts` and a minimal `package.json` |
| `ecp plugins build [dir]` | `buildPlugin`: generated `package.json` fields, `dist/oclif.js`, `oclif.manifest.json` |
| `ecp plugins check [dir]` | `checkPlugin`: fails if anything generated is stale; runs in CI for every plugin |

- **No name clash today:** `@oclif/plugin-plugins` defines `plugins`, `install`, `uninstall`,
  `link`, `inspect`, `reset` and `update`.
- **If it adds one of our names later,** oclif runs the root CLI's command first (its priority
  rules in `determine-priority`). Add a test that would catch a clash on an oclif upgrade.
- **The singular `ecp plugin …`** is reserved, and the not-found hook redirects it to
  `ecp plugins …`.

The CLI's own commands are `defineOperation(...)` definitions (zod input, metadata, handler,
optional `cli: { args: [...] }` hint for positional arguments). The CLI's `COMMANDS` map is
`toCommands(operations)`, and Phase 7 generates the MCP meta tools from the same list. There
are no hand-written command classes in `packages/cli`; the only oclif code is the hooks.

Keep and rework, all with `--json`:

- `describe [id]` (gains `--policies` and `--format`)
- `search <intent>`
- `validate`
- `run` (still `--env <module>` until Phase 4)
- `invoke <capability-id>`
- `compile` (gains `--format`)
- `config secrets add|get|list|remove`
- `init` (rewritten in Phase 4)

New:

- **`discover [query]`:**
  - Queries `https://registry.npmjs.org/-/v1/search?text=keywords:ecosystem:ecp-plugin <query>&size=250`.
  - Marks `@executioncontrolprotocol/*` as first-party and hides installed plugins (unless
    `--all`).
  - Supports `--json` and `--install` (interactive multi-select, then `plugins:install` for
    each).
  - Sort flags match Adobe's: `--sort-field date|name`, `--sort-order asc|desc`.
- **`update`:** a port of `aio update`.
  - Lists user plugins with newer versions on npm and installs them (`--list`,
    `--interactive`, `--no-confirm`).
  - Core (bundled) plugins aren't updatable this way; the user reinstalls the CLI.
  - Warns when a user-installed plugin shadows a newer bundled one.
- **`rollback`:** removes user-installed overrides of bundled plugins.

Reserve root command names (`init`, `search`, `describe`, `validate`, `install`, `run`, `runs`,
`invoke`, `compile`, `config`, `discover`, `update`, `rollback`, `plugin`, `plugins`, `mcp`,
`app`, `help`). A plugin whose topic collides fails `plugin-sdk`'s build check.

### 5. Hooks

- **`command_not_found`:**
  1. Take the first token as a topic and map it to `@executioncontrolprotocol/plugin-<topic>`.
  2. Check npm for the package.
  3. If it exists: in a TTY, ask to install and rerun; otherwise print
     `ecp plugins install <topic>` and exit `3`. With `--json`, print
     `{ ok: false, error: { code: "ECP_PLUGINS_MISSING", … } }`.
  4. If it doesn't exist, defer to `@oclif/plugin-not-found` suggestions.
- **`jit_plugin_not_installed`:** confirm (or `--yes`), then
  `plugins:install <name>@<pinned range>`, then rerun the command.
- **`plugins:preinstall` (trust):** evaluate core's `registry-control` against the package:
  - `@executioncontrolprotocol/*` from npm is always allowed.
  - Third-party packages ask once per package in a TTY (remembered in `<dataDir>/trust.json`).
  - Without a TTY, third-party packages need `--yes` or `ECP_TRUST_THIRD_PARTY=1`.
  - GitHub URLs and local paths need `--allow-source git|path`.
  - A denied install fails with `ECP_PLUGIN_DENIED`.

### 6. Reference plugin: `plugin-jsonata`

- Move `packages/vendor/jsonata` to `plugins/plugin-jsonata` and rename it to
  `@executioncontrolprotocol/plugin-jsonata`.
- Set the build script to `tsc -b && ecp plugins build`, with the workspace CLI as a dev
  dependency. Don't write `oclif.ts`, the manifest or the `oclif` block by hand;
  `ecp plugins build` generates them.
- Commit the generated `package.json` fields. CI runs `ecp plugins check`.
- Workspace build order: `core` → `plugin-sdk` → `node` → `cli` → plugins. The CLI must never
  depend on a plugin, or this order becomes a cycle.
- `pnpm-workspace.yaml`: add `plugins/*`.

## Tests and verification

- **`plugin-sdk` unit tests:**
  - Flag generation for each schema shape listed above, including collisions.
  - `--input` + flag merge precedence.
  - Envelope shape for success, invalid input and capability failure.
  - Help text contains summary, use cases and projections.
  - An empty map for policy-only definitions.
  - `defineOperation` with positional `cli.args`.
  - `--json` failures print the `ECP_*` envelope with the right exit code, not oclif's error
    JSON.
- **Authoring command tests:**
  - `ecp plugins new` creates a plugin that builds.
  - On a fixture plugin, `ecp plugins build` produces a loadable `dist/oclif.js` and a manifest
    whose commands and flags match the definition.
  - `ecp plugins check` fails after the definition changes until `build` runs again.
  - No command id in the `plugins` topic is defined twice (guards against oclif upgrades).
  - `ecp plugin build` (singular) points to `ecp plugins build`.
- **CLI integration tests** run in a hermetic oclif data directory (`ECP_DATA_DIR`,
  `ECP_CONFIG_DIR` pointing at a temp folder):
  - `ecp plugins link plugins/plugin-jsonata`, then
    `ecp jsonata transform --expression '$.a' --input fixture.json --json` returns
    `{ ok: true, data: { result: … } }`.
  - `ecp jsonata` with no plugin linked returns `ECP_PLUGINS_MISSING` and exit `3` with
    `--json`.
  - `ecp discover --json` against a mocked registry response.
  - The trust hook allows first-party packages, refuses third-party packages without `--yes`,
    and allows them with it.
- **Performance:** `ecp --help` with only bundled plugins takes under 300 ms on CI; record the
  number in the PR.

## Exit criteria

- [ ] `plugin-sdk` is published-ready (built, tested, README with the contract), including the
      plugin build library.
- [ ] `ecp plugins new|build|check` ship bundled in the CLI.
- [ ] `plugin-jsonata` and `packages/cli` contain no hand-written oclif command classes; the
      CLI's own commands are operations.
- [ ] `ecp plugins link plugins/plugin-jsonata` gives a working `ecp jsonata transform` with
      `--json`.
- [ ] `discover`, `update`, `rollback`, the not-found hook and the trust hook work and are
      tested.
- [ ] `globalRegistry` is gone; the CLI host owns the registry.
- [ ] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Risks

| Risk | Mitigation |
| --- | --- |
| A plugin's install folder gets its own copy of core | Plugins only export data; the host registers definitions into its own registry. Core is a peer dependency |
| `oclif manifest` can't see commands generated at run time | Generation depends only on the plugin's own definition, so it's deterministic at build time and the manifest captures it |
| Flag generation surprises users with odd schema shapes | Only top-level primitives become flags; everything else goes through `--input`. Revisit after Phase 6's dogfood |
