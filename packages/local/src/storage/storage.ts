import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  watch as fsWatch,
  type FSWatcher,
} from "node:fs"
import path from "node:path"
import { canonicalJson, sha256Hex, type ServiceContext } from "@executioncontrolprotocol/engine"
import type {
  ConfigObject,
  ExecutionManifest,
  StorageChange,
  StorageProvider,
  StoredExecution,
  StoredExecutionMeta,
  StoredExecutionSummary,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { IMPLEMENTATION_IDS } from "@executioncontrolprotocol/protocol"
import { atomicWriteText, withFileLock } from "./atomic.js"
import { StorageError } from "./errors.js"
import {
  EXECUTION_FILE_MAX_BYTES,
  HomePaths,
  SCRIPT_FILE_MAX_BYTES,
  stableStringify,
} from "./paths.js"
import { LocalRunStore } from "./run-store.js"

/**
 * Disk {@link StorageProvider} under `$ECP_HOME`.
 * @category Storage
 */
export class LocalStorage implements StorageProvider {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.localStorage

  private readonly paths: HomePaths
  private readonly listeners = new Set<(change: StorageChange) => void>()
  private watchers: FSWatcher[] = []
  private pollTimer?: ReturnType<typeof setInterval>
  private debounceTimer?: ReturnType<typeof setTimeout>
  private lastSnapshot = ""
  readonly runs: LocalRunStore

  /**
   * @param ctx Service context from the environment.
   */
  constructor(ctx: ServiceContext) {
    this.paths = new HomePaths(ctx.settings.home)
    this.runs = new LocalRunStore(this.paths, (change) => this.emit(change))
  }

  /** Ensure layout directories exist and start watchers. */
  async start(): Promise<void> {
    mkdirSync(this.paths.executionsDir(), { recursive: true })
    mkdirSync(this.paths.configsDir(), { recursive: true })
    mkdirSync(this.paths.runsDir(), { recursive: true })
    mkdirSync(path.dirname(this.paths.executionSchema()), { recursive: true })
    this.startWatch()
  }

  /** Stop watchers and flush event batches. */
  async stop(): Promise<void> {
    for (const watcher of this.watchers) watcher.close()
    this.watchers = []
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    await this.runs.flushAll()
  }

  /** Load one execution. */
  async getExecution(id: string): Promise<StoredExecution | undefined> {
    const meta = this.readMeta(id)
    if (!meta) return undefined
    const manifest = this.readManifest(id)
    if (!manifest) return undefined
    return { ...meta, manifest }
  }

  /** Most recently updated first. */
  async listExecutions(): Promise<StoredExecutionSummary[]> {
    if (!existsSync(this.paths.executionsDir())) return []
    const ids = readdirSync(this.paths.executionsDir())
      .filter((name) => name.endsWith(".meta.json"))
      .map((name) => name.slice(0, -".meta.json".length))
    const rows: StoredExecutionSummary[] = []
    for (const id of ids) {
      const meta = this.readMeta(id)
      const manifest = this.readManifest(id)
      if (!meta || !manifest) continue
      rows.push({
        id: meta.id,
        version: meta.version,
        label: manifest.execution?.label,
        updatedAt: meta.updatedAt,
      })
    }
    return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : 1))
  }

  /** Create or replace an execution. */
  async putExecution(
    id: string,
    manifest: ExecutionManifest,
    opts: { ifVersion?: number; create?: boolean; warnings?: ValidationIssue[] },
  ): Promise<{ version: number }> {
    const manifestPath = this.paths.executionFile(id)
    return withFileLock(manifestPath, async () => {
      const current = this.readMeta(id)
      if (opts.create && current) {
        throw new StorageError("ECP_ALREADY_EXISTS", `Execution ${id} already exists.`)
      }
      if (!opts.create) {
        if (!current) throw new StorageError("ECP_NOT_FOUND", `Execution ${id} was not found.`)
        if (opts.ifVersion === undefined || opts.ifVersion !== current.version) {
          throw new StorageError("ECP_VERSION_CONFLICT", `Execution ${id} is at version ${current.version}.`)
        }
      }
      const now = new Date().toISOString()
      const version = current && !opts.create ? current.version + 1 : 1
      const stored: ExecutionManifest = {
        ...manifest,
        execution: { ...manifest.execution, id },
      }
      const manifestHash = await sha256Hex(canonicalJson(stored))
      const meta: StoredExecutionMeta = {
        id,
        version,
        manifestHash,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        warnings: opts.warnings ?? [],
      }
      await atomicWriteText(manifestPath, stableStringify(stored))
      await atomicWriteText(this.paths.executionMeta(id), stableStringify(meta))
      this.emit({ type: "execution", id, action: "put" })
      return { version }
    })
  }

  /** Delete an execution at a known version. */
  async deleteExecution(id: string, ifVersion: number): Promise<void> {
    const manifestPath = this.paths.executionFile(id)
    await withFileLock(manifestPath, async () => {
      const current = this.readMeta(id)
      if (!current) throw new StorageError("ECP_NOT_FOUND", `Execution ${id} was not found.`)
      if (current.version !== ifVersion) {
        throw new StorageError("ECP_VERSION_CONFLICT", `Execution ${id} is at version ${current.version}.`)
      }
      unlinkSync(manifestPath)
      unlinkSync(this.paths.executionMeta(id))
      this.emit({ type: "execution", id, action: "delete" })
    })
  }

  /** Load one config. */
  async getConfig(id: string): Promise<ConfigObject | undefined> {
    const file = this.paths.configFile(id)
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, "utf8")) as ConfigObject
  }

  /** List configs, optionally for one plugin id or short name. */
  async listConfigs(plugin?: string): Promise<ConfigObject[]> {
    if (!existsSync(this.paths.configsDir())) return []
    const files = listFilesRecursive(this.paths.configsDir()).filter((file) => file.endsWith(".json"))
    const all: ConfigObject[] = []
    for (const file of files) {
      all.push(JSON.parse(readFileSync(file, "utf8")) as ConfigObject)
    }
    const filtered = plugin
      ? all.filter((config) => config.plugin === plugin || config.id.startsWith(`${plugin}/`))
      : all
    return filtered.sort((a, b) => (a.id < b.id ? -1 : 1))
  }

  /** Create or replace a config. */
  async putConfig(config: ConfigObject, opts: { ifVersion?: number; create?: boolean }): Promise<{ version: number }> {
    const file = this.paths.configFile(config.id)
    return withFileLock(file, async () => {
      const current = await this.getConfig(config.id)
      if (opts.create && current) {
        throw new StorageError("ECP_ALREADY_EXISTS", `Config ${config.id} already exists.`)
      }
      if (!opts.create) {
        if (!current) throw new StorageError("ECP_NOT_FOUND", `Config ${config.id} was not found.`)
        if (opts.ifVersion === undefined || opts.ifVersion !== current.objectVersion) {
          throw new StorageError(
            "ECP_VERSION_CONFLICT",
            `Config ${config.id} is at version ${current.objectVersion}.`,
          )
        }
      }
      const version = current && !opts.create ? current.objectVersion + 1 : 1
      const stored: ConfigObject = { ...config, objectVersion: version, updatedAt: new Date().toISOString() }
      await atomicWriteText(file, stableStringify(stored))
      this.emit({ type: "config", id: config.id, action: "put" })
      return { version }
    })
  }

  /** Delete a config at a known version. */
  async deleteConfig(id: string, ifVersion: number): Promise<void> {
    const file = this.paths.configFile(id)
    await withFileLock(file, async () => {
      const current = await this.getConfig(id)
      if (!current) throw new StorageError("ECP_NOT_FOUND", `Config ${id} was not found.`)
      if (current.objectVersion !== ifVersion) {
        throw new StorageError("ECP_VERSION_CONFLICT", `Config ${id} is at version ${current.objectVersion}.`)
      }
      unlinkSync(file)
      this.emit({ type: "config", id, action: "delete" })
    })
  }

  /** Read an execution file with the 2 MB limit. */
  async readExecutionFile(absolutePath: string): Promise<string> {
    return this.readLimited(absolutePath, EXECUTION_FILE_MAX_BYTES, "execution")
  }

  /** Read a `$script` file with the 1 MB limit. */
  async readTextFile(absolutePath: string): Promise<string> {
    return this.readLimited(absolutePath, SCRIPT_FILE_MAX_BYTES, "script")
  }

  /** Subscribe to store changes. */
  watch(listener: (change: StorageChange) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private readLimited(absolutePath: string, maxBytes: number, kind: string): string {
    if (!existsSync(absolutePath)) {
      throw new StorageError("ECP_NOT_FOUND", `${kind} file ${absolutePath} was not found.`)
    }
    const size = statSync(absolutePath).size
    if (size > maxBytes) {
      throw Object.assign(
        new Error(`ECP_INPUT_INVALID: ${kind} file exceeds ${maxBytes} bytes.`),
        { code: "ECP_INPUT_INVALID" },
      )
    }
    return readFileSync(absolutePath, "utf8")
  }

  private readMeta(id: string): StoredExecutionMeta | undefined {
    const file = this.paths.executionMeta(id)
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, "utf8")) as StoredExecutionMeta
  }

  private readManifest(id: string): ExecutionManifest | undefined {
    const file = this.paths.executionFile(id)
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, "utf8")) as ExecutionManifest
  }

  private emit(change: StorageChange): void {
    // Keep the poll snapshot aligned with our own writes so only external
    // filesystem changes need the debounce/interval path.
    this.lastSnapshot = this.snapshotIds()
    for (const listener of this.listeners) listener(change)
  }

  private startWatch(): void {
    const schedule = (): void => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => this.pollOnce(), 100)
    }
    for (const dir of [this.paths.executionsDir(), this.paths.configsDir(), this.paths.runsDir()]) {
      try {
        this.watchers.push(fsWatch(dir, { recursive: true }, () => schedule()))
      } catch {
        // fs.watch may be unavailable on some mounts; poll covers it
      }
    }
    this.pollTimer = setInterval(() => this.pollOnce(), 2000)
    this.pollOnce()
  }

  private pollOnce(): void {
    const snapshot = this.snapshotIds()
    if (snapshot === this.lastSnapshot) return
    // Direct emit paths already notify listeners; poll only refreshes the snapshot
    // so network mounts eventually converge without duplicating put/delete events.
    this.lastSnapshot = snapshot
  }

  private snapshotIds(): string {
    const keys: string[] = []
    if (existsSync(this.paths.executionsDir())) {
      for (const name of readdirSync(this.paths.executionsDir())) {
        if (name.endsWith(".meta.json")) keys.push(`execution:${name.slice(0, -".meta.json".length)}`)
      }
    }
    for (const file of listFilesRecursive(this.paths.configsDir())) {
      if (!file.endsWith(".json")) continue
      const rel = path.relative(this.paths.configsDir(), file).replace(/\\/g, "/")
      keys.push(`config:${rel.slice(0, -".json".length)}`)
    }
    if (existsSync(this.paths.runsDir())) {
      for (const entry of readdirSync(this.paths.runsDir(), { withFileTypes: true })) {
        if (entry.isDirectory()) keys.push(`run:${entry.name}`)
      }
    }
    return keys.sort().join("\n")
  }
}

function listFilesRecursive(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...listFilesRecursive(full))
    else out.push(full)
  }
  return out
}
