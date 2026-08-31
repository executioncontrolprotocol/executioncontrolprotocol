/**
 * Locator prefix for files stashed in the browser run map.
 * @category Runtime
 */
export const BROWSER_FILE_LOCATOR_PREFIX = "ecp://browser/"

/** Browser-stashed file handle used by mixed upload handlers. @category Runtime */
export interface CapabilityBlob {
  /** Original file name when available. */
  readonly name: string
  /** MIME type. */
  readonly type: string
  /** Size in bytes. */
  readonly size: number
  /** Read file bytes. */
  arrayBuffer(): Promise<ArrayBuffer>
}

/** Run-scoped map of browser file locators to blobs. @category Runtime */
export interface CapabilityBlobStore {
  /** Look up a stashed file. */
  get(locator: string): CapabilityBlob | undefined
  /** Stash a file under a locator. */
  set(locator: string, blob: CapabilityBlob): void
  /** Remove a locator. */
  delete(locator: string): void
  /** Drop all locators. */
  clear(): void
  /** Number of stashed files. */
  size(): number
}

/**
 * Wire format for hopping browser blobs to a host invoke (transport only; not workflow state).
 * @category Runtime
 */
export interface SerializedCapabilityBlob {
  /** Original file name when available. */
  name: string
  /** MIME type. */
  type: string
  /** Size in bytes. */
  size: number
  /** File bytes as base64 (invoke hop transport). */
  dataBase64: string
}

/** Whether a string is a browser file locator. @category Runtime */
export function isBrowserFileLocator(value: string): boolean {
  return value.startsWith(BROWSER_FILE_LOCATOR_PREFIX) && value.length > BROWSER_FILE_LOCATOR_PREFIX.length
}

/** Create a unique browser file locator. @category Runtime */
export function createBrowserFileLocator(): string {
  return `${BROWSER_FILE_LOCATOR_PREFIX}${globalThis.crypto.randomUUID()}`
}

/** In-memory {@link CapabilityBlobStore}. @category Runtime */
export function createCapabilityBlobStore(): CapabilityBlobStore {
  const files = new Map<string, CapabilityBlob>()
  return {
    get(locator) {
      return files.get(locator)
    },
    set(locator, blob) {
      files.set(locator, blob)
    },
    delete(locator) {
      files.delete(locator)
    },
    clear() {
      files.clear()
    },
    size() {
      return files.size
    },
  }
}

/**
 * Stash a blob and return its locator.
 * @category Runtime
 */
export function stashCapabilityBlob(store: CapabilityBlobStore, blob: CapabilityBlob): string {
  const locator = createBrowserFileLocator()
  store.set(locator, blob)
  return locator
}

/**
 * Collect `ecp://browser/<id>` locators from an invoke/run payload.
 * Walks nested objects/arrays, including {@link FileRef} `file.path` and
 * `artifact.uri` when they hold browser locators.
 * @category Runtime
 */
export function collectBrowserLocators(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (isBrowserFileLocator(value) && !out.includes(value)) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectBrowserLocators(item, out)
    return out
  }
  if (value !== null && typeof value === "object") {
    const row = value as Record<string, unknown>
    for (const child of Object.values(row)) collectBrowserLocators(child, out)
  }
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64")
  }
  const chunk = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(dataBase64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(dataBase64, "base64"))
  }
  const binary = atob(dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Serialize selected locators for a host invoke hop (bytes travel on the wire only).
 * @category Runtime
 */
export async function serializeCapabilityBlobs(
  store: CapabilityBlobStore,
  locators: string[]
): Promise<Record<string, SerializedCapabilityBlob>> {
  const out: Record<string, SerializedCapabilityBlob> = {}
  for (const locator of locators) {
    const blob = store.get(locator)
    if (!blob) continue
    const bytes = new Uint8Array(await blob.arrayBuffer())
    out[locator] = {
      name: blob.name,
      type: blob.type,
      size: blob.size,
      dataBase64: bytesToBase64(bytes),
    }
  }
  return out
}

/**
 * Hydrate a blob store from hop transport payloads.
 * @category Runtime
 */
export function hydrateCapabilityBlobs(
  store: CapabilityBlobStore,
  serialized: Record<string, SerializedCapabilityBlob>
): void {
  for (const [locator, row] of Object.entries(serialized)) {
    if (!isBrowserFileLocator(locator)) continue
    if (typeof row?.dataBase64 !== "string") continue
    const bytes = base64ToBytes(row.dataBase64)
    const copy = bytes.slice().buffer as ArrayBuffer
    store.set(locator, {
      name: typeof row.name === "string" ? row.name : "blob",
      type: typeof row.type === "string" ? row.type : "application/octet-stream",
      size: typeof row.size === "number" ? row.size : bytes.byteLength,
      arrayBuffer: async () => copy,
    })
  }
}
