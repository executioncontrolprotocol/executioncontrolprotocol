import { randomBytes } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
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
    // Media types live beside the bytes in `.meta/` (a dot-name can never be an artifact name, so no collisions).
    const meta = this.metaPath(runId, name)
    if (options?.mediaType) {
      await mkdir(path.dirname(meta), { recursive: true })
      await writeFile(meta, JSON.stringify({ mediaType: options.mediaType }))
    } else {
      await rm(meta, { force: true })
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
    if (!info?.isFile()) return undefined
    const mediaType = await this.readMediaType(runId, name)
    return { name, sizeBytes: info.size, ...(mediaType ? { mediaType } : {}) }
  }

  /** {@inheritDoc ArtifactStore.list} */
  async list(runId: string): Promise<ArtifactStat[]> {
    assertSafeRunId(runId)
    const dir = this.paths.runArtifacts(runId)
    const names = await readdir(dir).catch(() => [] as string[])
    const out: ArtifactStat[] = []
    for (const name of names) {
      if (name.endsWith(TEMP_SUFFIX) || name.startsWith(".")) continue
      const item = await this.stat(runId, name)
      if (item) out.push(item)
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  private metaPath(runId: string, name: string): string {
    return path.join(this.paths.runArtifacts(runId), ".meta", `${name}.json`)
  }

  private async readMediaType(runId: string, name: string): Promise<string | undefined> {
    const text = await readFile(this.metaPath(runId, name), "utf8").catch(() => undefined)
    if (!text) return undefined
    try {
      const parsed = JSON.parse(text) as { mediaType?: unknown }
      return typeof parsed.mediaType === "string" ? parsed.mediaType : undefined
    } catch {
      return undefined
    }
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
