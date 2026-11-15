# `@executioncontrolprotocol/plugin-sdk`

Authoring helpers for capability plugins: `definePlugin`, `capability`, zod → JSON Schema, and
`ecp-plugin-manifest` to write / check `ecp.manifest.json`.

**Entrypoints:** `src/index.ts`, `dist/bin/ecp-plugin-manifest.js`

Plugins depend on this package as a peer dependency and must not import the host, CLI, or App.
Reference plugin: `plugins/plugin-test`.
