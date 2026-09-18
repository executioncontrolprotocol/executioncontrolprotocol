# @executioncontrolprotocol/extension-storage

Disk-backed key-value blob storage for ECP under `~/.ecp`.

## Layout

```text
~/.ecp/
  temp/          # default media writes; wiped when ecp up starts
  artifacts/     # opt-in durable (`tier: "durable"` / writeMediaArtifact store: "durable")
  workflows/     # reserved for upcoming workflow persistence
```

Override home with `ECP_HOME` or extension config `{ home: "…" }`.

## Binding

```ts
import "@executioncontrolprotocol/extension-storage"
import { environment, extension } from "@executioncontrolprotocol/node"

export default environment("demo").withExtensions([
  extension("@executioncontrolprotocol/storage").with({}),
])
```

`ecp up` binds storage automatically and wipes `~/.ecp/temp` on start.

## Capabilities

| Id | Execution | Purpose |
| -- | --------- | ------- |
| `@executioncontrolprotocol/storage.write` | host | Write bytes/JSON under temp or durable |
| `@executioncontrolprotocol/storage.read` | host | Read by key / `ecp://storage/…` URI |

Browser imports use the `exports["."].browser` catalog; write/read hop to the host daemon.
