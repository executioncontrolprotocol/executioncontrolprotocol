/**
 * Storage failure the local provider throws. Operations map these to the catalogue.
 * @category Storage
 */
export class StorageError extends Error {
  /** Catalogue code. */
  readonly code: "ECP_ALREADY_EXISTS" | "ECP_VERSION_CONFLICT" | "ECP_NOT_FOUND"

  /**
   * @param code Which storage rule failed.
   * @param message One sentence, including the current version on a conflict.
   */
  constructor(code: StorageError["code"], message: string) {
    super(message)
    this.name = "StorageError"
    this.code = code
  }
}
