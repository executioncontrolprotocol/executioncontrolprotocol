# @executioncontrolprotocol/plugin-sdk

Turn an ECP extension or policy definition into oclif commands with **no hand-written oclif code**. The CLI's own commands use the same `defineOperation` / `toCommands` path.

## Runtime

```ts
import { toCommands, defineOperation, EcpCommand, getHost } from "@executioncontrolprotocol/plugin-sdk"

export const COMMANDS = toCommands(jsonataExtension)
```

- Capability commands: `ecp <extension> <capability>` with flags from the input schema, `--input <file|->`, and `--json`.
- Policy definitions produce no commands.
- Host operations: `defineOperation("run").withInput(...).withMetadata(...).withHandler(...).build()`.

`--json` prints `{ ok: true, data }` or `{ ok: false, error: { code, message, path, suggestions } }`. Exit codes: 0 ok, 1 failed, 2 invalid input, 3 missing plugin, 4 paused.

## Build library

Used by `ecp plugins new|build|check`:

- `scaffoldPlugin(dir, name)`
- `buildPlugin(dir)` writes generated `package.json` fields, `dist/oclif.js`, and `oclif.manifest.json`
- `checkPlugin(dir)` fails when those files are stale

Authors keep `src/index.ts` and a minimal `package.json`. Everything oclif needs is generated.

Versioning is independent via Changesets. This package is `0.51.0`. 1.0 is Later.
