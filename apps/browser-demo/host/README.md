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

`ecp up` always adds Ollama on top of `--env` (model picker / coding harness).

Optional secrets from the host process env: `FAL_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

```sh
pnpm run link:host
npx ecp up --env host/environment.ts --open-url http://127.0.0.1:5173/
```

Vendor Sharp-only smoke lives in [extensions/examples/04-image-prep](https://github.com/executioncontrolprotocol/extensions/tree/main/examples/04-image-prep).
