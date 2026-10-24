# `@executioncontrolprotocol/plugin-app`

JIT CLI plugin behind `ecp app`. Serves `@executioncontrolprotocol/app`'s prebuilt
`dist/web` bundle on loopback and backs `HostAdapter` with the process host from
`getHost()`.

```sh
ecp plugins link plugins/plugin-app
ecp app examples/01-echo/workflow.ecp.ts
ecp app brief.ecp.ts --no-open --port 0
```

The server binds `127.0.0.1` on a free port. A pairing token goes in the URL;
every request requires it (query, `Authorization: Bearer`, or cookie). Runs use
the same host and journal as `ecp run`. The App stores no secrets and makes no
model calls.

Until `0.50.0` is on the registry, install from the workspace with
`ecp plugins link plugins/plugin-app`. CLI `oclif.jitPlugins` pins `"^0.50"`.
First-use JIT from npm waits on the 0.50.0 publish. There is no hosted demo and no `ecp up`.

This package depends on `plugin-sdk`, `node`, and `app` (`dist/web` only). It
does not depend on `cli` (JIT cycle) or `mcp`.
