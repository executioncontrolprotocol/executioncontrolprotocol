# @executioncontrolprotocol/plugin-format-toon

TOON encode and decode for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install format-toon
```

Capability ids `@executioncontrolprotocol/format-toon.encode` and
`@executioncontrolprotocol/format-toon.decode` are unchanged. The plugin also registers the
`toon` format for `ecp describe --format toon` and `ecp compile --format toon`.

## Binding

```ts
import formatToonExtension from "@executioncontrolprotocol/plugin-format-toon"
import { environment, extension, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "toon-demo").with([
  extension(formatToonExtension),
])
```

Or install the plugin and let the CLI host load it.

## Capabilities

| Id | Summary |
| --- | --- |
| `@executioncontrolprotocol/format-toon.encode` | Serialize an ECP document to TOON text. |
| `@executioncontrolprotocol/format-toon.decode` | Parse TOON text into an ECP document. |

```sh
ecp format-toon encode --input payload.json --json
ecp format-toon decode --input payload.toon --json
```

No `secrets("…")` keys. No extension config.

## Authoring

This package keeps `src/` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
