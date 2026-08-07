# @executioncontrolprotocol/format-eql

ECP format extension for **EQL** (ECP Query Language): keyword-driven text for `@executioncontrolprotocol.workflow` and `@executioncontrolprotocol.patch` documents.

## Capabilities

| Capability                                    | Description                                                   |
| --------------------------------------------- | ------------------------------------------------------------- |
| `@executioncontrolprotocol/format-eql.encode` | Workflow, patch, environment, or describe document → EQL text |
| `@executioncontrolprotocol/format-eql.decode` | EQL text → workflow, patch, environment, or describe document |

Input/output types use generic `EncodeCapabilityInput` / `DecodeCapabilityInput` from `@executioncontrolprotocol/types`, with options `EcpFormatOptions & EqlFormatOptions`.

## Options

| Option        | Default                  | Description                         |
| ------------- | ------------------------ | ----------------------------------- |
| `headers`     | `true` / `"auto"`        | ECP header line emit or detection   |
| `preserveIds` | `true`                   | Reserved for future use             |
| `quote`       | `"auto"`                 | String literal quoting mode         |
| `indent`      | `2`                      | Spaces per indentation level        |

## v1 scope

- Linear workflows (`STEP` lists only)
- Patch verbs: `UPDATE`, `ADD`, `DELETE`, `MOVE` with `WITH`, `LABEL`, `AS`, `MODE`
- Environment manifests (`ENVIRONMENT`, `RUNTIME`, `EXTENSION`, `POLICY`)
- Environment describe (`CAPABILITY`, `POLICY`, `WITH name:type`, `OUT name:type`)
- `REF` / `STATE` in workflow `WITH` clauses; basic `WHEN field == value`
- Line/column diagnostics on parse errors

**Not in v1:** `PARALLEL` / `BRANCH` / `LOOP`, `@executioncontrolprotocol.environment.search`, harness wiring.

## Usage

Register the extension (tests or apps only— not part of core formats):

```ts
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"

await registerFormatEqlExtension()
```

```ts
const encoded = await ecp
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-eql")
  .with({ options: { headers: false } })
  .process()

const decoded = await ecp
  .decode(encoded.result)
  .uses("@executioncontrolprotocol/format-eql")
  .to("@executioncontrolprotocol.workflow")
  .with({ options: { headers: false } })
  .process()
```

## Tests

```bash
npm run test:unit -- packages/extensions/format-eql/test
```

Coverage threshold (≥90% lines/statements) applies to `packages/extensions/format-eql/src/**`.

See [docs/format-eql.md](../../docs/format-eql.md) for the full language spec.
