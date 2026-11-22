import type {
  ConfigObject,
  ExecutionManifest,
  LoopPartialFile,
  RunDetail,
  RunEvent,
  RunFilter,
  RunRecord,
  RunStore,
  StepRecord,
  StorageChange,
  StorageProvider,
  StoredExecution,
  StoredExecutionSummary,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"

/**
 * Storage failure the in-memory provider throws. Operations map these to the catalogue.
 * @category Environment
 */
export class StorageError extends Error {
  /** Catalogue code. */
  readonly code: "ECP_ALREADY_EXISTS" | "ECP_VERSION_CONFLICT" | "ECP_NOT_FOUND"

  /**
   * @param code Which storage rule failed.
   * @param message One sentence, including the current version on a conflict.
   */
  constructor(code: StorageError["code"], message: string) {
    super(message)
    this.name = "StorageError"
    this.code = code
  }
}

/**
 * Reads execution and script files. The engine package does no I/O itself.
 * @category Environment
 */
export interface TextFileReader {
  /** Return the UTF-8 contents of an absolute path. */
  read(absolutePath: string): Promise<string>
}

interface SavedExecution {
  meta: StoredExecution
  manifest: ExecutionManifest
}

interface SavedRun {
  record: RunRecord
  manifest: ExecutionManifest
  steps: StepRecord[]
  events: RunEvent[]
  state?: Record<string, unknown>
  loopPartials: Map<string, LoopPartialFile>
}

/**
 * In-memory {@link StorageProvider} for tests. File reads go through an injected reader.
 * @category Environment
 */
export class MemoryStorage implements StorageProvider {
  /** Implementation id. */
  static readonly id = "@executioncontrolprotocol/memory.storage"

  private readonly executions = new Map<string, SavedExecution>()
  private readonly configs = new Map<string, ConfigObject>()
  private readonly runRecords = new Map<string, SavedRun>()
  private readonly listeners = new Set<(change: StorageChange) => void>()

  /** Run store backed by the same memory. */
  readonly runs: RunStore

  /**
   * @param files Optional reader for execution and script files.
   */
  constructor(
    private readonly files?: TextFileReader,
  ) {
    this.runs = this.createRunStore()
  }

  /** No startup work. */
  async start(): Promise<void> {}

  /** No shutdown work. */
  async stop(): Promise<void> {}

  /** Load one execution. */
  async getExecution(id: string): Promise<StoredExecution | undefined> {
    const saved = this.executions.get(id)
    return saved ? { ...saved.meta, manifest: saved.manifest } : undefined
  }

  /** Most recently updated first. */
  async listExecutions(): Promise<StoredExecutionSummary[]> {
    return [...this.executions.values()]
      .map((saved) => ({
        id: saved.meta.id,
        version: saved.meta.version,
        label: saved.manifest.execution?.label,
        updatedAt: saved.meta.updatedAt,
      }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : 1))
  }

  /** Create or replace an execution. */
  async putExecution(
    id: string,
    manifest: ExecutionManifest,
    opts: { ifVersion?: number; create?: boolean; warnings?: ValidationIssue[] },
  ): Promise<{ version: number }> {
    const current = this.executions.get(id)
    if (opts.create && current) {
      throw new StorageError("ECP_ALREADY_EXISTS", `Execution ${id} already exists.`)
    }
    if (!opts.create) {
      if (current === undefined) throw new StorageError("ECP_NOT_FOUND", `Execution ${id} was not found.`)
      if (opts.ifVersion === undefined || opts.ifVersion !== current.meta.version) {
        throw new StorageError(
          "ECP_VERSION_CONFLICT",
          `Execution ${id} is at version ${current.meta.version}.`,
        )
      }
    }
    const now = new Date().toISOString()
    const version = current && !opts.create ? current.meta.version + 1 : 1
    const stored: ExecutionManifest = {
      ...manifest,
      execution: { ...manifest.execution, id },
    }
    this.executions.set(id, {
      manifest: stored,
      meta: {
        id,
        version,
        manifestHash: "",
        createdAt: current?.meta.createdAt ?? now,
        updatedAt: now,
        warnings: opts.warnings ?? [],
        manifest: stored,
      },
    })
    this.emit({ type: "execution", id, action: "put" })
    return { version }
  }

  /** Delete an execution at a known version. */
  async deleteExecution(id: string, ifVersion: number): Promise<void> {
    const current = this.executions.get(id)
    if (!current) throw new StorageError("ECP_NOT_FOUND", `Execution ${id} was not found.`)
    if (current.meta.version !== ifVersion) {
      throw new StorageError("ECP_VERSION_CONFLICT", `Execution ${id} is at version ${current.meta.version}.`)
    }
    this.executions.delete(id)
    this.emit({ type: "execution", id, action: "delete" })
  }

  /** Load one config. */
  async getConfig(id: string): Promise<ConfigObject | undefined> {
    return this.configs.get(id)
  }

  /** List configs, optionally for one plugin id or short name. */
  async listConfigs(plugin?: string): Promise<ConfigObject[]> {
    const all = [...this.configs.values()]
    const filtered = plugin
      ? all.filter((config) => config.plugin === plugin || config.id.startsWith(`${plugin}/`))
      : all
    return filtered.sort((a, b) => (a.id < b.id ? -1 : 1))
  }

  /** Create or replace a config. */
  async putConfig(config: ConfigObject, opts: { ifVersion?: number; create?: boolean }): Promise<{ version: number }> {
    const current = this.configs.get(config.id)
    if (opts.create && current) throw new StorageError("ECP_ALREADY_EXISTS", `Config ${config.id} already exists.`)
    if (!opts.create) {
      if (!current) throw new StorageError("ECP_NOT_FOUND", `Config ${config.id} was not found.`)
      if (opts.ifVersion === undefined || opts.ifVersion !== current.objectVersion) {
        throw new StorageError("ECP_VERSION_CONFLICT", `Config ${config.id} is at version ${current.objectVersion}.`)
      }
    }
    const version = current && !opts.create ? current.objectVersion + 1 : 1
    const stored: ConfigObject = { ...config, objectVersion: version, updatedAt: new Date().toISOString() }
    this.configs.set(config.id, stored)
    this.emit({ type: "config", id: config.id, action: "put" })
    return { version }
  }

  /** Delete a config at a known version. */
  async deleteConfig(id: string, ifVersion: number): Promise<void> {
    const current = this.configs.get(id)
    if (!current) throw new StorageError("ECP_NOT_FOUND", `Config ${id} was not found.`)
    if (current.objectVersion !== ifVersion) {
      throw new StorageError("ECP_VERSION_CONFLICT", `Config ${id} is at version ${current.objectVersion}.`)
    }
    this.configs.delete(id)
    this.emit({ type: "config", id, action: "delete" })
  }

  /** Read an execution file through the injected reader. */
  async readExecutionFile(absolutePath: string): Promise<string> {
    return this.readFile(absolutePath)
  }

  /** Read a script file through the injected reader. */
  async readTextFile(absolutePath: string): Promise<string> {
    return this.readFile(absolutePath)
  }

  /** Subscribe to changes. The return value unsubscribes. */
  watch(listener: (change: StorageChange) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(change: StorageChange): void {
    for (const listener of this.listeners) listener(change)
  }

  private async readFile(absolutePath: string): Promise<string> {
    if (!this.files) throw new StorageError("ECP_NOT_FOUND", `No file reader is configured for ${absolutePath}.`)
    return this.files.read(absolutePath)
  }

  private createRunStore(): RunStore {
    const runs = this.runRecords
    const emit = (change: StorageChange): void => this.emit(change)
    return {
      async create(record: RunRecord, manifest: ExecutionManifest): Promise<void> {
        runs.set(record.id, { record, manifest, steps: [], events: [], loopPartials: new Map() })
        emit({ type: "run", id: record.id, action: "put" })
      },
      async update(id: string, patch: Partial<RunRecord>): Promise<void> {
        const saved = requireRun(runs, id)
        saved.record = { ...saved.record, ...patch, id: saved.record.id }
        emit({ type: "run", id, action: "put" })
      },
      async writeStep(runId: string, step: StepRecord): Promise<void> {
        const saved = requireRun(runs, runId)
        const index = saved.steps.findIndex(
          (item) =>
            item.nodeId === step.nodeId &&
            item.round === step.round &&
            sameItems(item.items, step.items),
        )
        if (index >= 0) saved.steps[index] = step
        else saved.steps.push(step)
      },
      async readLoopPartial(runId: string, nodeId: string): Promise<LoopPartialFile | undefined> {
        return requireRun(runs, runId).loopPartials.get(nodeId)
      },
      async writeLoopPartial(runId: string, nodeId: string, file: LoopPartialFile): Promise<void> {
        requireRun(runs, runId).loopPartials.set(nodeId, file)
      },
      async writeState(runId: string, state: unknown): Promise<void> {
        const saved = requireRun(runs, runId)
        saved.state = state as Record<string, unknown>
      },
      async appendEvent(runId: string, event: RunEvent): Promise<void> {
        requireRun(runs, runId).events.push(event)
      },
      async get(id: string, include?: Array<"steps" | "events" | "state">): Promise<RunDetail | undefined> {
        const saved = runs.get(id)
        if (!saved) return undefined
        const detail: RunDetail = { ...saved.record }
        if (include?.includes("steps")) detail.steps = saved.steps
        if (include?.includes("events")) detail.events = saved.events
        if (include?.includes("state")) detail.state = saved.state
        return detail
      },
      async getManifest(id: string): Promise<ExecutionManifest | undefined> {
        return runs.get(id)?.manifest
      },
      async list(filter: RunFilter, limit: number): Promise<RunRecord[]> {
        return [...runs.values()]
          .map((saved) => saved.record)
          .filter((record) => {
            if (filter.executionId && record.execution.id !== filter.executionId) return false
            if (filter.status && record.status !== filter.status) return false
            if (filter.clientRequestId && record.clientRequestId !== filter.clientRequestId) return false
            return true
          })
          .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
          .slice(0, limit)
      },
    }
  }
}

function sameItems(left?: number[], right?: number[]): boolean {
  const a = left ?? []
  const b = right ?? []
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function requireRun(runs: Map<string, SavedRun>, id: string): SavedRun {
  const saved = runs.get(id)
  if (!saved) throw new StorageError("ECP_NOT_FOUND", `Run ${id} was not found.`)
  return saved
}

/**
 * In-memory secrets. Values never leave this object except through {@link MemorySecrets.get}.
 * @category Environment
 */
export class MemorySecrets {
  /** Implementation id. */
  static readonly id = "@executioncontrolprotocol/memory.secrets"
  private readonly values = new Map<string, string>()

  /** Resolve one key. */
  async get(key: string): Promise<string | undefined> {
    return this.values.get(key)
  }

  /** Set one key. */
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }

  /** Delete one key. Returns whether it existed. */
  async delete(key: string): Promise<boolean> {
    return this.values.delete(key)
  }

  /** Key names only, sorted. */
  async list(): Promise<string[]> {
    return [...this.values.keys()].sort()
  }
}
