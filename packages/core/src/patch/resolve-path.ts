import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import { ECP_PATCH_ERROR_CODES } from "@executioncontrolprotocol/types"
import { buildStepIndex } from "./step-index.js"

/** Resolved ECP patch path. @category Patch */
export interface ResolvedPatchPath {
  ok: true
  lodashPath: string
}

/** Failed patch path resolution. @category Patch */
export interface UnresolvedPatchPath {
  ok: false
  code: (typeof ECP_PATCH_ERROR_CODES)[keyof typeof ECP_PATCH_ERROR_CODES]
  message: string
}

/** Result of resolving an ECP patch path. @category Patch */
export type ResolvePatchPathResult = ResolvedPatchPath | UnresolvedPatchPath

/**
 * Resolve `steps[<id>].field` to a lodash-compatible document path.
 * @category Patch
 */
export function resolveEcpPatchPath(
  document: WorkflowManifest,
  path: string
): ResolvePatchPathResult {
  if (path.startsWith("workflow.")) {
    return { ok: true, lodashPath: path }
  }

  if (path === "steps") {
    return { ok: true, lodashPath: "steps" }
  }

  const stepMatch = path.match(/^steps\[([^\]]+)\](?:\.(.*))?$/)
  if (stepMatch) {
    const stepId = stepMatch[1]!
    const rest = stepMatch[2]
    const index = buildStepIndex(document)

    if (index.duplicates.includes(stepId)) {
      return {
        ok: false,
        code: ECP_PATCH_ERROR_CODES.DUPLICATE_STEP_ID,
        message: `Duplicate step id: ${stepId}`,
      }
    }

    const stepPath = index.pathsById.get(stepId)
    if (!stepPath) {
      return {
        ok: false,
        code: ECP_PATCH_ERROR_CODES.PATCH_PATH_NOT_FOUND,
        message: `Step not found: ${stepId}`,
      }
    }

    return {
      ok: true,
      lodashPath: rest ? `${stepPath}.${rest}` : stepPath,
    }
  }

  return {
    ok: false,
    code: ECP_PATCH_ERROR_CODES.PATCH_PATH_UNSUPPORTED,
    message: `Unsupported patch path: ${path}`,
  }
}
