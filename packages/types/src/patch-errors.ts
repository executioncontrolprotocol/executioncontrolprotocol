/** Patch operation error codes. @category Patch */
export const ECP_PATCH_ERROR_CODES = {
  DUPLICATE_STEP_ID: "DUPLICATE_STEP_ID",
  PATCH_PATH_NOT_FOUND: "PATCH_PATH_NOT_FOUND",
  PATCH_PATH_UNSUPPORTED: "PATCH_PATH_UNSUPPORTED",
  PATCH_APPLY_FAILED: "PATCH_APPLY_FAILED",
  PATCH_INVALID_DOCUMENT: "PATCH_INVALID_DOCUMENT",
} as const

/** Patch error code union. @category Patch */
export type EcpPatchErrorCode =
  (typeof ECP_PATCH_ERROR_CODES)[keyof typeof ECP_PATCH_ERROR_CODES]
