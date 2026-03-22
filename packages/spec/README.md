# `@executioncontrolprotocol/spec`

**Execution Control Protocol (ECP)** specifies portable **Context** manifests for agent orchestration: structured inputs and outputs, tool boundaries, per-executor policies, and host-level enforcement via system config—so runs stay least-privilege and auditable.

**Learn more:** [executioncontrolprotocol.io](https://executioncontrolprotocol.io)

This package provides **TypeScript types** and **JSON Schema** tooling for those Context manifests.

## Install

```bash
npm install @executioncontrolprotocol/spec
```

## What you get

- **TypeScript types** for Context manifests (ECP), including **`PluginKind`** (`provider`, `executor`, `logger`, `memory`, `tool`, …), optional **`PLUGIN_KINDS`** tuple, and the Context `plugins` block
- **JSON Schema** generation output (`dist/ecp-context.schema.json` in the package tarball)

## Links

- **Docs**: [executioncontrolprotocol.io](https://executioncontrolprotocol.io)
- **Repo**: `https://github.com/executioncontrolprotocol/executioncontrolprotocol`
- **Issues**: `https://github.com/executioncontrolprotocol/executioncontrolprotocol/issues`
