---
"@executioncontrolprotocol/cli": minor
"@executioncontrolprotocol/host": minor
"@executioncontrolprotocol/protocol": minor
"@executioncontrolprotocol/mcp-relay": minor
---

- **@executioncontrolprotocol/cli** — `ecp retrieve`, `execute`, `commit` and `plugins` start a background host on first use and reuse it (warm commands are about 3x faster than in-process). Opt out with `--no-start-host` or `ECP_NO_START_HOST=1`; `--start-host` is removed. A failed start exits 4 with the log paths. `ecp host start --idle-minutes <n>` (`0` = never); `ecp host status` shows who started the host and when it will idle out; `ecp host reload` is an alias of `ecp host restart`.
- **@executioncontrolprotocol/host** — the supervisor stops after 15 idle minutes (`ECP_HOST_IDLE_MINUTES`), never during a run or while a watch stream is open; one supervisor per `ECP_HOME` (`supervisor.pid`).
- **@executioncontrolprotocol/protocol** — `host.json` and supervisor status gain optional `idleMinutes` and `startedBy`; health reports `lastActivityAt` and `openStreams`.
- **@executioncontrolprotocol/mcp-relay** — hosts the relay starts are marked `startedBy: "auto"`.
