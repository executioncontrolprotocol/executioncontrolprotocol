import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ArtifactFileRef, FileBytes, FileRef } from "@executioncontrolprotocol/protocol"

/**
 * Create file helpers bound to one run's artifact directory.
 * @category Plugins
 */
export function createPluginFiles(options: {
  /** Absolute artifact directory for the run. */
  artifactDir: string
  /** Run id used in artifact URIs. */
  runId: string
}): {
  read(ref: FileRef): Promise<FileBytes>
  writeArtifact(bytes: Uint8Array, writeOptions: { mediaType: string; name?: string }): Promise<ArtifactFileRef>
} {
  return {
    async read(ref) {
      if (ref.kind === "file") {
        const bytes = new Uint8Array(await readFile(ref.path))
        return { bytes, mediaType: ref.mediaType, name: path.basename(ref.path) }
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
