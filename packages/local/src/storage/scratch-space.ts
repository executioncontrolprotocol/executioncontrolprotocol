import { createHash } from "node:crypto"
import { createWriteStream } from "node:fs"
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { setTimeout as delay } from "node:timers/promises"
import type { ServiceContext } from "@executioncontrolprotocol/engine"
import type { ScratchSpace } from "@executioncontrolprotocol/protocol"
import {
  IMPLEMENTATION_IDS,
  assertSafeArtifactName,
  assertSafeRunId,
  isSafeArtifactName,
  toSafeArtifactName,
} from "@executioncontrolprotocol/protocol"
import { HomePaths } from "./paths.js"

const REMOVE_BACKOFF_MS = [20, 40, 80, 160, 320] as const

function scratchDirName(stepId: string): string {
  if (isSafeArtifactName(stepId)) return stepId
  const hash = createHash("sha256").update(stepId).digest("hex").slice(0, 10)
  return `${toSafeArtifactName(stepId, "step").slice(0, 80)}-${hash}`
}

/**
 * Disk-backed {@link ScratchSpace} under `runs/<runId>/tmp/<stepId>/`.
 * @category Storage
 */
export class LocalScratchSpace implements ScratchSpace {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.localScratchSpace

  private readonly paths: HomePaths

  /**
   * @param ctx Service context from the environment.
   */
  constructor(ctx: ServiceContext) {
    this.paths = new HomePaths(ctx.settings.home)
  }

  /** Ensure runs root exists. */
  async start(): Promise<void> {
    await mkdir(this.paths.runsDir(), { recursive: true })
  }

  /** No-op. */
  async stop(): Promise<void> {}

  /**
   * Scratch directory for one step. Step ids can carry characters that aren't safe in a path (nested calls are
   * `call>plugin/capability`), so anything other than a plain segment is mapped to a sanitized name plus a hash.
   */
  stepDir(runId: string, stepId: string): string {
    assertSafeRunId(runId)
    return path.join(this.paths.runDir(runId), "tmp", scratchDirName(stepId))
  }

  private async target(runId: string, stepId: string, name: string): Promise<string> {
    assertSafeArtifactName(name)
    const dir = this.stepDir(runId, stepId)
    await mkdir(dir, { recursive: true })
    return path.join(dir, name)
  }

  /** {@inheritDoc ScratchSpace.writeBytes} */
  async writeBytes(runId: string, stepId: string, name: string, bytes: Uint8Array): Promise<string> {
    const target = await this.target(runId, stepId, name)
    await writeFile(target, bytes)
    return target
  }

  /** {@inheritDoc ScratchSpace.writeStream} */
  async writeStream(runId: string, stepId: string, name: string, body: ReadableStream<Uint8Array>): Promise<string> {
    const target = await this.target(runId, stepId, name)
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>), createWriteStream(target))
    return target
  }

  /** {@inheritDoc ScratchSpace.copyFromPath} */
  async copyFromPath(runId: string, stepId: string, sourcePath: string, name: string): Promise<string> {
    const target = await this.target(runId, stepId, name)
    await copyFile(sourcePath, target)
    return target
  }

  /** {@inheritDoc ScratchSpace.releaseStep} Retries briefly: Windows can hold a just-closed file. */
  async releaseStep(runId: string, stepId: string): Promise<void> {
    const dir = this.stepDir(runId, stepId)
    if (!(await stat(dir).catch(() => undefined))) return
    let last: unknown
    for (let attempt = 0; attempt <= REMOVE_BACKOFF_MS.length; attempt++) {
      try {
        await rm(dir, { recursive: true, force: true })
        return
      } catch (error) {
        last = error
        const code = (error as NodeJS.ErrnoException).code
        if (code !== "EPERM" && code !== "EBUSY" && code !== "ENOTEMPTY") throw error
        if (attempt >= REMOVE_BACKOFF_MS.length) break
        await delay(REMOVE_BACKOFF_MS[attempt]!)
      }
    }
    throw last
  }
}
