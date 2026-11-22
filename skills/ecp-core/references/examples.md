# Examples and fixtures

Transforms move data between steps (`examples/transform/`, core plugin); `expr` on steps, branch
arms, loops, and `forEach` scopes is control only (boolean gates on steps/loops; `forEach` has no node `expr`). Do not put `$expr` in step `input`.

| Path | Role |
| --- | --- |
| `examples/echo/` | Smallest v2 execution |
| `examples/transform/` | Bundled core QuickJS transform |
| `examples/transform-jsonata/` | Optional JSONata transform |
| `examples/weekly-brief/` | Multi-step example |
| `examples/localize-banner/` | A10 Firefly + Anthropic + Azure dogfood |
| `fixtures/manifests/valid/` | Must validate with zero errors |
| `fixtures/manifests/invalid/` | Each with `*.expected.json` issues |
| `fixtures/manifests/runs/` | Run fixtures (`*.run.json`) |
| `fixtures/manifests/acceptance/` | A2 `all-features` |
| `fixtures/v1/` | Hand-converted v1 → v2 fixtures |
| `test/e2e/acceptance/` | Formal A1–A12 suite |

Run echo:

```sh
ecp plugins link plugins/plugin-test --no-install
ecp execute examples/echo/echo.ecp.json --json
```
