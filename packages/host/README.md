# `@executioncontrolprotocol/host`

Local ECP host: `createLocalHost`, localhost HTTP API, supervisor, and process entrypoints.

**Entrypoints:** `src/index.ts` (library), `src/main.ts` / `src/supervisor.ts` (process)

Serves `/v1/*` operations and the App static bundle at `/app/`.
