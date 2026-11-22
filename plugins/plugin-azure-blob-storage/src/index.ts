import { capability, definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import {
  azureBlobConfigSchema,
  deleteAcceptsSchema,
  deleteReturnsSchema,
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
  deleteAcceptsSchema,
  deleteReturnsSchema,
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
  DeleteInput,
  DeleteOutput,
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
    "Reads a file ref (local path, URL or run artifact) and stores it as a block blob, overwriting any blob with the same name. Without `blobName` it picks a unique name, `ecp/<runId>/<stepId>/<name>-<8 hex>` plus the file extension; without `container` the config's defaultContainer is used. By default the returned `file` url is a one-hour read SAS (`createReadSas`, default true); set it to false for the bare blob URL on public containers. Use `sas` for other permissions or lifetimes.",
  useCases: [
    "Persist generated media or reports so later steps or people can fetch them",
    "Hand a file to an external service that only accepts URLs (bind `file` into url-only inputs)",
  ],
  projections: [
    "Bind `file` (a url FileRef) into url-only capability inputs; keep `blobName` and `container` for delete or sas",
  ],
  accepts: uploadAcceptsSchema,
  returns: uploadReturnsSchema,
  role: "publish",
  publish: { fileField: "file", locatorFields: ["blobName", "container"] },
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
  projections: ["Bind `file` (a url FileRef) into url-only inputs; `expiresOn` says when the SAS stops working"],
  accepts: sasAcceptsSchema,
  returns: sasReturnsSchema,
  handler: () => import("./capabilities/sas.js"),
})

/**
 * Delete capability definition.
 * @category Plugins
 */
export const deleteCapability = capability({
  summary: "Delete one blob from Azure Blob Storage.",
  description:
    "Removes a block blob by name. Without `container` the config's defaultContainer is used. Set `ifMissing` to `ignore` to treat a missing blob as success with `deleted: false`; the default `error` fails the step with ECP_PROVIDER_ERROR (HTTP 404 from Azure).",
  useCases: [
    "Remove temporary uploads after an external service has read them",
    "Clean up staging blobs once downstream steps no longer need them",
  ],
  projections: [
    "Check `deleted` to see whether Azure removed the blob (`false` only when `ifMissing` is `ignore` and the blob was absent)",
    "Reuse `blobName` and `container` to confirm which object was addressed",
  ],
  accepts: deleteAcceptsSchema,
  returns: deleteReturnsSchema,
  role: "unpublish",
  publish: { locatorFields: ["blobName", "container"] },
  handler: () => import("./capabilities/delete.js"),
})

/**
 * Azure Blob Storage plugin: upload, download, SAS URLs and delete.
 * @category Plugins
 */
export default definePlugin({
  id: "@executioncontrolprotocol/azure-blob-storage",
  summary: "Upload, download, delete and mint SAS URLs for Azure Blob Storage.",
  description:
    "Blob storage for executions that persist media, share time-limited links, bring stored objects into a run as artifacts, or remove blobs after use. The config object holds either a connection string or an account name and key (as secret references), plus an optional default container. Node hosts only.",
  config: azureBlobConfigSchema,
  capabilities: {
    upload,
    download,
    sas,
    delete: deleteCapability,
  },
})
