---
"@executioncontrolprotocol/adobe-firefly-services": minor
"@executioncontrolprotocol/anthropic": minor
"@executioncontrolprotocol/azure-blob-storage": minor
"@executioncontrolprotocol/core": minor
"@executioncontrolprotocol/jsonata": minor
"@executioncontrolprotocol/test": minor
"@executioncontrolprotocol/plugin-sdk": minor
"@executioncontrolprotocol/local": minor
"@executioncontrolprotocol/protocol": patch
"@executioncontrolprotocol/cli": minor
---

One name per plugin: a plugin's npm package name is its plugin id. The first-party plugin packages drop the `plugin-` prefix (`@executioncontrolprotocol/plugin-jsonata` is now `@executioncontrolprotocol/jsonata`); plugin and capability ids are unchanged. `ecp-plugin-manifest` fails the build when `definePlugin({ id })` differs from the package name, and the host refuses to load such a plugin. `ecp plugins install <short>` resolves first-party short names itself instead of through oclif's `plugin-` prefix rule.
