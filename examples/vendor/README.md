# Vendor extension examples

Runnable workflows for packages in this repo. Prefer these over inventing vendor capability APIs.

Requires a core monorepo checkout (or published `@executioncontrolprotocol/node`) plus the listed packages.

| Folder | Teaches |
| ------ | ------- |
| [02-weekly-brief-with-slack](./02-weekly-brief-with-slack) | Slack send + memory / OpenAI |
| [03-fal-chain](./03-fal-chain) | `fal.generate` chain |
| [04-image-prep](./04-image-prep) | image-sharp inspect / resize (host-only; CLI or browser hop via `ecp up`) |
| [adobe-firefly-smoke](./adobe-firefly-smoke) | Adobe Firefly auth smoke |
| [azure-adobe-assets](./azure-adobe-assets) | Azure Blob upload + Firefly |
| [azure-photoshop-manifest](./azure-photoshop-manifest) | Azure Blob + Photoshop `photoshop-generate-manifest` (host `ecp up --env`) |

Core protocol / CLI examples: https://github.com/executioncontrolprotocol/executioncontrolprotocol/tree/main/examples

Prefer catalog import + `extension(id).with({…})` (and `secrets("…")` for keys) as the consumer-facing bind pattern.
