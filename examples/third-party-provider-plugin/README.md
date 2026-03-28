# Example: Third-Party Model Provider Plugin

This example shows how to build a third-party ECP model provider plugin
that can be installed, configured, and used in a Context manifest --
using **only** public types from `@executioncontrolprotocol/plugins`.

## What this demonstrates

1. **Implementing `ModelProvider`** -- the `MockProvider` class implements the
   full provider interface (generate, tool calling, token usage) without
   depending on the runtime package.

2. **Plugin manifest** -- the `ecp` field in `package.json` declares the
   plugin kind (`third-party`, provides `provider`), entry module, and
   default wiring merged into the system config on install.

3. **Register function** -- `src/register.ts` exports a `register(registry)`
   function that the dynamic loader calls at startup, registering the
   mock provider in the extension registry.

4. **Context manifest** -- `context.yaml` references the provider by its
   plugin id (`example-provider`) with `type: local`.

## Project structure

```text
examples/third-party-provider-plugin/
  package.json          # npm package with `ecp` manifest field
  tsconfig.json         # TypeScript config (ESM, Node16 resolution)
  context.yaml          # Example Context using the mock provider
  src/
    mock-provider.ts    # ModelProvider implementation (mock)
    register.ts         # Plugin entry: register(registry) function
```

## Build

```bash
cd examples/third-party-provider-plugin
npm install
npm run build
```

## Install the plugin into ECP

After building, register the plugin in your system config:

```bash
ecp config plugins add example-provider \
  --source-type local \
  --source-path "$(pwd)" \
  --plugin-kind third-party \
  --provides provider
```

Or manually add the entry to `ecp.config.yaml`:

```yaml
plugins:
  installs:
    example-provider:
      source: { type: local, path: /absolute/path/to/third-party-provider-plugin }
      path: /absolute/path/to/third-party-provider-plugin
      pluginKind: third-party
      version: "1.0.0"

security:
  plugins:
    allowSourceTypes: [builtin, local]
    allowIds: [openai, ollama, anthropic, gemini, mistral, example-provider, file, memory]
```

Then add a model provider wiring entry:

```yaml
models:
  providers:
    example-provider:
      defaultModel: mock-model-v1
      supportedModels: [mock-model-v1, mock-model-v2]
      config: {}

security:
  models:
    allowProviders: [openai, ollama, anthropic, gemini, mistral, example-provider]
    allowedModels:
      example-provider: [mock-model-v1, mock-model-v2]
```

## Run

```bash
ecp run context.yaml --provider example-provider -i topic="Hello world"
```

## Key design points

- **Zero runtime imports**: the plugin depends only on
  `@executioncontrolprotocol/plugins` (published types package), not on
  `@executioncontrolprotocol/runtime`. The `ExtensionRegistry` interface
  in `register.ts` is declared locally to avoid importing the runtime.

- **The `ecp` manifest** in `package.json` is the contract the CLI and
  runtime use to discover, validate, and load the plugin. The `entry.module`
  field points to the compiled ESM entry, and the `wiring` field provides
  default config that gets merged into `ecp.config.yaml` on install.

- **`kind: "third-party"` + `provides: "provider"`** tells ECP this is a
  vendor plugin that provides a model provider. The security policy must
  allow `third-party` in `allowKinds` and `local` in `allowSourceTypes`.
