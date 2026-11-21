/** Default per-method file size cap: 512 MiB. @category Services */
export const DEFAULT_FILE_MAX_BYTES = 512 * 1024 * 1024

/** Default capture size cap: 256 MiB. @category Services */
export const DEFAULT_FILE_CAPTURE_MAX_BYTES = 256 * 1024 * 1024

/**
 * Per-access-method and capture size caps for the host file service.
 * @category Services
 */
export interface FileMaxBytesSettings {
  /** Cap for {@link HandlerFiles.bytes}. */
  bytes: number
  /** Cap for {@link HandlerFiles.stream}. */
  stream: number
  /** Cap for {@link HandlerFiles.path} activation. */
  path: number
  /** Cap for {@link HandlerFiles.url} fetch and {@link HandlerFiles.fromUrl}. */
  url: number
  /** Cap for uniform output capture (used from a later PR). */
  capture: number
}

/**
 * MVP defaults for {@link FileMaxBytesSettings}.
 * @category Services
 */
export const DEFAULT_FILE_MAX_BYTES_SETTINGS: FileMaxBytesSettings = {
  bytes: DEFAULT_FILE_MAX_BYTES,
  stream: DEFAULT_FILE_MAX_BYTES,
  path: DEFAULT_FILE_MAX_BYTES,
  url: DEFAULT_FILE_MAX_BYTES,
  capture: DEFAULT_FILE_CAPTURE_MAX_BYTES,
}