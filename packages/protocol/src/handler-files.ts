import type { ArtifactFileRef, FileBytes, FileRef, FileRefUrl } from "./plugins.js"

/**
 * Open file stream returned by {@link HandlerFiles.stream}.
 * @category Plugins
 */
export interface FileStreamHandle {
  /** Byte stream valid until the handler settles or {@link FileStreamHandle.cancel}. */
  stream: ReadableStream<Uint8Array>
  /** Reconciled media type. */
  mediaType?: string
  /** File name, when known. */
  name?: string
  /** Cancel the stream and release temp resources. */
  cancel(): Promise<void>
}

/**
 * Local path activation for {@link HandlerFiles.path}.
 * @category Plugins
 */
export interface FilePathHandle {
  /** Absolute path to read from disk. */
  path: string
  /** Reconciled media type. */
  mediaType?: string
  /** File name, when known. */
  name?: string
  /** True when the path lives under per-step scratch and is removed at step end. */
  temporary: boolean
}

/**
 * One sniff correction recorded on the step when declared and detected types differ.
 * @category Plugins
 */
export interface FileMediaTypeNote {
  /** JSON path or label for the ref (for example `input.file`). */
  path: string
  /** Declared `mediaType` on the ref, when present. */
  declared?: string
  /** Media type inferred from magic bytes. */
  sniffed: string
}

/**
 * Accumulator the host passes on {@link CapabilityCall.fileNotes} for one step.
 * @category Plugins
 */
export interface FileStepNotes {
  /** Sniff corrections during the step. */
  mediaTypes: FileMediaTypeNote[]
}

/**
 * File activation and passivation surface on {@link HandlerContext.files}.
 * @category Plugins
 */
export interface HandlerFiles {
  /** Read full contents. */
  bytes(ref: FileRef): Promise<FileBytes>
  /** Open a byte stream. */
  stream(ref: FileRef): Promise<FileStreamHandle>
  /** Resolve a local path (scratch copy for `url` refs). */
  path(ref: FileRef): Promise<FilePathHandle>
  /** Return a `url` ref unchanged; other kinds fail with a publish hint. */
  url(ref: FileRef): Promise<FileRefUrl>
  /** Store bytes as a run artifact. */
  fromBytes(bytes: Uint8Array, options?: { mediaType?: string; name?: string }): Promise<ArtifactFileRef>
  /** Consume a stream into an artifact. */
  fromStream(stream: ReadableStream<Uint8Array>, options?: { mediaType?: string; name?: string }): Promise<ArtifactFileRef>
  /** Copy a filesystem path into an artifact. */
  fromPath(filePath: string, options?: { mediaType?: string; name?: string }): Promise<ArtifactFileRef>
  /** Fetch a URL into an artifact or return a url ref. */
  fromUrl(
    url: string,
    options?: {
      mediaType?: string
      name?: string
      headers?: Record<string, string>
      persist?: boolean
    },
  ): Promise<FileRefUrl | ArtifactFileRef>
  /** Alias of {@link HandlerFiles.bytes}. */
  read(ref: FileRef): Promise<FileBytes>
  /** Alias of {@link HandlerFiles.fromBytes} with required `mediaType`. */
  writeArtifact(bytes: Uint8Array, options: { mediaType: string; name?: string }): Promise<ArtifactFileRef>
}