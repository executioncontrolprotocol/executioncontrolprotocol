import type { ScratchSpace } from "@executioncontrolprotocol/protocol"
import { assertSafeArtifactName, assertSafeRunId } from "@executioncontrolprotocol/protocol"

/**
 * In-memory {@link ScratchSpace} for file-service tests. Returned paths are `memory://` labels, not readable files;
 * {@link MemoryScratchSpace.read} returns what was written.
 * @category Environment
 */
export class MemoryScratchSpace implements ScratchSpace {
  private readonly dirs = new Map<string, Map<string, Map<string, Uint8Array>>>()

  /** No-op. */
  async start(): Promise<void> {}

  /** No-op. */
  async stop(): Promise<void> {}

  /** {@inheritDoc ScratchSpace.writeBytes} */
  async writeBytes(runId: string, stepId: string, name: string, bytes: Uint8Array): Promise<string> {
    assertSafeRunId(runId)
    assertSafeArtifactName(name)
    let run = this.dirs.get(runId)
    if (!run) {
      run = new Map()
      this.dirs.set(runId, run)
    }
    let step = run.get(stepId)
    if (!step) {
      step = new Map()
      run.set(stepId, step)
    }
    step.set(name, bytes)
    return `memory://${runId}/${stepId}/${name}`
  }

  /** {@inheritDoc ScratchSpace.writeStream} */
  async writeStream(runId: string, stepId: string, name: string, body: ReadableStream<Uint8Array>): Promise<string> {
    return this.writeBytes(runId, stepId, name, new Uint8Array(await new Response(body).arrayBuffer()))
  }

  /** {@inheritDoc ScratchSpace.copyFromPath} Memory scratch can't read disk; records an empty copy. */
  async copyFromPath(runId: string, stepId: string, _sourcePath: string, name: string): Promise<string> {
    return this.writeBytes(runId, stepId, name, new Uint8Array())
  }

  /** {@inheritDoc ScratchSpace.releaseStep} */
  async releaseStep(runId: string, stepId: string): Promise<void> {
    this.dirs.get(runId)?.delete(stepId)
  }

  /** Bytes written under a scratch label, for test assertions. */
  read(runId: string, stepId: string, name: string): Uint8Array | undefined {
    return this.dirs.get(runId)?.get(stepId)?.get(name)
  }

  /** Whether a step still has scratch files, for test assertions. */
  hasStep(runId: string, stepId: string): boolean {
    return this.dirs.get(runId)?.has(stepId) ?? false
  }
}
