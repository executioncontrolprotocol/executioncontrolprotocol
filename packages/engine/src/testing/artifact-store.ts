import type { ArtifactFileRef, ArtifactStat, ArtifactStore } from "@executioncontrolprotocol/protocol"
import {
  IMPLEMENTATION_IDS,
  artifactUri,
  assertSafeArtifactName,
  assertSafeRunId,
} from "@executioncontrolprotocol/protocol"

function check(runId: string, name: string): void {
  assertSafeRunId(runId)
  assertSafeArtifactName(name)
}

/**
 * In-memory {@link ArtifactStore} for engine and file-service tests.
 * @category Environment
 */
export class MemoryArtifactStore implements ArtifactStore {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.memoryArtifactStore

  private readonly blobs = new Map<string, Map<string, { bytes: Uint8Array; mediaType?: string }>>()

  /** No-op. */
  async start(): Promise<void> {}

  /** No-op. */
  async stop(): Promise<void> {}

  /** {@inheritDoc ArtifactStore.uri} */
  uri(runId: string, name: string): string {
    return artifactUri(runId, name)
  }

  /** {@inheritDoc ArtifactStore.put} */
  async put(
    runId: string,
    name: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options?: { mediaType?: string },
  ): Promise<ArtifactFileRef> {
    check(runId, name)
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer())
    let run = this.blobs.get(runId)
    if (!run) {
      run = new Map()
      this.blobs.set(runId, run)
    }
    run.set(name, { bytes, mediaType: options?.mediaType })
    return {
      kind: "artifact",
      uri: this.uri(runId, name),
      mediaType: options?.mediaType,
      name,
      sizeBytes: bytes.byteLength,
    }
  }

  /** {@inheritDoc ArtifactStore.getBytes} */
  async getBytes(runId: string, name: string): Promise<Uint8Array> {
    check(runId, name)
    const item = this.blobs.get(runId)?.get(name)
    if (!item) throw Object.assign(new Error(`Artifact ${name} was not found.`), { code: "ECP_NOT_FOUND" })
    return item.bytes
  }

  /** {@inheritDoc ArtifactStore.getStream} */
  async getStream(runId: string, name: string): Promise<ReadableStream<Uint8Array>> {
    const bytes = await this.getBytes(runId, name)
    return new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
  }

  /** {@inheritDoc ArtifactStore.stat} */
  async stat(runId: string, name: string): Promise<ArtifactStat | undefined> {
    check(runId, name)
    const item = this.blobs.get(runId)?.get(name)
    if (!item) return undefined
    return { name, sizeBytes: item.bytes.byteLength, mediaType: item.mediaType }
  }

  /** {@inheritDoc ArtifactStore.list} */
  async list(runId: string): Promise<ArtifactStat[]> {
    const run = this.blobs.get(runId)
    if (!run) return []
    return [...run.entries()].map(([name, item]) => ({
      name,
      sizeBytes: item.bytes.byteLength,
      mediaType: item.mediaType,
    }))
  }

  /** {@inheritDoc ArtifactStore.deleteRun} */
  async deleteRun(runId: string): Promise<void> {
    this.blobs.delete(runId)
  }
}