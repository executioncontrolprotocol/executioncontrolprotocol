import { randomBytes } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ServiceContext } from "@executioncontrolprotocol/engine"
import type { ArtifactFileRef, ArtifactStat, ArtifactStore } from "@executioncontrolprotocol/protocol"
import {
  IMPLEMENTATION_IDS,
  artifactUri,
  assertSafeArtifactName,
  assertSafeRunId,
} from "@executioncontrolprotocol/protocol"
import { renameWithRetry } from "./atomic.js"
import { HomePaths } from "./paths.js"

const TEMP_SUFFIX = ".partial"

/**
 * Disk-backed {@link ArtifactStore} under `runs/<runId>/artifacts/`. Writes go to a temp file in the same
 * directory and are renamed into place, so readers never see a partial artifact.
 * @category Storage
 */
export class LocalArtifactStore implements ArtifactStore {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.localArtifactStore

  private readonly paths: HomePaths

  /**
   * @param ctx Service context from the environment.
   */
  constructor(ctx: ServiceContext) {
    this.paths = new HomePaths(ctx.settings.home)
  }

  /** Ensure the runs root exists. */
  async start(): Promise<void> {
    await mkdir(this.paths.runsDir(), { recursive: true })
  }

  /** No-op. */
  async stop(): Promise<void> {}

  /** {@inheritDoc ArtifactStore.uri} */
  uri(runId: string, name: string): string {
    return artifactUri(runId, name)
  }

  /** {@inheritDoc ArtifactStore.localPath} */
  localPath(runId: string, name: string): string {
    assertSafeRunId(runId)
    assertSafeArtifactName(name)
    return path.join(this.paths.runArtifacts(runId), name)
  }

  /** {@inheritDoc ArtifactStore.put} */
  async put(
    runId: string,
    name: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options?: { mediaType?: string },
  ): Promise<ArtifactFileRef> {
    const target = this.localPath(runId, name)
    await mkdir(path.dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}${TEMP_SUFFIX}`
    try {
      const source =
        body instanceof Uint8Array
          ? Readable.from([body])
          : Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>)
      await pipeline(source, createWriteStream(temp))
      await renameWithRetry(temp, target)
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
    const sizeBytes = (await stat(target)).size
    return {
      kind: "artifact",
      uri: this.uri(runId, name),
      ...(options?.mediaType ? { mediaType: options.mediaType } : {}),
      name,
      sizeBytes,
    }
  }

  /** {@inheritDoc ArtifactStore.getBytes} */
  async getBytes(runId: string, name: string): Promise<Uint8Array> {
    const file = this.localPath(runId, name)
    try {
      return new Uint8Array(await readFile(file))
    } catch (error) {
      throw notFound(error, name)
    }
  }

  /** {@inheritDoc ArtifactStore.getStream} */
  async getStream(runId: string, name: string): Promise<ReadableStream<Uint8Array>> {
    const file = this.localPath(runId, name)
    if (!(await this.stat(runId, name))) throw notFound(undefined, name)
    return Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>
  }

  /** {@inheritDoc ArtifactStore.stat} */
  async stat(runId: string, name: string): Promise<ArtifactStat | undefined> {
    const info = await stat(this.localPath(runId, name)).catch(() => undefined)
    return info?.isFile() ? { name, sizeBytes: info.size } : undefined
  }

  /** {@inheritDoc ArtifactStore.list} */
  async list(runId: string): Promise<ArtifactStat[]> {
    assertSafeRunId(runId)
    const dir = this.paths.runArtifacts(runId)
    const names = await readdir(dir).catch(() => [] as string[])
    const out: ArtifactStat[] = []
    for (const name of names) {
      if (name.endsWith(TEMP_SUFFIX)) continue
      const info = await stat(path.join(dir, name)).catch(() => undefined)
      if (info?.isFile()) out.push({ name, sizeBytes: info.size })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** {@inheritDoc ArtifactStore.deleteRun} */
  async deleteRun(runId: string): Promise<void> {
    assertSafeRunId(runId)
    await rm(this.paths.runArtifacts(runId), { recursive: true, force: true, maxRetries: 5, retryDelay: 40 })
  }
}

function notFound(cause: unknown, name: string): Error {
  return Object.assign(new Error(`Artifact ${name} was not found.`), { code: "ECP_NOT_FOUND", cause })
}
