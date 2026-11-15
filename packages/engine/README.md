# `@executioncontrolprotocol/engine`

Executor, validation layers, operations (`retrieve` / `execute` / `commit`), and the service
container (`createEnvironment`).

**Entrypoints:** `src/index.ts`

Depends on protocol types only for I/O; storage, plugins, and expressions are injected as
services.
