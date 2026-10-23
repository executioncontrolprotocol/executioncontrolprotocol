# @executioncontrolprotocol/plugin-azure-blob-storage

Azure Blob upload, SAS URLs, and download for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install azure-blob-storage
```

Capability ids are unchanged. The plugin supports any host. Browser `upload` is mixed (SAS hop, then PUT from the tab).

## Binding

```ts
import azureBlobStorageExtension from "@executioncontrolprotocol/plugin-azure-blob-storage"
import { environment, extension, secrets, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "azure-demo").with([
  extension(azureBlobStorageExtension).with({
    connectionString: secrets("azure-blob-storage/connection-string"),
    defaultContainer: "artifacts",
  }),
])
```

Or install the plugin and let the CLI host load it. Workflow files bind by id
(`extension("@executioncontrolprotocol/azure-blob-storage")`) and never import this package.

See `examples/upload.ecp.ts`. Combined Azure + Firefly examples live in `plugins/plugin-adobe-firefly-services/examples/`.

## Capabilities

| Id | Summary |
| --- | --- |
| `@executioncontrolprotocol/azure-blob-storage.upload` | Put bytes; optional `createReadSas`. |
| `@executioncontrolprotocol/azure-blob-storage.create-sas-url` | Mint a time-limited SAS URL. |
| `@executioncontrolprotocol/azure-blob-storage.download` | Fetch a blob into an artifact. |

```sh
ecp azure-blob-storage upload --help --json
```

## Config

| Field | Description |
| --- | --- |
| `connectionString` | Full Azure Storage connection string. Bind with `secrets("azure-blob-storage/connection-string")`. |
| `accountName` | Storage account name (with `accountKey`). |
| `accountKey` | Storage account key. Bind with `secrets("azure-blob-storage/account-key")`. |
| `defaultContainer` | Container when a step omits `container`. |
| `defaultSasExpiresInSeconds` | SAS lifetime (default 3600). |

## Authoring

This package keeps `src/` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
