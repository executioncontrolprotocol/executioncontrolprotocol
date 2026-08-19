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
