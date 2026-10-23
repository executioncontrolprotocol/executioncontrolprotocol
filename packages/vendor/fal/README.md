# @executioncontrolprotocol/fal

FAL model provider extension for ECP. Invokes any FAL endpoint from workflows with env/secrets auth and standard `$ref` chaining.

## Binding

```ts
import { falExtension } from "@executioncontrolprotocol/fal"
import { environment, extension, NODE_ENVIRONMENT_ID, secrets } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "fal-demo").with([
  extension(falExtension).with({
    apiKey: secrets("fal/api-key"),
    defaultMode: "subscribe",
  }),
])
```

## Capability: `@executioncontrolprotocol/fal.generate`

**Input:** `{ endpoint?, input, mode?, logs? }` — `endpoint` can default from extension config.

**Output:** `{ data, requestId? }` — `data` holds the FAL model response (images, video URLs, etc.).

## Chaining

Reference prior step output fields with `ref()`:

```ts
step("@executioncontrolprotocol/fal.generate", "Upscale")
  .with({
    endpoint: "fal-ai/clarity-upscaler",
    input: { image_url: ref("base.data.images.0.url") },
  })
  .as("upscaled")
```
