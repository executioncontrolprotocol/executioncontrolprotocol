# ECP examples

Portable v2 executions for the realignment host. Each folder has a `*.ecp.json` file with a
`$schema` line and a short README.

| Example | Plugins |
| --- | --- |
| `echo/` | `plugin-test` |
| `transform/` | bundled `plugin-core` |
| `transform-jsonata/` | `plugin-jsonata` |
| `weekly-brief/` | `plugin-anthropic` |
| `branch-loop/` | `plugin-test` |
| `dogfood-reshape/` | `plugin-test` (`$expr`) |
| `dogfood-photo/` | `plugin-azure-blob-storage` |
| `dogfood-caption/` | `plugin-anthropic` |
| `localize-banner/` | `plugin-anthropic`, `plugin-adobe-firefly-services` |

Install the plugins you need (`ecp plugins install …` or `ecp plugins link` from this repo), set
config objects and secrets, then:

```sh
ecp execute --path examples/echo/echo.ecp.json --wait
ecp app examples/localize-banner/localize-banner.ecp.json
```
