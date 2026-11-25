# `@executioncontrolprotocol/quickjs`

`ExpressionEngine` implementation backed by QuickJS-WASM. Host-evaluated `expression` / `script`
on graph nodes and legacy `$expr` markers run only here — never via `eval` / `new Function` in the
host process. Node expressions receive a frozen `input` object, not `(state) => …`.

**Entrypoints:** `src/index.ts`
