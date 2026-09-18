import { homedir } from "node:os"
import { join, normalize, resolve, sep } from "node:path"
import { mkdir, rm, readdir, writeFile, readFile, unlink, access } from "node:fs/promises"
import {
  ECP_WORKFLOWS_DIR,
  STORAGE_TIER_DIR,
} from "./uri.js"

export {
  ECP_WORKFLOWS_DIR,
  STORAGE_TIER_DIR,
  STORAGE_URI_PREFIX,
  parseStorageKey,
  storageUri,
  type StorageTier,
} from "./uri.js"

/**
 * Resolve the ECP home directory (`$ECP_HOME` or `~/.ecp`).
 * @category Storage
 */
export function resolveEcpHome(override?: string): string {
  if (override && override.length > 0) return resolve(override)
  const fromEnv = typeof process !== "undefined" ? process.env.ECP_HOME : undefined
  if (fromEnv && fromEnv.length > 0) return resolve(fromEnv)
  return join(homedir(), ".ecp")
}

/**
 * Ensure `temp`, `artifacts`, and `workflows` exist under ECP home.
 * @category Storage
 */
export async function ensureEcpHomeLayout(home?: string): Promise<{
  home: string
  temp: string
  artifacts: string
  workflows: string
}> {
  const root = resolveEcpHome(home)
  const temp = join(root, STORAGE_TIER_DIR.temp)
  const artifacts = join(root, STORAGE_TIER_DIR.durable)
  const workflows = join(root, ECP_WORKFLOWS_DIR)
  await mkdir(temp, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await mkdir(workflows, { recursive: true })
  return { home: root, temp, artifacts, workflows }
}

/**
 * Delete all contents of `~/.ecp/temp` and recreate the empty directory.
 * Does not touch `artifacts/` or `workflows/`.
 * @category Storage
 */
export async function wipeEcpTemp(home?: string): Promise<string> {
  const { temp } = await ensureEcpHomeLayout(home)
  await rm(temp, { recursive: true, force: true })
  await mkdir(temp, { recursive: true })
  return temp
}

/**
 * Map a storage key to a safe absolute path under the tier root.
 * Rejects absolute keys, `..` segments, and empty keys.
 * @category Storage
 */
export function resolveSafeStoragePath(tierRoot: string, key: string): string {
  const trimmed = key.trim().replace(/\\/g, "/")
  if (!trimmed) {
    throw new Error("Storage key must be non-empty")
  }
  if (trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) {
    throw new Error(`Storage key must be relative: ${key}`)
  }
  const segments = trimmed.split("/").filter((s) => s.length > 0)
  if (segments.some((s) => s === "." || s === "..")) {
    throw new Error(`Storage key must not contain '.' or '..': ${key}`)
  }
  const target = normalize(join(tierRoot, ...segments))
  const rootResolved = resolve(tierRoot)
  if (target !== rootResolved && !target.startsWith(rootResolved + sep)) {
    throw new Error(`Storage key escapes tier root: ${key}`)
  }
  return target
}

/** Sidecar metadata written next to a stored blob. @category Storage */
export interface StorageSidecar {
  /** How `value` was encoded on disk. */
  encoding: "raw" | "json" | "utf8"
  /** Optional MIME type. */
  mediaType?: string
  /** Optional display name. */
  name?: string
}

function sidecarPath(dataPath: string): string {
  return `${dataPath}.meta.json`
}

/**
 * Write a value under a tier root for the given key.
 * @category Storage
 */
export async function writeStorageFile(
  tierRoot: string,
  key: string,
  value: unknown,
  meta?: { mediaType?: string; name?: string; encoding?: "raw" | "json" | "utf8" | "base64" }
): Promise<StorageSidecar> {
  const path = resolveSafeStoragePath(tierRoot, key)
  await mkdir(join(path, ".."), { recursive: true })

  let encoding: StorageSidecar["encoding"] = "json"
  let bytes: Uint8Array

  if (meta?.encoding === "base64" && typeof value === "string") {
    bytes = new Uint8Array(Buffer.from(value, "base64"))
    encoding = "raw"
  } else if (value instanceof Uint8Array) {
    bytes = value
    encoding = "raw"
  } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    bytes = new Uint8Array(value)
    encoding = "raw"
  } else if (typeof value === "string" && meta?.encoding === "utf8") {
    bytes = new Uint8Array(Buffer.from(value, "utf8"))
    encoding = "utf8"
  } else if (typeof value === "string" && meta?.encoding === "raw") {
    bytes = new Uint8Array(Buffer.from(value, "base64"))
    encoding = "raw"
  } else {
    const json = JSON.stringify(value)
    bytes = new Uint8Array(Buffer.from(json, "utf8"))
    encoding = "json"
  }

  await writeFile(path, bytes)
  const sidecar: StorageSidecar = {
    encoding,
    ...(meta?.mediaType ? { mediaType: meta.mediaType } : {}),
    ...(meta?.name ? { name: meta.name } : {}),
  }
  await writeFile(sidecarPath(path), JSON.stringify(sidecar), "utf8")
  return sidecar
}

/**
 * Read a stored value and optional sidecar. Returns undefined when missing.
 * @category Storage
 */
export async function readStorageFile(
  tierRoot: string,
  key: string
): Promise<{ value: unknown; sidecar?: StorageSidecar } | undefined> {
  const path = resolveSafeStoragePath(tierRoot, key)
  try {
    await access(path)
  } catch {
    return undefined
  }
  const raw = await readFile(path)
  let sidecar: StorageSidecar | undefined
  try {
    const sideRaw = await readFile(sidecarPath(path), "utf8")
    sidecar = JSON.parse(sideRaw) as StorageSidecar
  } catch {
    sidecar = undefined
  }

  const encoding = sidecar?.encoding ?? "raw"
  if (encoding === "json") {
    return { value: JSON.parse(raw.toString("utf8")), sidecar }
  }
  if (encoding === "utf8") {
    return { value: raw.toString("utf8"), sidecar }
  }
  return { value: new Uint8Array(raw), sidecar }
}

/**
 * Delete a stored key and its sidecar if present.
 * @category Storage
 */
export async function deleteStorageFile(tierRoot: string, key: string): Promise<boolean> {
  const path = resolveSafeStoragePath(tierRoot, key)
  try {
    await unlink(path)
    await unlink(sidecarPath(path)).catch(() => undefined)
    return true
  } catch {
    return false
  }
}

/**
 * List relative keys under a tier root (files only; skips `*.meta.json`).
 * @category Storage
 */
export async function listStorageKeys(tierRoot: string, prefix = ""): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, rel: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full, nextRel)
      } else if (entry.isFile() && !entry.name.endsWith(".meta.json")) {
        if (!prefix || nextRel.startsWith(prefix)) out.push(nextRel)
      }
    }
  }
  await walk(tierRoot, "")
  return out
}
