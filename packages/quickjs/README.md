# `@executioncontrolprotocol/quickjs`

`ExpressionEngine` implementation backed by QuickJS-WASM. Host-evaluated `expression` / `script` on
`if` nodes and transform steps run only here — never via `eval` / `new Function` in the host
process. Evaluations receive a frozen `input` object, not `(state) => …`.

**Entrypoints:** `src/index.ts`
