# Azure Blob + Photoshop generate-manifest

Upload a PSD to Azure, mint a write SAS for the JSON destination, then call
`@executioncontrolprotocol/adobe-firefly-services.photoshop-generate-manifest`.
The capability **polls Adobe internally** and returns the **PSD manifest JSON**
(layer tree) as the step output under `.as("manifest")`.

## Author-time inspection

Use a test session to stop after the manifest step, inspect layer ids, then
append edit steps that `ref("manifest.layers.0.id")` (or the path that matches
your PSD):

```sh
ecp test start workflow.ts --env environment.ts -o session.json
ecp test run --to manifest --env environment.ts --session session.json
# inspect session.state.manifest, then extend the workflow with create-composite refs
```

Production `ecp run` re-executes the prefix; `ref()` resolves at runtime from
committed state.

## Prerequisites

- Azure Storage connection string (account key) and a container CORS policy that
  allows the browser demo origin for mixed upload (`PUT`, `x-ms-blob-type`,
  `Content-Type`) when pairing from the tab
- Adobe Firefly Services S2S credentials (`ADOBE_CLIENT_ID` / `ADOBE_CLIENT_SECRET`)
- Built/linked `@executioncontrolprotocol/cli` (or published) with sibling packages

## Run (CLI)

```sh
export AZURE_STORAGE_CONNECTION_STRING="..."
export ADOBE_CLIENT_ID="..."
export ADOBE_CLIENT_SECRET="..."

ecp run workflow.ts --env environment.ts
```

`sample.psd` is a tiny 1x1 RGB fixture embedded as base64 in `workflow.ts`. Swap
`contentBase64` / `filePath` for a real layered PSD before relying on manifest
layer detail.

## Mount for browser demo (`ecp up`)

```sh
ecp up --env environment.ts --open-url http://localhost:5173/
```

Pair the demo, mount the **extended** env preset (Azure + Adobe catalogs), then
author or paste a workflow that uses `azure-blob-storage.upload` (mixed) and
`photoshop-generate-manifest` (host hop).
