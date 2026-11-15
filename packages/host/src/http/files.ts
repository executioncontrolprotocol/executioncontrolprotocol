import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"

const FILE_MAX_BYTES = 2 * 1024 * 1024
const FILES_MAX = 200
const FILES_DEPTH = 3

/**
 * Read an allowed execution or `$script.path` file as UTF-8 text.
 * @category Host
 */
export function readAllowedFile(absolutePath: string): { ok: true; text: string } | { ok: false; code: string; message: string } {
  const resolved = path.resolve(absolutePath)
  if (!existsSync(resolved)) {
    return { ok: false, code: "ECP_NOT_FOUND", message: `File ${resolved} was not found.` }
  }
  const size = statSync(resolved).size
  if (size > FILE_MAX_BYTES) {
    return { ok: false, code: "ECP_REQUEST_INVALID", message: `File exceeds ${FILE_MAX_BYTES} bytes.` }
  }
  if (resolved.endsWith(".ecp.json")) {
    return { ok: true, text: readFileSync(resolved, "utf8") }
  }
  if (!isReferencedScript(resolved)) {
    return {
      ok: false,
      code: "ECP_REQUEST_INVALID",
      message: "Only .ecp.json files and their $script.path references may be read.",
    }
  }
  return { ok: true, text: readFileSync(resolved, "utf8") }
}

/**
 * List `*.ecp.json` under `dir` up to depth 3 / 200 files.
 * @category Host
 */
export function listExecutionFiles(dir: string): string[] {
  const root = path.resolve(dir)
  if (!existsSync(root) || !statSync(root).isDirectory()) return []
  const out: string[] = []
  walk(root, 0, out)
  return out
}

function walk(current: string, depth: number, out: string[]): void {
  if (out.length >= FILES_MAX || depth > FILES_DEPTH) return
  const entries = readdirSync(current, { withFileTypes: true })
  for (const entry of entries) {
    if (out.length >= FILES_MAX) return
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = path.join(current, entry.name)
    if (entry.isDirectory()) {
      if (depth < FILES_DEPTH) walk(full, depth + 1, out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".ecp.json")) out.push(full)
  }
}

function isReferencedScript(absolutePath: string): boolean {
  const dir = path.dirname(absolutePath)
  let parent = dir
  for (let i = 0; i < 4; i++) {
    try {
      const entries = readdirSync(parent)
      for (const name of entries) {
        if (!name.endsWith(".ecp.json")) continue
        const manifestPath = path.join(parent, name)
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ExecutionManifest
          if (scriptPathsOf(manifest, path.dirname(manifestPath)).includes(absolutePath)) return true
        } catch {
          // ignore invalid manifests
        }
      }
    } catch {
      // ignore
    }
    const next = path.dirname(parent)
    if (next === parent) break
    parent = next
  }
  return false
}

/**
 * Collect absolute `$script.path` values from a manifest.
 * @category Host
 */
export function scriptPathsOf(manifest: ExecutionManifest, baseDir: string): string[] {
  const paths: string[] = []
  visit(manifest, baseDir, paths)
  return paths
}

function visit(value: unknown, baseDir: string, paths: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, baseDir, paths)
    return
  }
  if (value === null || typeof value !== "object") return
  const record = value as Record<string, unknown>
  if (typeof record.$script === "object" && record.$script !== null) {
    const script = record.$script as { path?: unknown }
    if (typeof script.path === "string") paths.push(path.resolve(baseDir, script.path))
  }
  for (const child of Object.values(record)) visit(child, baseDir, paths)
}
