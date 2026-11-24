import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { atomicWriteText, FILE_MAX_BYTES, listExecutionFilePaths, scriptPathsOf } from "@executioncontrolprotocol/local"

export { FILE_MAX_BYTES, listExecutionFilePaths as listExecutionFiles, scriptPathsOf }

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
 * Write an open `.ecp.json` execution file. The path must be absolute, already exist, be at
 * most {@link FILE_MAX_BYTES}, and appear in `watchedExecutions` (the App's `open=` watch set).
 * Never writes `$script.path` targets.
 * @category Host
 */
export async function writeAllowedExecutionFile(
  absolutePath: string,
  text: string,
  watchedExecutions: ReadonlySet<string>,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!path.isAbsolute(absolutePath)) {
    return { ok: false, code: "ECP_REQUEST_INVALID", message: "Path must be absolute." }
  }
  const resolved = path.resolve(absolutePath)
  if (!resolved.endsWith(".ecp.json")) {
    return {
      ok: false,
      code: "ECP_REQUEST_INVALID",
      message: "Only .ecp.json execution files may be written.",
    }
  }
  if (!watchedExecutions.has(resolved)) {
    return {
      ok: false,
      code: "ECP_REQUEST_INVALID",
      message: "This execution file is not open in the App.",
    }
  }
  if (!existsSync(resolved)) {
    return { ok: false, code: "ECP_NOT_FOUND", message: `File ${resolved} was not found.` }
  }
  const bodyBytes = Buffer.byteLength(text, "utf8")
  if (bodyBytes > FILE_MAX_BYTES) {
    return { ok: false, code: "ECP_REQUEST_INVALID", message: `File exceeds ${FILE_MAX_BYTES} bytes.` }
  }
  if (isReferencedScript(resolved)) {
    return {
      ok: false,
      code: "ECP_REQUEST_INVALID",
      message: "Script files referenced by $script.path may not be written.",
    }
  }
  await atomicWriteText(resolved, text)
  return { ok: true }
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