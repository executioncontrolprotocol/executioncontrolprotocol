# Transform example

Minimal execution that runs the bundled **core transform** capability. It needs no cloud
credentials or extra plugins.

## Run

From the repository root, with a temp `ECP_HOME` and a built host:

```sh
pnpm run build
ECP_HOME="$(mktemp -d)" pnpm exec ecp execute examples/transform/greet.ecp.json --json
```

Validation only:

```sh
ECP_HOME="$(mktemp -d)" pnpm exec ecp execute examples/transform/greet.ecp.json --validate --json
```

The step declares its own `accepts` and `returns` JSON Schemas on the step node. The host runs the
inline JavaScript in QuickJS with `input.name` bound from the step input.
