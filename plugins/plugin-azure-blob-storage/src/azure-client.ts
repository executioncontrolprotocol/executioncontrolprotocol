import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  type BlockBlobClient,
} from "@azure/storage-blob"
import { codedError } from "./config.js"
import type { AzureBlobConfig } from "./schemas.js"

const SAS_CLOCK_SKEW_MS = 60_000

/**
 * Where a blob lives.
 * @category Plugins
 */
export interface BlobLocation {
  /** Container name. */
  container: string
  /** Blob name inside the container. */
  blobName: string
}

/**
 * Options for {@link uploadBytes}.
 * @category Plugins
 */
export interface UploadBytesOptions extends BlobLocation {
  /** Blob contents. */
  bytes: Uint8Array
  /** Value stored as the blob's Content-Type. */
  contentType: string
  /** Aborts the upload. */
  signal?: AbortSignal
}

/**
 * Options for {@link downloadBytes}.
 * @category Plugins
 */
export interface DownloadBytesOptions extends BlobLocation {
  /** Aborts the download. */
  signal?: AbortSignal
}

/**
 * Options for {@link createSas}.
 * @category Plugins
 */
export interface CreateSasOptions extends BlobLocation {
  /** Permission letters, for example `r` or `rw`. */
  permissions: string
  /** Lifetime from now, in seconds. */
  expiresInSeconds: number
}

/**
 * Bytes and Content-Type of a downloaded blob.
 * @category Plugins
 */
export interface DownloadedBlob {
  /** Blob contents. */
  bytes: Uint8Array
  /** Content-Type stored on the blob, when set. */
  contentType?: string
}

/**
 * A signed blob URL and when it stops working.
 * @category Plugins
 */
export interface BlobSas {
  /** Blob URL with the SAS query string. */
  sasUrl: string
  /** ISO 8601 expiry time. */
  expiresOn: string
}

/**
 * Build a service client from a connection string, or from an account name and key.
 * @category Plugins
 */
export function createServiceClient(config: AzureBlobConfig): BlobServiceClient {
  if ("connectionString" in config) {
    return BlobServiceClient.fromConnectionString(config.connectionString)
  }
  const credential = new StorageSharedKeyCredential(config.accountName, config.accountKey)
  return new BlobServiceClient(`https://${config.accountName}.blob.core.windows.net`, credential)
}

function blockBlob(config: AzureBlobConfig, location: BlobLocation): BlockBlobClient {
  return createServiceClient(config).getContainerClient(location.container).getBlockBlobClient(location.blobName)
}

function mapAzureError(error: unknown, location: BlobLocation): unknown {
  if (error && typeof error === "object" && typeof (error as { statusCode?: unknown }).statusCode === "number") {
    const { statusCode, code, message } = error as { statusCode: number; code?: string; message?: string }
    return codedError(
      "ECP_PROVIDER_ERROR",
      `Azure Blob Storage returned HTTP ${statusCode} for ${location.container}/${location.blobName}.`,
      { status: statusCode, azureCode: code, message },
    )
  }
  return error
}

/**
 * Upload bytes as a block blob, overwriting any existing blob.
 * @category Plugins
 */
export async function uploadBytes(config: AzureBlobConfig, options: UploadBytesOptions): Promise<{ blobUrl: string }> {
  const blob = blockBlob(config, options)
  try {
    await blob.uploadData(options.bytes, {
      blobHTTPHeaders: { blobContentType: options.contentType },
      abortSignal: options.signal,
    })
  } catch (error) {
    throw mapAzureError(error, options)
  }
  return { blobUrl: blob.url }
}

/**
 * Download a whole blob into memory.
 * @category Plugins
 */
export async function downloadBytes(config: AzureBlobConfig, options: DownloadBytesOptions): Promise<DownloadedBlob> {
  const blob = blockBlob(config, options)
  try {
    const response = await blob.download(0, undefined, { abortSignal: options.signal })
    const body = response.readableStreamBody
    if (!body) {
      throw codedError("ECP_PROVIDER_ERROR", `Azure returned no body for ${options.container}/${options.blobName}.`)
    }
    const chunks: Buffer[] = []
    for await (const chunk of body) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer))
    }
    return {
      bytes: new Uint8Array(Buffer.concat(chunks)),
      ...(response.contentType === undefined ? {} : { contentType: response.contentType }),
    }
  } catch (error) {
    throw mapAzureError(error, options)
  }
}

/**
 * Mint a service SAS URL for one blob. Needs an account key (in the connection string or config).
 * @category Plugins
 */
export async function createSas(config: AzureBlobConfig, options: CreateSasOptions): Promise<BlobSas> {
  const blob = blockBlob(config, options)
  if (!(blob.credential instanceof StorageSharedKeyCredential)) {
    throw codedError(
      "ECP_CONFIG_INVALID",
      "Minting a SAS URL needs an account key: use a connection string with AccountKey, or accountName and accountKey.",
    )
  }
  const now = Date.now()
  const expiresOn = new Date(now + options.expiresInSeconds * 1000)
  const sasUrl = await blob.generateSasUrl({
    permissions: BlobSASPermissions.parse(options.permissions),
    startsOn: new Date(now - SAS_CLOCK_SKEW_MS),
    expiresOn,
    protocol: blob.url.startsWith("https:") ? SASProtocol.Https : SASProtocol.HttpsAndHttp,
  })
  return { sasUrl, expiresOn: expiresOn.toISOString() }
}
