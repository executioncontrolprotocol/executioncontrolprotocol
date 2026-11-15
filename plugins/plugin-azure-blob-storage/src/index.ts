import { capability, definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import {
  azureBlobConfigSchema,
  downloadAcceptsSchema,
  downloadReturnsSchema,
  sasAcceptsSchema,
  sasReturnsSchema,
  uploadAcceptsSchema,
  uploadReturnsSchema,
} from "./schemas.js"

export {
  artifactRefSchema,
  azureBlobConfigSchema,
  DEFAULT_SAS_EXPIRES_IN_SECONDS,
  DEFAULT_SAS_PERMISSIONS,
  downloadAcceptsSchema,
  downloadReturnsSchema,
  fileRefSchema,
  sasAcceptsSchema,
  sasReturnsSchema,
  uploadAcceptsSchema,
  uploadReturnsSchema,
} from "./schemas.js"
export type {
  AzureBlobConfig,
  DownloadInput,
  DownloadOutput,
  SasInput,
  SasOutput,
  UploadInput,
  UploadOutput,
} from "./schemas.js"

/**
 * Upload capability definition.
 * @category Plugins
 */
export const upload = capability({
  summary: "Upload a file to Azure Blob Storage.",
  description:
    "Reads a file ref (local path, URL or run artifact) and stores it as a block blob, overwriting any blob with the same name. Without `blobName` a random UUID is used; without `container` the config's defaultContainer is used. Set `createReadSas` to also get a one-hour read-only signed URL, which needs an account key in the config. Use `sas` for other permissions or lifetimes.",
  useCases: [
    "Persist generated media or reports so later steps or people can fetch them",
    "Hand a file to an external service that only accepts URLs (with `createReadSas`)",
  ],
  projections: [
    "Take `blobName` and `container` to address the blob later; `sasUrl` is the shareable link when requested; `blobUrl` works only for public containers",
  ],
  accepts: uploadAcceptsSchema,
  returns: uploadReturnsSchema,
  handler: () => import("./capabilities/upload.js"),
})

/**
 * Download capability definition.
 * @category Plugins
 */
export const download = capability({
  summary: "Download a blob into a run artifact.",
  description:
    "Fetches one blob into memory and writes it as a run artifact named after the last segment of the blob name, with the blob's Content-Type. Missing blobs fail the step with ECP_PROVIDER_ERROR and status 404.",
  useCases: ["Bring a stored blob into the run so later steps can read it as a file ref"],
  projections: ["Take `file` (an artifact ref) and pass it to the next step's file input"],
  accepts: downloadAcceptsSchema,
  returns: downloadReturnsSchema,
  handler: () => import("./capabilities/download.js"),
})

/**
 * SAS capability definition.
 * @category Plugins
 */
export const sas = capability({
  summary: "Mint a signed URL for one blob.",
  description:
    "Creates a service SAS URL for an existing or future blob. Defaults to read-only for one hour; `permissions` takes the letters r, a, c, w and d. Needs an account key in the config (a connection string with AccountKey, or accountName and accountKey). The blob is not checked for existence.",
  useCases: [
    "Share a stored blob with a person or service for a limited time",
    "Give an external service a write URL (`cw`) to upload a result directly",
  ],
  projections: ["Take `sasUrl` as the link; `expiresOn` says when it stops working"],
  accepts: sasAcceptsSchema,
  returns: sasReturnsSchema,
  handler: () => import("./capabilities/sas.js"),
})

/**
 * Azure Blob Storage plugin: upload, download and SAS URLs.
 * @category Plugins
 */
export default definePlugin({
  id: "@executioncontrolprotocol/azure-blob-storage",
  summary: "Upload, download and mint SAS URLs for Azure Blob Storage.",
  description:
    "Blob storage for executions that persist media, share time-limited links or bring stored objects into a run as artifacts. The config object holds either a connection string or an account name and key (as secret references), plus an optional default container. Node hosts only.",
  config: azureBlobConfigSchema,
  capabilities: {
    upload,
    download,
    sas,
  },
})
