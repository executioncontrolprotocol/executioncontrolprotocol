import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type {
  ExecutionManifest,
  RunDetail,
  RunEvent,
  RunFilter,
  RunRecord,
  RunStore,
  StepRecord,
  StorageChange,
} from "@executioncontrolprotocol/protocol"
import { atomicWriteText } from "./atomic.js"
import { StorageError } from "./errors.js"
import { HomePaths, stableStringify } from "./paths.js"

const EVENT_FSYNC_MS = 50

/**
 * Disk-backed {@link RunStore}.
 * @category Storage
 */
export class LocalRunStore implements RunStore {
  private readonly pendingEvents = new Map<string, { lines: string[]; timer?: ReturnType<typeof setTimeout> }>()

  /**
   * @param paths Home path helpers.
   * @param emit Change notifications.
   */
  constructor(
    private readonly paths: HomePaths,
    private readonly emit: (change: StorageChange) => void,
  ) {}

  /** Create a run directory and write the record + manifest. */
  async create(record: RunRecord, manifest: ExecutionManifest): Promise<void> {
    mkdirSync(this.paths.runDir(record.id), { recursive: true })
    mkdirSync(this.paths.runStepsDir(record.id), { recursive: true })
    mkdirSync(this.paths.runArtifacts(record.id), { recursive: true })
    await atomicWriteText(this.paths.runRecord(record.id), stableStringify(record))
    await atomicWriteText(this.paths.runManifest(record.id), stableStringify(manifest))
    this.emit({ type: "run", id: record.id, action: "put" })
  }

  /** Merge fields into `run.json`. */
  async update(id: string, patch: Partial<RunRecord>): Promise<void> {
    const current = await this.readRecord(id)
    if (!current) throw new StorageError("ECP_NOT_FOUND", `Run ${id} was not found.`)
    const next = { ...current, ...patch, id: current.id }
    await atomicWriteText(this.paths.runRecord(id), stableStringify(next))
    this.emit({ type: "run", id, action: "put" })
  }

  /** Write one step record. */
  async writeStep(runId: string, step: StepRecord): Promise<void> {
    mkdirSync(this.paths.runStepsDir(runId), { recursive: true })
    await atomicWriteText(this.paths.runStep(runId, step.nodeId, step.round), stableStringify(step))
  }

  /** Persist state after a committed step. */
  async writeState(runId: string, state: unknown): Promise<void> {
    await atomicWriteText(this.paths.runState(runId), stableStringify(state))
  }

  /** Append one event; fsync batched within 50 ms. */
  async appendEvent(runId: string, event: RunEvent): Promise<void> {
    mkdirSync(this.paths.runDir(runId), { recursive: true })
    const line = `${JSON.stringify(event)}\n`
    let batch = this.pendingEvents.get(runId)
    if (!batch) {
      batch = { lines: [] }
      this.pendingEvents.set(runId, batch)
    }
    batch.lines.push(line)
    if (batch.timer) return
    batch.timer = setTimeout(() => {
      void this.flushEvents(runId)
    }, EVENT_FSYNC_MS)
  }

  /** Load a run with optional sections. */
  async get(id: string, include?: Array<"steps" | "events" | "state">): Promise<RunDetail | undefined> {
    await this.flushEvents(id)
    const record = await this.readRecord(id)
    if (!record) return undefined
    const detail: RunDetail = { ...record }
    if (include?.includes("steps")) detail.steps = this.readSteps(id)
    if (include?.includes("events")) detail.events = this.readEvents(id)
    if (include?.includes("state")) {
      const statePath = this.paths.runState(id)
      if (existsSync(statePath)) {
        detail.state = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>
      }
    }
    return detail
  }

  /** Manifest copy stored with the run. */
  async getManifest(id: string): Promise<ExecutionManifest | undefined> {
    const file = this.paths.runManifest(id)
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, "utf8")) as ExecutionManifest
  }

  /** List runs, most recent first. */
  async list(filter: RunFilter, limit: number): Promise<RunRecord[]> {
    if (!existsSync(this.paths.runsDir())) return []
    const ids = readdirSync(this.paths.runsDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    const records: RunRecord[] = []
    for (const id of ids) {
      const record = await this.readRecord(id)
      if (!record) continue
      if (filter.executionId && record.execution.id !== filter.executionId) continue
      if (filter.status && record.status !== filter.status) continue
      if (filter.clientRequestId && record.clientRequestId !== filter.clientRequestId) continue
      records.push(record)
    }
    return records.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, limit)
  }

  /** Absolute artifacts directory. */
  artifactDir(runId: string): string {
    return this.paths.runArtifacts(runId)
  }

  /** Flush pending event batches (also called from stop). */
  async flushAll(): Promise<void> {
    for (const runId of [...this.pendingEvents.keys()]) await this.flushEvents(runId)
  }

  private async flushEvents(runId: string): Promise<void> {
    const batch = this.pendingEvents.get(runId)
    if (!batch || batch.lines.length === 0) {
      this.pendingEvents.delete(runId)
      return
    }
    if (batch.timer) clearTimeout(batch.timer)
    const lines = batch.lines.splice(0, batch.lines.length)
    this.pendingEvents.delete(runId)
    const file = this.paths.runEvents(runId)
    mkdirSync(this.paths.runDir(runId), { recursive: true })
    const fd = openSync(file, "a")
    try {
      appendFileSync(fd, lines.join(""))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }

  private async readRecord(id: string): Promise<RunRecord | undefined> {
    const file = this.paths.runRecord(id)
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, "utf8")) as RunRecord
  }

  private readSteps(runId: string): StepRecord[] {
    const dir = this.paths.runStepsDir(runId)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as StepRecord)
  }

  private readEvents(runId: string): RunEvent[] {
    const file = this.paths.runEvents(runId)
    if (!existsSync(file)) return []
    return readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as RunEvent)
  }
}
