# Phase 4 — Host server and supervisor

**Goal:** the host runs as a server with the localhost HTTP API and auth, and the supervisor
keeps it warm, restarts it on plugin changes and crashes, and drains runs safely.

**Depends on:** Phase 3. **Spec:** 09, 06 (HTTP mapping), 04 (interruption).

## Tasks

1. **`HttpApiEndpoint`** (`host`): `node:http` server on `127.0.0.1`; routes of 09 incl. `/v1/file` and `/v1/watch` (SSE with heartbeats, filters `types`, `runId`, `path`); body limit; envelope and status mapping from the `protocol` error catalogue; request ids; access log line per request (no bodies).
2. **`LocalTokenAuth`:** bearer token, constant-time compare; `Host` and `Origin` checks; health route unauthenticated with minimal fields.
3. **Admin routes:** drain (stop new runs with 503 + `retryAfterMs`, wait, mark interrupted), shutdown.
4. **Host entry** `dist/main.js`: env parsing (`ECP_HOME`, `ECP_HOST_PORT`, `ECP_HOST_TOKEN`), `createLocalHost({ mode: "server" })`, signal handling, exit codes (0 clean, 70 `EADDRINUSE`, 1 crash).
5. **Supervisor entry** `dist/supervisor.js`: ports, token, `host.json` (atomic, 0600), spawn host with env, health wait, control server (`/status`, `/restart`, `/stop`), marker watch with debounce, restart protocol, crash backoff and give-up rule, logs with rotation.
6. **`host` client helpers** (exported for CLI and relay tests; the relay re-implements its tiny client to keep its dependency list minimal): `readHostJson`, `checkHealth`, `HostClient` (typed `retrieve/execute/commit` over HTTP).

## Tests

- HTTP: each route happy path; 401 without token, wrong token, bad `Host`, foreign `Origin`; 413 body; 404 unknown route; envelope status codes per catalogue; SSE delivers run events in `seq` order and storage changes; heartbeats; `/v1/file` refuses non-`.ecp.json` and paths outside the execution's script references.
- Drain: active `delay` run completes before restart; with `force` it becomes `interrupted`; new `execute` during drain gets 503 with `retryAfterMs`; `retrieve` still works during drain.
- Supervisor (E2E-style, spawned processes, temp `ECP_HOME`): start writes `host.json` with 0600 (POSIX) and both pids; second start is a no-op; marker touch → restart on the same port and token; crash (kill host) → restart with backoff; crash loop → gives up with `failed` status; stop removes `host.json` and both processes exit; `EADDRINUSE` on start → new port.
- Security: token never in argv (`ps`/`Get-Process` command lines checked in the E2E test), never in logs.

## Exit criteria

- [x] Host server and supervisor pass their suites on Ubuntu and Windows.
  Evidence: `packages/host/test/http.test.ts`, `auth.test.ts`, `watch.test.ts`; `test/e2e/supervisor.test.ts`; `pnpm exec vitest run --project unit packages/host/test` and `--project e2e`.
- [x] A6's supervisor half (restart on plugin change, interrupted + resume via HTTP) passes.
  Evidence: e2e marker restart; HTTP force-drain + resume after host restart in `http.test.ts`.
- [x] Coverage floors met for `host`.
  Evidence: `pnpm run test:coverage` green; host library code included (process entries covered by e2e).
