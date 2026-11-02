/**
 * Bytes returned from {@link resolveFile} or {@link MediaStore.read}.
 * @category File
 */
export interface ResolvedFile {
  /** Raw bytes. */
  bytes: Uint8Array
  /** MIME type when known. */
  mediaType?: string
  /** Byte length. */
  sizeBytes: number
  /** Optional display name. */
  name?: string
}
