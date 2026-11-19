import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ArtifactFileRef, FileBytes, FileRef } from "@executioncontrolprotocol/protocol"

/**
 * Resolve a `file` ref path: absolute paths are used as-is; relative paths join the execution directory.
 * @category Plugins
 */
export function resolveFileRefPath(filePath: string, executionDir: string | undefined): string {
  if (path.isAbsolute(filePath)) return filePath
  if (!executionDir) {
    throw Object.assign(
      new Error(
        `Relative file path "${filePath}" is not allowed without an execution file; use an absolute path.`,
      ),
      { code: "ECP_INPUT_INVALID" },
    )
  }
  return path.join(executionDir, filePath)
}

/**
 * Create file helpers bound to one run's artifact directory.
 * @category Plugins
 */
export function createPluginFiles(options: {
  /** Absolute artifact directory for the run. */
  artifactDir: string
  /** Run id used in artifact URIs. */
  runId: string
  /** Directory of the execution `.ecp.json` for relative `file` refs. */
  executionDir?: string
}): {
  read(ref: FileRef): Promise<FileBytes>
  writeArtifact(bytes: Uint8Array, writeOptions: { mediaType: string; name?: string }): Promise<ArtifactFileRef>
} {
  return {
    async read(ref) {
      if (ref.kind === "file") {
        const resolvedPath = resolveFileRefPath(ref.path, options.executionDir)
        const bytes = new Uint8Array(await readFile(resolvedPath))
        return { bytes, mediaType: ref.mediaType, name: path.basename(resolvedPath) }
      }
      if (ref.kind === "url") {
        const response = await fetch(ref.url, { headers: ref.headers })
        if (!response.ok) {
          throw Object.assign(new Error(`Failed to fetch ${ref.url}: ${response.status}`), {
            code: "ECP_PLUGIN_LOAD_FAILED",
          })
        }
        const buffer = new Uint8Array(await response.arrayBuffer())
        return {
          bytes: buffer,
          mediaType: ref.mediaType ?? response.headers.get("content-type") ?? undefined,
          name: path.basename(new URL(ref.url).pathname) || undefined,
        }
      }
      const name = ref.name ?? ref.uri.split("/").at(-1) ?? "artifact.bin"
      const bytes = new Uint8Array(await readFile(path.join(options.artifactDir, name)))
      return { bytes, mediaType: ref.mediaType, name }
    },
    async writeArtifact(bytes, writeOptions) {
      await mkdir(options.artifactDir, { recursive: true })
      const name = writeOptions.name ?? `artifact-${Date.now()}.bin`
      await writeFile(path.join(options.artifactDir, name), bytes)
      return {
        kind: "artifact",
        uri: `ecp://runs/${options.runId}/artifacts/${name}`,
        mediaType: writeOptions.mediaType,
        name,
        sizeBytes: bytes.byteLength,
      }
    },
  }
}
