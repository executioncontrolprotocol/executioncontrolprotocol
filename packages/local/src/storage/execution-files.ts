import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs"
import path from "node:path"
import { sha256Hex } from "@executioncontrolprotocol/engine"
import type { ExecutionFiles, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { atomicWriteText, withFileLock } from "./atomic.js"
import { StorageError } from "./errors.js"
import { EXECUTION_FILE_MAX_BYTES } from "./paths.js"

/** Max bytes for a script value in commit/retrieve `scripts` maps (spec 06). */
export const SCRIPTS_MAP_MAX_BYTES = 2 * 1024 * 1024

const FILES_MAX = 200
const FILES_DEPTH = 3

/** Max bytes for listing and HTTP file routes (re-exported by the host). */
export const FILE_MAX_BYTES = EXECUTION_FILE_MAX_BYTES

/**
 * Opaque path version: SHA-256 hex of execution text plus every referenced `$script.path`.
 * @category Storage
 */
export async function executionPathVersion(
  executionText: string,
  scripts: ReadonlyArray<{ path: string; text: string; missing: boolean }>,
): Promise<string> {
  const parts = [executionText]
  for (const script of [...scripts].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    parts.push("\0", script.path, "\0", script.missing ? "0" : "1", script.text)
  }
  return sha256Hex(parts.join(""))
}

/**
 * Serialize a manifest for path storage (preserves key order from the in-memory object).
 * @category Storage
 */
export function manifestExecutionText(manifest: ExecutionManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * List `*.ecp.json` under `dir` up to depth 3 / 200 files.
 * @category Storage
 */
export function listExecutionFilePaths(dir: string): string[] {
  const root = path.resolve(dir)
  if (!existsSync(root) || !statSync(root).isDirectory()) return []
  const out: string[] = []
  walkList(root, 0, out)
  return out
}

function walkList(current: string, depth: number, out: string[]): void {
  if (out.length >= FILES_MAX || depth > FILES_DEPTH) return
  const entries = readdirSync(current, { withFileTypes: true })
  for (const entry of entries) {
    if (out.length >= FILES_MAX) return
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = path.join(current, entry.name)
    if (entry.isDirectory()) {
      if (depth < FILES_DEPTH) walkList(full, depth + 1, out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".ecp.json")) out.push(full)
  }
}

/**
 * Collect absolute `$script.path` values from a manifest.
 * @category Storage
 */
export function scriptPathsOf(manifest: ExecutionManifest, baseDir: string): string[] {
  const paths: string[] = []
  visitScriptPaths(manifest, baseDir, paths)
  return paths
}

/**
 * Collect manifest `$script.path` keys with resolved absolute paths.
 * @category Storage
 */
export function scriptPathEntriesOf(
  manifest: ExecutionManifest,
  baseDir: string,
): Array<{ key: string; absolute: string }> {
  const entries: Array<{ key: string; absolute: string }> = []
  visitScriptEntries(manifest, baseDir, entries)
  return entries
}

function visitScriptPaths(value: unknown, baseDir: string, paths: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) visitScriptPaths(item, baseDir, paths)
    return
  }
  if (value === null || typeof value !== "object") return
  const record = value as Record<string, unknown>
  if (typeof record.$script === "object" && record.$script !== null) {
    const script = record.$script as { path?: unknown }
    if (typeof script.path === "string") paths.push(path.resolve(baseDir, script.path))
  }
  for (const child of Object.values(record)) visitScriptPaths(child, baseDir, paths)
}

function visitScriptEntries(
  value: unknown,
  baseDir: string,
  entries: Array<{ key: string; absolute: string }>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) visitScriptEntries(item, baseDir, entries)
    return
  }
  if (value === null || typeof value !== "object") return
  const record = value as Record<string, unknown>
  if (typeof record.$script === "object" && record.$script !== null) {
    const script = record.$script as { path?: unknown }
    if (typeof script.path === "string") {
      entries.push({ key: script.path, absolute: path.resolve(baseDir, script.path) })
    }
  }
  if (typeof record.script === "object" && record.script !== null) {
    const script = record.script as { path?: unknown }
    if (typeof script.path === "string") {
      entries.push({ key: script.path, absolute: path.resolve(baseDir, script.path) })
    }
  }
  for (const child of Object.values(record)) visitScriptEntries(child, baseDir, entries)
}

