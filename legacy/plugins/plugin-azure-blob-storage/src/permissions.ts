/** Allowed SAS permission letters. @category Azure */
export const SAS_PERMISSION_CHARS = ["r", "w", "c", "d", "l"] as const

/** Single SAS permission character. @category Azure */
export type SasPermissionChar = (typeof SAS_PERMISSION_CHARS)[number]
