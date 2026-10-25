import { isAbsolute, join, relative, resolve, sep } from "node:path"

/**
 * Root directory for disk media artifacts.
 * Override with `ECP_ARTIFACTS_DIR` (hermetic tests).
 * @category Media
 */
export function artifactsRoot(): string {
  return process.env.ECP_ARTIFACTS_DIR ?? join(process.cwd(), ".ecp", "artifacts")
}

/**
 * Normalize a relative artifact key. Rejects `..`, absolute paths, and NUL.
 * @category Media
 */
export function assertRelativeArtifactKey(key: string): string {
  const slashNormalized = key.replace(/\\/g, "/")
  if (!slashNormalized || slashNormalized === "/") {
    throw new Error("Artifact key is empty")
  }
  if (slashNormalized.includes("\0")) {
    throw new Error("Artifact key contains a NUL")
  }
  if (slashNormalized.startsWith("/") || /^[a-zA-Z]:/.test(slashNormalized)) {
    throw new Error(`Artifact key is not a relative path: ${key}`)
  }
  const normalized = slashNormalized.replace(/^\/+/, "")
  const parts = normalized.split("/")
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`Artifact key is not a relative path: ${key}`)
  }
  return normalized
}

/**
 * Resolve `key` under `root` and confirm the result stays inside `root`.
 * @category Media
 */
export function resolveUnderRoot(root: string, key: string): string {
  const relativeKey = assertRelativeArtifactKey(key)
  const dest = resolve(root, ...relativeKey.split("/"))
  const rel = relative(resolve(root), dest)
  if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) {
    throw new Error(`Artifact key escapes the media root: ${key}`)
  }
  return dest
}
