import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  SASProtocol,
} from "@azure/storage-blob"
import type { AzureBlobCredentials } from "./client.js"
import { SAS_PERMISSION_CHARS, type SasPermissionChar } from "./permissions.js"

export { SAS_PERMISSION_CHARS }
export type { SasPermissionChar }

/**
 * Options for minting a blob SAS URL.
 * @category Azure
 */
export interface CreateBlobSasOptions {
  /** Credentials with shared key. */
  credentials: AzureBlobCredentials
  /** Container name. */
  container: string
  /** Blob name. */
  blobName: string
  /** Permission letters (e.g. r, rw, rcw). */
  permissions: SasPermissionChar[]
  /** Lifetime in seconds. */
  expiresInSeconds: number
}

/**
 * Create a blob SAS URL (requires account key / shared key credential).
 * @category Azure
 */
export function createBlobSasUrl(options: CreateBlobSasOptions): {
  sasUrl: string
  expiresAt: string
  permissions: string
} {
  const { credentials, container, blobName, permissions, expiresInSeconds } = options
  if (!credentials.sharedKey) {
    throw new Error("SAS URL generation requires an account key (connectionString or accountKey)")
  }

  const permStr = [...new Set(permissions)].join("")
  const startsOn = new Date(Date.now() - 60_000)
  const expiresOn = new Date(Date.now() + expiresInSeconds * 1000)

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName,
      permissions: BlobSASPermissions.parse(permStr),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
    },
    credentials.sharedKey,
  ).toString()

  const blobUrl = credentials.client.getContainerClient(container).getBlobClient(blobName).url
  const sasUrl = `${blobUrl}?${sas}`

  return {
    sasUrl,
    expiresAt: expiresOn.toISOString(),
    permissions: permStr,
  }
}
