# Plugin authoring (realignment)

Full contract: `.cursor/rules/extensions.mdc`. Exact API: `realignment/spec/08-plugins.md`. Legacy `defineExtension` / `capabilityFor` code is the reference for what
carries over.

## The contract

1. A plugin provides **capabilities only**: id, `accepts` and `returns` schemas (zod in source,
   exported as JSON Schema), metadata (use cases, projections), handler.
2. A plugin declares a **plain config schema**. It doesn't mark fields secret; it receives
   resolved values. Credentials never appear in `accepts`.
3. Each plugin ships **`ecp.manifest.json`**, generated at build and checked on install. The
   host builds its registry from it and imports plugin code on first call. Prefer one module per
   capability.
4. **No CLI command generation** and no per-capability MCP tools. Capabilities are reached
   through `execute`.
5. Formatters, validators, storage, secrets and auth are host services, not plugins.

## Dependencies

| May use | Must not use |
| --- | --- |
| The plugin authoring package, `zod`, focused libraries | The host, CLI, MCP relay or App packages |

## HTTP capabilities

Inputs: every known path, query, header and JSON-body field is a top-level parameter; optional
`body` carries the rest and merges as `{ ...body, ...setParameters }`. Outputs: return the
nested result document; known object primitives are dotted ports; arrays stay one port; poll
internally. Details in `.cursor/rules/extensions.mdc`.

Capabilities that take a script for a remote runtime (Photoshop UXP) accept a plain string;
executions supply it with `$script`, which the host syntax-checks and never runs.

## Provider failures

Upstream HTTP/SDK failures must throw `ECP_PROVIDER_ERROR` with the **provider's own text** in
`message` and the status/body in `details`. Status-only messages are not enough. The engine
copies those fields onto the run. Rule and examples: `.cursor/rules/extensions.mdc`
("Provider and handler failures"); contract: `realignment/spec/08-plugins.md`.

## Tests

Test the plugin on its own with fixtures, without starting a host. Tests needing a live API or
model skip cleanly without credentials. Assert provider error paths include the original text
in `message` and the response in `details`.
