# JSONata transform example

Step-level data reshape using `@executioncontrolprotocol/jsonata.transform`. Requires the JSONata
plugin (`ecp plugins install jsonata` or `ecp plugins link plugins/plugin-jsonata` from the repo root).

No cloud credentials.

The expression is `{ "names": people.name[] }`. The trailing `[]` keeps `names` an array even when
there is only one person: JSONata returns a single match as a plain value, which would fail the
step's `returns` check.

## Run

From the repository root, with a built host and a temp `ECP_HOME`:

```sh
pnpm run build
export ECP_HOME="$(mktemp -d)"
pnpm exec ecp plugins link plugins/plugin-jsonata --no-install
pnpm exec ecp execute examples/transform-jsonata/names.ecp.json --validate --json
pnpm exec ecp execute examples/transform-jsonata/names.ecp.json --json
```

Without the plugin linked, validation reports `ECP_PLUGINS_MISSING` and suggests
`ecp plugins install jsonata`.
