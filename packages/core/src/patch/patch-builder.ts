import type { EcpPatchInput, EcpSchema, PatchResult } from "@executioncontrolprotocol/types"
import { applyPatch } from "./apply-patch.js"

/** Fluent builder for `ecp.patch()`. @category Patch */
export interface PatchOperationBuilder<T = unknown> {
  /** Patch payload (canonical document, entry array, or shorthand map). */
  with(input: EcpPatchInput): this
  /** Run patch operation. */
  process(): Promise<PatchResult<T>>
}

/**
 * Create patch operation builder.
 * @category Patch
 */
export function createPatchBuilder<T>(
  document: T,
  targetSchema: EcpSchema = "@executioncontrolprotocol.workflow"
): PatchOperationBuilder<T> {
  let patchInput: EcpPatchInput | undefined

  const builder: PatchOperationBuilder<T> = {
    with(input: EcpPatchInput) {
      patchInput = input
      return builder
    },
    async process(): Promise<PatchResult<T>> {
      if (patchInput === undefined) {
        throw new Error("Patch operation requires .with(patchInput) before .process()")
      }
      return applyPatch(
        document as import("@executioncontrolprotocol/types").WorkflowManifest,
        patchInput,
        targetSchema
      ) as PatchResult<T>
    },
  }

  return builder
}
