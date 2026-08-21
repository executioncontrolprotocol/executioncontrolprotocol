/**
 * Host-side artifact bytes keyed by `ecp://…` URIs (invoke/run preview and hop outputs).
 * @category Runtime
 */

/** Stored host artifact (bytes + metadata). @category Runtime */
export interface CapabilityArtifact {
  /** MIME type for HTTP / browser preview. */
  readonly mediaType: string
  /** Optional display / download name. */
  readonly name?: string
  /** Size in bytes. */
  readonly size: number
  /** Artifact bytes. */
  readonly bytes: Uint8Array
}

/** Environment-scoped map of artifact URIs to bytes. @category Runtime */
export interface CapabilityArtifactStore {
  /** Look up a stored artifact. */
  get(uri: string): CapabilityArtifact | undefined
  /** Store an artifact under its URI. */
  set(uri: string, artifact: CapabilityArtifact): void
  /** Remove a URI. */
  delete(uri: string): void
  /** Drop all artifacts. */
  clear(): void
  /** Number of stored artifacts. */
  size(): number
}

/** In-memory {@link CapabilityArtifactStore}. @category Runtime */
export function createCapabilityArtifactStore(): CapabilityArtifactStore {
  const items = new Map<string, CapabilityArtifact>()
  return {
    get(uri) {
      return items.get(uri)
    },
    set(uri, artifact) {
      items.set(uri, artifact)
    },
    delete(uri) {
      items.delete(uri)
    },
    clear() {
      items.clear()
    },
    size() {
      return items.size
    },
  }
}
