import { randomBytes } from "node:crypto"
import { createReadStream } from "node:fs"
import { open, stat } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import type {
  ArtifactFileRef,
  ArtifactStore,
  FileBytes,
  FileMediaTypeNote,
  FileMaxBytesSettings,
  FilePathHandle,
  FileRef,
  FileRefUrl,
  FileStreamHandle,
  HandlerFiles,
  ScratchSpace,
} from "@executioncontrolprotocol/protocol"
import { assertSafeArtifactName, parseArtifactUri, toSafeArtifactName } from "@executioncontrolprotocol/protocol"
import { mediaTypesEqual, shouldSniffMediaType, sniffMediaType } from "./sniff.js"

const DEFAULT_OCTET = "application/octet-stream"
const SNIFF_BYTES = 32

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
 * Strip query and hash from a URL for safe logs and error messages.
 * @category Plugins
 */
export function stripUrlForDisplay(raw: string): string {
  try {
    const parsed = new URL(raw)
    parsed.search = ""
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return raw.split("?")[0]?.split("#")[0] ?? raw
  }
}

/**
 * Options for {@link createFileService}.
 * @category Plugins
 */
export interface CreateFileServiceOptions {
  /** Run id (new artifacts are written to this run). */
  runId: string
  /** Step id (scratch paths). */
  stepId: string
  /** Execution directory for relative `file` paths. */
  executionDir?: string
  /** Artifact storage: every artifact read and write goes through it. */
  artifacts: ArtifactStore
  /** Per-step scratch copies. */
  scratch: ScratchSpace
  /** Size caps. */
  maxBytes: FileMaxBytesSettings
  /** Corrections appended to the step record. */
  mediaTypeNotes: FileMediaTypeNote[]
  /** Prefix for note paths (for example `input.file`). */
  notePath?: string
}

/**
 * File helpers for one capability call.
 * @category Plugins
 */
export interface FileService {
  /** Handler surface. */
  files: HandlerFiles
  /** Cancel streams and remove scratch copies. */
  releaseStep(): Promise<void>
}

/**
 * Build the file service for one step. It never touches run storage directly: artifacts go through
 * {@link ArtifactStore} and temporary copies through {@link ScratchSpace}, so a hosted store works unchanged.
 * @category Plugins
 */
