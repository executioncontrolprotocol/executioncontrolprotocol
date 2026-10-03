# @executioncontrolprotocol/azure-blob-storage

Azure Blob Storage extension for ECP. Upload binaries, mint HTTPS SAS URLs, and download blobs — designed to feed allow-listed asset URLs into [`@executioncontrolprotocol/adobe-firefly-services`](../adobe-firefly-services/) (Firefly `referenceBlobs`, Photoshop `source.url` / write destinations).

## Binding

```ts
import "@executioncontrolprotocol/azure-blob-storage"
import { environment, extension, secrets } from "@executioncontrolprotocol/node"

export default environment("azure-demo")
  .withExtensions([
    extension("@executioncontrolprotocol/secrets").with({}),
    extension("@executioncontrolprotocol/azure-blob-storage").with({
      connectionString: secrets("azure-blob-storage/connection-string"),
      // or:
      // accountName: secrets("azure-blob-storage/account-name"),
      // accountKey: secrets("azure-blob-storage/account-key"),
      defaultContainer: "artifacts",
      defaultSasExpiresInSeconds: 3600,
    }),
  ])
```

## Capabilities

| Id | Execution | Purpose |
| -- | --------- | ------- |
| `@executioncontrolprotocol/azure-blob-storage.upload` | mixed | Put bytes (`contentBase64` \| `sourceUrl` \| `filePath` \| `source`); optional `createReadSas` |
| `@executioncontrolprotocol/azure-blob-storage.create-sas-url` | host | Mint read/write SAS (`permissions: ["r"]` or `["r","c","w"]` for Photoshop destinations) |
| `@executioncontrolprotocol/azure-blob-storage.download` | host | Fetch blob bytes into an artifact `FileRef` via `writeMediaArtifact` |

`upload` is **mixed**: the browser handler reads a stashed `File` (`ecp://browser/<id>`), hops `create-sas-url` to `ecp up`, then `PUT`s from the tab. Node `filePath` / `sourceUrl` / `contentBase64` resolve through core `resolveFile`. `create-sas-url` and `download` stay **host** so the account key never leaves the daemon.

Browser PUT requires container CORS for the demo origin (`PUT`, expose `ETag`, allow `x-ms-blob-type` and `Content-Type`).

The Azure SDK stays on the **Node** graph. Web bundlers load `exports["."].browser` (mixed `upload` + catalog for host SAS/download) with no `@azure/storage-blob` or `node:fs`. Import the package root only:

```ts
import "@executioncontrolprotocol/azure-blob-storage"
```

```json
".": {
  "types": "./dist/index.d.ts",
  "browser": "./dist/index.browser.js",
  "node": "./dist/index.js",
  "import": "./dist/index.js"
}
```

## Adobe Firefly

See [`examples/azure-adobe-assets/`](../../examples/azure-adobe-assets/) — upload a reference image, then call Image5 generate with `referenceBlobs[0].source.url: ref("upload.sasUrl")`.
