# Local `ecp up` host for this demo

Owned by the browser demo app. Sharp and other native steps run on a local host (`ecp up`), not in the Vite bundle.

Binds Node-only capabilities the demo also binds so pairing passes host-compat:

| Extension | Why |
| --------- | --- |
| `@executioncontrolprotocol/image-sharp` | Sharp steps hop from the browser |
| `@executioncontrolprotocol/fal` | FAL generate hops from the browser |
| `@executioncontrolprotocol/jsonata` | JSONata transform (local; also bound for Node runs) |
| `@executioncontrolprotocol/openai` | OpenAI generate/evaluate hops from the browser |
| `@executioncontrolprotocol/anthropic` | Anthropic generate (local; vault or host env key) |

`ecp up` always adds Ollama + storage on top of `--env` (model picker / coding harness).

Optional secrets from the host process env: `FAL_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

## Start from the monorepo root

Build once, then use two terminals:

```sh
# Terminal 1 — Vite app
pnpm run build
pnpm run dev:demo

# Terminal 2 — host daemon (this env + Ollama), opens http://localhost:5173/?token=…
pnpm run up:demo
```

Ollama-only (no Sharp/fal/OpenAI host bindings):

```sh
pnpm run up:demo -- --ollama-only
```

Equivalent without the helper script (path must resolve; prefer absolute when using `pnpm --filter … exec`):

```sh
# From apps/browser-demo (global or linked CLI)
ecp up --env ./host/environment.ts --open-url http://localhost:5173/

# From monorepo root
pnpm run up:demo
```

See the [browser-demo README](../README.md#local-startup-options) for the full matrix (Chrome AI vs Ollama vs host hops).

Vendor Sharp-only smoke: [`examples/vendor/04-image-prep`](../../../examples/vendor/04-image-prep).
