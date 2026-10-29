# `@executioncontrolprotocol/plugin-app`

JIT CLI plugin behind `ecp app`. Serves `@executioncontrolprotocol/app`'s prebuilt
`dist/web` bundle on loopback and backs `HostAdapter` with the process host from
`getHost()`.

```sh
ecp plugins link plugins/plugin-app
ecp app examples/01-echo/workflow.ecp.ts
ecp app brief.ecp.ts --no-open --port 0
ecp app brief.ecp.ts --config config.ecp.ts
```

The server binds `127.0.0.1` on a free port. A pairing token goes in the URL;
every request requires it (query, `Authorization: Bearer`, or cookie). Runs use
the same host and journal as `ecp run`. `--config` is optional machine settings
(same as `ecp run`); omit it to use `~/.ecp/config/config.ecp.ts` when present,
else installed plugins. The Environment tab always shows the live process host.
The App stores no secrets and makes no model calls.

Until `0.51.0` is on the registry, install from the workspace with
`ecp plugins link plugins/plugin-app`. CLI `oclif.jitPlugins` pins `"^0.51"`.
First-use JIT from npm waits on the 0.51.0 publish. There is no hosted demo and no `ecp up`.

This package depends on `plugin-sdk`, `node`, and `app` (`dist/web` only). It
does not depend on `cli` (JIT cycle) or `mcp`.