/**
 * Resolve a script map key relative to an execution directory.
 * @category Storage
 */
export function resolveScriptKey(executionDir: string, key: string): string | "absolute" | "escape" {
  if (path.isAbsolute(key)) return "absolute"
  const resolved = path.resolve(executionDir, key)
  const relative = path.relative(executionDir, resolved)
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return "escape"
  return resolved
}

async function scriptStatesForVersion(
  manifest: ExecutionManifest,
  executionDir: string,
): Promise<Array<{ path: string; text: string; missing: boolean }>> {
  const entries = scriptPathEntriesOf(manifest, executionDir)
  const states: Array<{ path: string; text: string; missing: boolean }> = []
  for (const entry of entries) {
    if (!existsSync(entry.absolute)) {
      states.push({ path: entry.key, text: "", missing: true })
      continue
    }
    const size = statSync(entry.absolute).size
    if (size > SCRIPTS_MAP_MAX_BYTES) {
      throw Object.assign(
        new Error(`ECP_REQUEST_INVALID: script file exceeds ${SCRIPTS_MAP_MAX_BYTES} bytes.`),
        { code: "ECP_REQUEST_INVALID" },
      )
    }
    states.push({ path: entry.key, text: readFileSync(entry.absolute, "utf8"), missing: false })
  }
  return states
}

/**
 * Disk-backed {@link ExecutionFiles} for the local host.
 * @category Storage
 */
export class LocalExecutionFiles implements ExecutionFiles {
  /** Stat one execution file. */
  async stat(absolutePath: string): Promise<{ text: string; version: string; updatedAt: string }> {
    const resolved = path.resolve(absolutePath)
    if (!existsSync(resolved)) {
      throw new StorageError("ECP_NOT_FOUND", `File ${resolved} was not found.`)
    }
    const size = statSync(resolved).size
    if (size > EXECUTION_FILE_MAX_BYTES) {
      throw Object.assign(new Error(`ECP_REQUEST_INVALID: file exceeds ${EXECUTION_FILE_MAX_BYTES} bytes.`), {
        code: "ECP_REQUEST_INVALID",
      })
    }
    const text = readFileSync(resolved, "utf8")
    const executionDir = path.dirname(resolved)
    let states: Array<{ path: string; text: string; missing: boolean }> = []
    let parsed: ExecutionManifest | undefined
    try {
      parsed = JSON.parse(text) as ExecutionManifest
    } catch {
      // Invalid JSON: version is still derived from raw bytes; retrieve reports ECP_EXECUTION_LOAD.
    }
    if (parsed) {
      states = await scriptStatesForVersion(parsed, executionDir)
    }
    const version = await executionPathVersion(text, states)
    const updatedAt = statSync(resolved).mtime.toISOString()
    return { text, version, updatedAt }
  }

  /** Version from text and parsed manifest. */
  async versionOf(_absolutePath: string, text: string, manifest: ExecutionManifest): Promise<string> {
    const executionDir = path.dirname(path.resolve(_absolutePath))
    const states = await scriptStatesForVersion(manifest, executionDir)
    return executionPathVersion(text, states)
  }

