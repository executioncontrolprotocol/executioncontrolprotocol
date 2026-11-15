import type { EcpSchema } from "./schema.js"
import type { EcpVersion } from "./version.js"
import type { ValidationIssue } from "./validation.js"
import type { ValidationResult } from "./validation.js"

/** Patch merge mode. @category Patch */
export type PatchMode = "merge" | "replace"

/** Single patch entry. @category Patch */
export interface EcpPatchEntry {
  /** ECP path using `steps[<stepId>]` (not labels). */
  path: string
  /** Defaults to `merge`. */
  mode?: PatchMode
  /** Partial or full JSON value. */
  value: unknown
  /** Optional audit reason. */
  reason?: string
}

/** Canonical patch document. @category Patch */
export interface EcpPatchDocument {
  schema: "@executioncontrolprotocol.patch"
  version: EcpVersion
  targetSchema: EcpSchema
  patches: EcpPatchEntry[]
}

/** Shorthand or canonical patch input. @category Patch */
export type EcpPatchInput = EcpPatchDocument | EcpPatchEntry[] | Record<string, unknown>

/** Applied patch entry record. @category Patch */
export interface AppliedPatchEntry {
  path: string
  mode: PatchMode
  success: boolean
  diagnostics?: ValidationIssue[]
}

/** Result from `ecp.patch(...).process()`. @category Patch */
export interface PatchResult<T = unknown> {
  schema: "@executioncontrolprotocol.patch.result"
  version: EcpVersion
  success: boolean
  targetSchema: EcpSchema
  targetVersion?: EcpVersion
  result?: T
  patch?: EcpPatchDocument
  applied: AppliedPatchEntry[]
  validation?: ValidationResult
  diagnostics: ValidationIssue[]
}

/** Concrete patch result for schema generation. @category Patch */
export type PatchResultDocument = PatchResult<unknown>

/** Concrete patch document for schema generation. @category Patch */
export type EcpPatchDocumentRecord = EcpPatchDocument
