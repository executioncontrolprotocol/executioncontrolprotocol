# `@executioncontrolprotocol/runtime`

**Execution Control Protocol (ECP)** specifies portable **Context** manifests for agent orchestration: structured inputs and outputs, tool boundaries, per-executor policies, and host-level enforcement via system config—so runs stay least-privilege and auditable.

**Learn more:** [executioncontrolprotocol.io](https://executioncontrolprotocol.io)

This package is the **runtime engine** that loads, validates, and executes Context manifests.

## Plugin kinds

Context manifests use **`PluginReference.kind`**: `provider`, `executor`, `logger`, `memory`, and future values. The runtime registry maps these to implementations: model providers (`registerModelProvider` with `kind: "provider"`), executors, and auxiliary plugins such as loggers and memory (`registerPlugin` with `kind: "logger"` \| `"memory"`). Built-in file logging is registered via `registerBuiltinLoggers`.

## Install

```bash
npm install @executioncontrolprotocol/runtime
```

## Links

- **Docs**: [executioncontrolprotocol.io](https://executioncontrolprotocol.io)
- **Repo**: `https://github.com/executioncontrolprotocol/executioncontrolprotocol`
- **Issues**: `https://github.com/executioncontrolprotocol/executioncontrolprotocol/issues`