  /**
   * Write scripts first, then the execution file. Partial failure can leave scripts updated without
   * updating the execution file; the version digest includes script bytes.
   */
  async write(
    absolutePath: string,
    text: string,
    opts?: { ifVersion?: string; scripts?: Record<string, string> },
  ): Promise<{ version: string }> {
    const resolved = path.resolve(absolutePath)
    const executionDir = path.dirname(resolved)
    if (Buffer.byteLength(text, "utf8") > EXECUTION_FILE_MAX_BYTES) {
      throw Object.assign(new Error(`ECP_REQUEST_INVALID: file exceeds ${EXECUTION_FILE_MAX_BYTES} bytes.`), {
        code: "ECP_REQUEST_INVALID",
      })
    }
    if (opts?.scripts) {
      for (const [key, value] of Object.entries(opts.scripts)) {
        const target = resolveScriptKey(executionDir, key)
        if (target === "absolute" || target === "escape") {
          throw Object.assign(new Error("ECP_REQUEST_INVALID: script key must be relative to the execution file."), {
            code: "ECP_REQUEST_INVALID",
          })
        }
        if (Buffer.byteLength(value, "utf8") > SCRIPTS_MAP_MAX_BYTES) {
          throw Object.assign(new Error(`ECP_REQUEST_INVALID: script exceeds ${SCRIPTS_MAP_MAX_BYTES} bytes.`), {
            code: "ECP_REQUEST_INVALID",
          })
        }
      }
    }
    return withFileLock(resolved, async () => {
      if (!existsSync(resolved)) {
        throw new StorageError("ECP_NOT_FOUND", `File ${resolved} was not found.`)
      }
      const current = await this.stat(resolved)
      if (opts?.ifVersion !== undefined && opts.ifVersion !== current.version) {
        throw new StorageError(
          "ECP_VERSION_CONFLICT",
          `Execution ${resolved} is at version ${current.version}.`,
        )
      }
      if (opts?.scripts) {
        for (const [key, value] of Object.entries(opts.scripts)) {
          const target = resolveScriptKey(executionDir, key) as string
          await atomicWriteText(target, value)
        }
      }
      await atomicWriteText(resolved, text)
      const manifest = JSON.parse(text) as ExecutionManifest
      const version = await this.versionOf(resolved, text, manifest)
      return { version }
    })
  }

  /** Remove an execution file at the given version. */
  async remove(absolutePath: string, ifVersion: string): Promise<void> {
    const resolved = path.resolve(absolutePath)
    await withFileLock(resolved, async () => {
      if (!existsSync(resolved)) {
        throw new StorageError("ECP_NOT_FOUND", `File ${resolved} was not found.`)
      }
      const current = await this.stat(resolved)
      if (current.version !== ifVersion) {
        throw new StorageError(
          "ECP_VERSION_CONFLICT",
          `Execution ${resolved} is at version ${current.version}.`,
        )
      }
      unlinkSync(resolved)
    })
  }

  /** List execution files with versions under `dir`. */
  async list(dir: string): Promise<Array<{ path: string; version: string }>> {
    const paths = listExecutionFilePaths(dir)
    const rows: Array<{ path: string; version: string }> = []
    for (const filePath of paths) {
      try {
        const { version } = await this.stat(filePath)
        rows.push({ path: filePath, version })
      } catch {
        // skip unreadable files
      }
    }
    return rows
  }

  /** Read referenced scripts as relative path → text. */
  async readScripts(executionDir: string, manifest: ExecutionManifest): Promise<Record<string, string>> {
    const base = path.resolve(executionDir)
    const out: Record<string, string> = {}
    for (const entry of scriptPathEntriesOf(manifest, base)) {
      const relative = path.relative(base, entry.absolute)
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw Object.assign(new Error("ECP_REQUEST_INVALID: script path escapes the execution directory."), {
          code: "ECP_REQUEST_INVALID",
        })
      }
      if (!existsSync(entry.absolute)) {
        throw new StorageError("ECP_NOT_FOUND", `Script file ${entry.absolute} was not found.`)
      }
      const size = statSync(entry.absolute).size
      if (size > SCRIPTS_MAP_MAX_BYTES) {
        throw Object.assign(new Error(`ECP_REQUEST_INVALID: script file exceeds ${SCRIPTS_MAP_MAX_BYTES} bytes.`), {
          code: "ECP_REQUEST_INVALID",
        })
      }
      out[entry.key] = readFileSync(entry.absolute, "utf8")
    }
    return out
  }
}