export function createFileService(options: CreateFileServiceOptions): FileService {
  const openStreams = new Set<FileStreamHandle>()
  const notePrefix = options.notePath ?? "ref"

  /** Reconcile a declared media type with the sniffed one; record a correction. */
  const reconcile = (head: Uint8Array, declared: string | undefined, label: string): string | undefined => {
    if (!shouldSniffMediaType(declared)) return declared
    const sniffed = sniffMediaType(head.subarray(0, SNIFF_BYTES))
    if (!sniffed) return declared
    if (declared && !mediaTypesEqual(declared, sniffed)) {
      options.mediaTypeNotes.push({ path: `${notePrefix}.${label}`, declared, sniffed })
      return sniffed
    }
    return declared ?? sniffed
  }

  /** Open any ref as a capped byte stream, with what is known about it up front. */
  async function openRef(
    ref: FileRef,
    cap: number,
  ): Promise<{ body: ReadableStream<Uint8Array>; mediaType?: string; name?: string; sniffed: boolean }> {
    if (ref.kind === "file") {
      const resolved = resolveFileRefPath(ref.path, options.executionDir)
      const info = await statFile(resolved)
      assertWithin(info.size, cap, "File")
      const head = await readHead(resolved)
      return {
        body: capStream(Readable.toWeb(createReadStream(resolved)) as ReadableStream<Uint8Array>, cap, "File"),
        mediaType: reconcile(head, ref.mediaType, "file"),
        name: path.basename(resolved),
        sniffed: true,
      }
    }
    if (ref.kind === "artifact") {
      const { runId, name } = parseArtifactUri(ref.uri)
      const info = await options.artifacts.stat(runId, name)
      if (!info) throw Object.assign(new Error(`Artifact ${name} was not found.`), { code: "ECP_NOT_FOUND" })
      assertWithin(info.sizeBytes, cap, "Artifact")
      return {
        body: capStream(await options.artifacts.getStream(runId, name), cap, "Artifact"),
        mediaType: ref.mediaType ?? info.mediaType,
        name: ref.name ?? name,
        sniffed: false,
      }
    }
    const fetched = await fetchRef(ref, cap)
    return { body: fetched.body, mediaType: ref.mediaType ?? fetched.mediaType, name: fetched.name, sniffed: false }
  }

  async function loadBytes(ref: FileRef, cap: number): Promise<FileBytes> {
    const opened = await openRef(ref, cap)
    const bytes = new Uint8Array(await new Response(opened.body).arrayBuffer())
    const mediaType = opened.sniffed ? opened.mediaType : reconcile(bytes, opened.mediaType, ref.kind)
    return { bytes, mediaType, name: opened.name }
  }

  /** Write a stream to the artifact store, sniffing its first bytes on the way through. */
  async function store(
    body: ReadableStream<Uint8Array>,
    writeOptions: { mediaType?: string; name?: string } | undefined,
    label: string,
  ): Promise<ArtifactFileRef> {
    const name = writeOptions?.name ?? defaultArtifactName()
    assertSafeArtifactName(name)
    let head: Uint8Array = new Uint8Array()
    const peek = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (head.byteLength < SNIFF_BYTES) head = concat(head, chunk.subarray(0, SNIFF_BYTES - head.byteLength))
        controller.enqueue(chunk)
      },
    })
    const ref = await options.artifacts.put(
      options.runId,
      name,
      capStream(body, options.maxBytes.bytes, "File").pipeThrough(peek),
      writeOptions?.mediaType ? { mediaType: writeOptions.mediaType } : undefined,
    )
    const mediaType = reconcile(head, writeOptions?.mediaType, label) ?? DEFAULT_OCTET
    return { ...ref, mediaType }
  }

  const files: HandlerFiles = {
    bytes: (ref) => loadBytes(ref, options.maxBytes.bytes),
    read: (ref) => loadBytes(ref, options.maxBytes.bytes),

    async stream(ref) {
      const opened = await openRef(ref, options.maxBytes.stream)
      // Relay through our own stream so cancel() works even while the handler holds a reader.
      const abort = new AbortController()
      const relay = new TransformStream<Uint8Array, Uint8Array>()
      opened.body.pipeTo(relay.writable, { signal: abort.signal }).catch(() => {})
      const handle: FileStreamHandle = {
        stream: relay.readable,
        mediaType: opened.mediaType,
        name: opened.name,
        async cancel() {
          abort.abort()
          openStreams.delete(handle)
        },
      }
      openStreams.add(handle)
      return handle
    },

    async path(ref): Promise<FilePathHandle> {
      if (ref.kind === "file") {
        const resolved = resolveFileRefPath(ref.path, options.executionDir)
        const info = await statFile(resolved)
        assertWithin(info.size, options.maxBytes.path, "File")
        const head = await readHead(resolved)
        return {
          path: resolved,
          mediaType: reconcile(head, ref.mediaType, "file"),
          name: path.basename(resolved),
          temporary: false,
        }
      }
      if (ref.kind === "artifact") {
        // A store whose bytes are local files can hand out the path; any other store gets a scratch copy.
        const { runId, name } = parseArtifactUri(ref.uri)
        const info = await options.artifacts.stat(runId, name)
        if (!info) throw Object.assign(new Error(`Artifact ${name} was not found.`), { code: "ECP_NOT_FOUND" })
        assertWithin(info.sizeBytes, options.maxBytes.path, "Artifact")
        const local = options.artifacts.localPath?.(runId, name)
        if (local) {
          return { path: local, mediaType: ref.mediaType ?? info.mediaType, name: ref.name ?? name, temporary: false }
        }
      }
      const opened = await openRef(ref, options.maxBytes.path)
      const scratchName = toSafeArtifactName(opened.name, "download.bin")
      const scratchPath = await options.scratch.writeStream(options.runId, options.stepId, scratchName, opened.body)
      return { path: scratchPath, mediaType: opened.mediaType, name: scratchName, temporary: true }
    },

    async url(ref) {
      if (ref.kind !== "url") {
        throw Object.assign(
          new Error("This needs a URL; publish the file first (for example an upload step) and pass its url FileRef."),
          { code: "ECP_INPUT_INVALID" },
        )
      }
      return ref
    },

    async fromBytes(bytes, writeOptions) {
      return store(new Response(new Uint8Array(bytes)).body!, writeOptions, "fromBytes")
    },

    async writeArtifact(bytes, writeOptions) {
      return files.fromBytes(bytes, writeOptions)
    },

    async fromStream(body, writeOptions) {
      return store(body, writeOptions, "fromStream")
    },

    async fromPath(filePath, writeOptions) {
      const resolved = resolveFileRefPath(filePath, options.executionDir)
      const info = await statFile(resolved)
      assertWithin(info.size, options.maxBytes.path, "File")
      return store(
        Readable.toWeb(createReadStream(resolved)) as ReadableStream<Uint8Array>,
        {
          mediaType: writeOptions?.mediaType,
          name: writeOptions?.name ?? toSafeArtifactName(path.basename(resolved), defaultArtifactName()),
        },
        "fromPath",
      )
    },

    async fromUrl(url, writeOptions) {
      const ref: FileRefUrl = {
        kind: "url",
        url,
        ...(writeOptions?.headers ? { headers: writeOptions.headers } : {}),
        ...(writeOptions?.mediaType ? { mediaType: writeOptions.mediaType } : {}),
      }
      if (writeOptions?.persist !== true) return ref
      const fetched = await fetchRef(ref, options.maxBytes.url)
      return store(
        fetched.body,
        {
          mediaType: writeOptions.mediaType ?? fetched.mediaType,
          name: writeOptions.name ?? toSafeArtifactName(fetched.name, defaultArtifactName()),
        },
        "fromUrl",
      )
    },
  }

  return {
    files,
    async releaseStep() {
      for (const handle of [...openStreams]) await handle.cancel()
      openStreams.clear()
      await options.scratch.releaseStep(options.runId, options.stepId)
    },
  }
}

