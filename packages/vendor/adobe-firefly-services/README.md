# @executioncontrolprotocol/adobe-firefly-services

Adobe Firefly Services extension for ECP. One package exposes **family-prefixed** capabilities generated from vendored OpenAPI specs (Photoshop **v2** only).

Auth uses current [OAuth Server-to-Server](https://developer.adobe.com/developer-console/docs/guides/authentication/ServerToServerAuthentication/) (`client_credentials`). Bind credentials with `secrets()` / `env()` — not deprecated JWT technical accounts.

Guide index: [Firefly Services docs](https://developer.adobe.com/firefly-services/docs/guides/).

## Binding

```ts
import "@executioncontrolprotocol/adobe-firefly-services"
import { environment, extension, secrets } from "@executioncontrolprotocol/node"

export default environment("adobe-demo")
  .withExtensions([
    extension("@executioncontrolprotocol/secrets").with({}),
    extension("@executioncontrolprotocol/adobe-firefly-services").with({
      clientId: secrets("adobe-firefly-services/client-id"),
      clientSecret: secrets("adobe-firefly-services/client-secret"),
      // scopes: optional; defaults to Firefly Services S2S scopes
    }),
  ])
```

## Families

| Prefix | Spec (under `openapi/`) | Notes |
| ------ | ----------------------- | ----- |
| `firefly` | `firefly/firefly-api.json` | Generative image/video/etc. |
| `photoshop` | `photoshop/photoshopv2-api.json` | v2 only; absorbs Lightroom-style workflows |
| `express` | `express/ffs-express-api.json` | Express (beta) |
| `indesign` | `indesign/indesignapi.json` | InDesign |
| `substance3d` | `substance3d/openapi.yaml` | Substance 3D |
| `illustrator` | `illustrator/*.json` | GA + beta merged |
| `creative-production` | `creative-production/workflow-builder-api.yaml` | Workflow Builder |
| `audio-video` | `audio-video/*.json` | Audio/Video + translate/lipsync |

Capability ids: `@executioncontrolprotocol/adobe-firefly-services.<family>-<kebab-operationId>` (single segment after the package; no extra `.`)  
Examples:

- `@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async`
- `@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v5-async` (Image5)
- `@executioncontrolprotocol/adobe-firefly-services.photoshop-generate-manifest`

Browser apps import the package root; bundlers resolve `exports["."].browser` to a host-hop catalog (no IMS). Pair `ecp up --env …` for real execution.

Photoshop v1 and standalone Lightroom OpenAPI are **out of scope** (v2 supersedes them).

**Content Tagging:** no Firefly Services OpenAPI is published under AdobeDocs `ffs-*` yet — see `openapi/content-tagging/SOURCE.md`. Express tagged-document endpoints live under the `express` family.

## Asset URLs via Azure Blob Storage

Firefly and Photoshop accept allow-listed HTTPS SAS URLs (including Azure `*.windows.net`). Use [`@executioncontrolprotocol/azure-blob-storage`](../azure-blob-storage/) to upload assets and mint read/write SAS URLs, then pass them into Firefly `referenceBlobs` / Photoshop `source.url` via `ref()`. See `examples/azure-adobe-assets/`.

## Async capabilities return final results

Adobe Firefly Services APIs are often **202 async**. This package hides that from
workflows:

- **Async submit** ops always poll internally via `pollAdobeJob` and return the
  **completed** job / product payload (not `jobId` / `statusUrl` accept links).
- Optional `pollIntervalMs` / `pollTimeoutMs` tune the wait; there is no `poll` flag.
- **Status / cancel** caps remain for diagnostics; happy-path workflows should not need them.
- **Sync** caps (list/get metadata) are unchanged.

`photoshop-generate-manifest` materializes the **PSD manifest JSON** (layer tree)
after the job succeeds so you can `ref("manifest.layers.0.id")` and inspect it with
`ecp test` `runTo`.

## Capability input shape

Generated handlers merge OpenAPI path/query/header/body into:

```ts
{
  path?: { ... },
  query?: { ... },
  headers?: { ... },
  body?: { ... },
  // async-submit only:
  pollIntervalMs?: number,
  pollTimeoutMs?: number,
}
```

## Codegen

```sh
npm run fetch:specs -w @executioncontrolprotocol/adobe-firefly-services   # network
npm run generate -w @executioncontrolprotocol/adobe-firefly-services      # offline from openapi/
```

Generated sources under `src/generated/` are committed. Empty free-form OpenAPI objects fail the generator (use `openapi/overlays/`); `z.unknown` / `z.any` / untyped `z.record` are forbidden.

## Example

See [`examples/adobe-firefly-smoke/`](../../examples/adobe-firefly-smoke/) for a thin env + workflow, and [`examples/azure-adobe-assets/`](../../examples/azure-adobe-assets/) for Azure upload + Image5 recolor.
