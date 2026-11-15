# Weekly brief

Calls `anthropic.generate` with a leadership-brief prompt. Create config `anthropic/default`
with `plugin` `@executioncontrolprotocol/anthropic` and values
`{ "apiKey": { "$secret": "anthropic/api-key" }, "model": "claude-sonnet-4-5" }`, then set the
secret before running.

```sh
ecp secrets set anthropic/api-key
ecp execute --path weekly-brief.ecp.json --input '{"signals":["shipped X"]}' --wait
```
