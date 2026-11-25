# ECP examples

Portable v2 executions for the realignment host. Each folder has a `*.ecp.json` file with a
`$schema` line and a short README. **Transforms** (`@executioncontrolprotocol/core.transform` or
JSONata) reshape data between steps; **`expr`** on steps, branch arms, and loops is control only
(boolean gates). Step `input` binds data with `$ref` / `$state` / `$script`, not inline `$expr`.

| Example | Plugins |
| --- | --- |
| `echo/` | `plugin-test` |
| `transform/` | bundled `plugin-core` |
| `transform-jsonata/` | `plugin-jsonata` |
| `psd-artboards/` | `plugin-azure-blob-storage`, `plugin-adobe-firefly-services`, `plugin-anthropic` (agent loop: reflow a PSD into new artboards, checked structurally and by vision review) |
| `psd-artboards-renditions/` | `plugin-azure-blob-storage`, `plugin-adobe-firefly-services`, `plugin-jsonata` (deterministic: reflow a PSD into new artboards, one JPEG per artboard found by layer type) |
| `weekly-brief/` | `plugin-anthropic` |
| `branch-loop/` | `plugin-test` |
| `patterns/` | `plugin-test` (branch, parallel, while / for / forEach loops, and nested containers) |
| `dogfood-reshape/` | Core transform walkthrough |
| `dogfood-photo/` | `plugin-azure-blob-storage` |
| `dogfood-caption/` | `plugin-anthropic` |
| `localize-banner/` | `plugin-anthropic`, `plugin-adobe-firefly-services` |

Install the plugins you need (`ecp plugins install …` or `ecp plugins link` from this repo), set
config objects and secrets, then:

```sh
ecp execute --path examples/echo/echo.ecp.json --wait
ecp app examples/localize-banner/localize-banner.ecp.json
```
