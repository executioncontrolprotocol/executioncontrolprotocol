import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob"

/**
 * Extension config used to build a BlobServiceClient.
 * @category Azure
 */
export interface AzureBlobStorageConfig {
  /** Full Azure Storage connection string. */
  connectionString?: string
  /** Storage account name (with accountKey). */
  accountName?: string
  /** Storage account key (with accountName). */
  accountKey?: string
  /** Default container when capability input omits container. */
  defaultContainer?: string
  /** Default SAS lifetime in seconds. */
  defaultSasExpiresInSeconds?: number
}

/**
 * Resolved credentials for SAS signing (account key required for user-delegation-free SAS).
 * @category Azure
 */
export interface AzureBlobCredentials {
  /** Blob service client. */
  client: BlobServiceClient
  /** Shared key credential when available (required for SAS). */
  sharedKey?: StorageSharedKeyCredential
  /** Account name. */
  accountName: string
  /** Default container. */
  defaultContainer?: string
  /** Default SAS expiry seconds. */
  defaultSasExpiresInSeconds: number
}

/**
 * Read Azure blob config from a capability context bag.
 * @category Azure
 */
export function readAzureConfig(ctx: unknown): AzureBlobStorageConfig {
  if (!ctx || typeof ctx !== "object") return {}
  const cfg = (ctx as { extensionConfig?: unknown }).extensionConfig
  if (!cfg || typeof cfg !== "object") return {}
  return cfg as AzureBlobStorageConfig
}

/**
 * Build BlobServiceClient + shared key from extension config.
 * @category Azure
 */
export function createAzureBlobCredentials(config: AzureBlobStorageConfig): AzureBlobCredentials {
  const defaultSasExpiresInSeconds = config.defaultSasExpiresInSeconds ?? 3600

  if (config.connectionString) {
    const client = BlobServiceClient.fromConnectionString(config.connectionString)
    const accountName = client.accountName
    const accountKey = parseAccountKeyFromConnectionString(config.connectionString)
    const sharedKey =
      accountName && accountKey
        ? new StorageSharedKeyCredential(accountName, accountKey)
        : undefined
    return {
      client,
      sharedKey,
      accountName,
      defaultContainer: config.defaultContainer,
      defaultSasExpiresInSeconds,
    }
  }

  if (config.accountName && config.accountKey) {
    const sharedKey = new StorageSharedKeyCredential(config.accountName, config.accountKey)
    const client = new BlobServiceClient(
      `https://${config.accountName}.blob.core.windows.net`,
      sharedKey,
    )
    return {
      client,
      sharedKey,
      accountName: config.accountName,
      defaultContainer: config.defaultContainer,
      defaultSasExpiresInSeconds,
    }
  }

  throw new Error(
    "Azure Blob Storage requires connectionString or accountName+accountKey in extension config",
  )
}

/**
 * Parse AccountKey from an Azure Storage connection string.
 * @category Azure
 */
export function parseAccountKeyFromConnectionString(
  connectionString: string,
): string | undefined {
  const match = /AccountKey=([^;]+)/i.exec(connectionString)
  return match?.[1]
}

/**
 * Resolve container name from input or defaults.
 * @category Azure
 */
export function resolveContainer(
  credentials: AzureBlobCredentials,
  container: string | undefined,
): string {
  const name = container ?? credentials.defaultContainer
  if (!name) {
    throw new Error("Azure container is required (input.container or config.defaultContainer)")
  }
  return name
}
