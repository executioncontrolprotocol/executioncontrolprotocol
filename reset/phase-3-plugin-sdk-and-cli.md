# Phase 3 — Plugin SDK and CLI

> Status: Planned · Branch: `feat/phase-3-plugin-sdk-and-cli` · Depends on: Phase 2 ·
> Plan: §4.2, §4.5, §6

## Goal

Rebuild the `ecp` CLI as a thin oclif host with plugin management, and ship
`@executioncontrolprotocol/plugin-sdk` so that one extension definition becomes CLI commands
with no hand-written command code. Prove it end to end with `plugin-jsonata`.

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

```ts
export function toCommands(definition: ExtensionDefinition | PolicyDefinition): Record<string, Command.Class>
export function getHost(config: Config): EcpHost        // the CLI's environment, registry and output
export type EcpHost = { ecp: Ecp; registry: Registry; environmentId: string; output: OutputMode }
```

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

### 4. Core commands

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
`invoke`, `compile`, `config`, `discover`, `update`, `rollback`, `plugins`, `mcp`, `app`,
`help`). A plugin whose topic collides fails `plugin-sdk`'s build check.

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
- Add `src/oclif.ts` (`export const COMMANDS = toCommands(extension)`).
- Add `package.json` fields: `exports`, `ecp.extension`, `oclif.commands` (explicit strategy),
  `oclif.topics`, `keywords: ["ecosystem:ecp-plugin", "oclif-plugin"]`.
- Run `oclif manifest` at build.
- `pnpm-workspace.yaml`: add `plugins/*`.

## Tests and verification

- **`plugin-sdk` unit tests:**
  - Flag generation for each schema shape listed above, including collisions.
  - `--input` + flag merge precedence.
  - Envelope shape for success, invalid input and capability failure.
  - Help text contains summary, use cases and projections.
  - An empty map for policy-only definitions.
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

- [ ] `plugin-sdk` is published-ready (built, tested, README with the contract).
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