function defaultArtifactName(): string {
  return `artifact-${Date.now()}-${randomBytes(4).toString("hex")}.bin`
}

function assertWithin(size: number, cap: number, what: string): void {
  if (size > cap) throw Object.assign(new Error(`${what} exceeds the ${cap} byte limit.`), { code: "ECP_INPUT_INVALID" })
}

async function statFile(file: string): Promise<{ size: number }> {
  try {
    return await stat(file)
  } catch (error) {
    throw Object.assign(new Error(`File ${file} was not found.`), { code: "ECP_INPUT_INVALID", cause: error })
  }
}

async function readHead(file: string): Promise<Uint8Array> {
  const handle = await open(file, "r")
  try {
    const buffer = new Uint8Array(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/** Pass a stream through, failing it with `ECP_INPUT_INVALID` once more than `cap` bytes have gone by. */
function capStream(body: ReadableStream<Uint8Array>, cap: number, what: string): ReadableStream<Uint8Array> {
  let total = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength
        if (total > cap) {
          controller.error(
            Object.assign(new Error(`${what} exceeds the ${cap} byte limit.`), { code: "ECP_INPUT_INVALID" }),
          )
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength)
  out.set(a, 0)
  out.set(b, a.byteLength)
  return out
}

async function fetchRef(
  ref: FileRefUrl,
  cap: number,
): Promise<{ body: ReadableStream<Uint8Array>; mediaType?: string; name?: string }> {
  const display = stripUrlForDisplay(ref.url)
  let response: Response
  try {
    response = await fetch(ref.url, { headers: ref.headers })
  } catch (error) {
    throw Object.assign(
      new Error(`Failed to fetch ${display}: ${error instanceof Error ? error.message : String(error)}`),
      { code: "ECP_PROVIDER_ERROR", details: { url: display } },
    )
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw Object.assign(new Error(`Failed to fetch ${display}: HTTP ${response.status}`), {
      code: "ECP_PROVIDER_ERROR",
      details: { status: response.status, url: display },
    })
  }
  const length = Number(response.headers.get("content-length") ?? "0")
  if (length > cap) {
    await response.body?.cancel().catch(() => {})
    throw Object.assign(new Error(`Download exceeds the ${cap} byte limit.`), { code: "ECP_INPUT_INVALID" })
  }
  let name: string | undefined
  try {
    name = path.basename(new URL(ref.url).pathname) || undefined
  } catch {
    name = undefined
  }
  return {
    body: capStream(response.body ?? new Response(new Uint8Array()).body!, cap, "Download"),
    mediaType: response.headers.get("content-type") ?? undefined,
    name,
  }
}
