---
"@executioncontrolprotocol/protocol": patch
"@executioncontrolprotocol/engine": patch
"@executioncontrolprotocol/plugin-jsonata": minor
---

Optional JSONata transform plugin (`@executioncontrolprotocol/jsonata.transform`), first-party allowlist entry, and `examples/transform-jsonata`. Each evaluation runs in a short-lived child process (64 MiB heap) that is killed on step timeout or cancellation, so a runaway or memory-hungry expression cannot affect the host. Validation no longer reports step-contract field errors on a step whose plugin is not installed; it reports only the missing plugin.
