# @executioncontrolprotocol/plugins

**Execution Control Protocol (ECP)** specifies portable **Context** manifests for agent orchestration: structured inputs and outputs, tool boundaries, per-executor policies, and host-level enforcement via system config—so runs stay least-privilege and auditable.

**Learn more:** [executioncontrolprotocol.io](https://executioncontrolprotocol.io)

TypeScript types for building **ECP-compliant plugins** (model providers, executors, loggers, memory stores) and for authoring Context manifests.

This package **re-exports** [`@executioncontrolprotocol/spec`](https://www.npmjs.com/package/@executioncontrolprotocol/spec) and adds **runtime contract** types (e.g. `ModelProvider`, `MemoryStore`, `ProgressCallback`, extension registration shapes, **`SecretProvider` / `SecretBroker` / credential bindings**) without depending on the full engine.

## Install

```bash
npm install @executioncontrolprotocol/plugins
```

Peer workflow: use this package for types during development; load plugins through the ECP runtime or CLI as documented in the main project.

## Usage

```ts
import type {
  PluginReference,
  ModelProvider,
  MemoryStore,
  PluginRegistration,
  SecretProvider,
  ToolServerCredentialBinding,
} from "@executioncontrolprotocol/plugins";
```

## See also

- [executioncontrolprotocol.io](https://executioncontrolprotocol.io) — documentation and guides
- [Execution Control Protocol repository](https://github.com/executioncontrolprotocol/executioncontrolprotocol)
