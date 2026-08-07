import {
  ECP_PATCH_ERROR_CODES,
  LATEST_ECP_VERSION,
  type AppliedPatchEntry,
  type EcpPatchEntry,
  type EcpSchema,
  type PatchResult,
  type StepNode,
  type ValidationIssue,
  type WorkflowManifest,
  type WorkflowNode,
} from "@executioncontrolprotocol/types"
import { validateWorkflow } from "../validate/workflow.js"
import { deepMerge, getAtPath, setAtPath } from "../util/path.js"
import { buildStepIndex } from "./step-index.js"
import { normalizePatchInput, validatePatchDocument } from "./normalize-input.js"
import { resolveEcpPatchPath } from "./resolve-path.js"
import type { EcpPatchInput } from "@executioncontrolprotocol/types"

function emptyDiagnostics(): ValidationIssue[] {
  return []
}

interface EqlAddStepPayload {
  step: StepNode
  _eqlInsertAfter?: string
  _eqlInsertBefore?: string
}

function stepIndexFromPath(stepPath: string): number | undefined {
  const match = stepPath.match(/^steps\[(\d+)\]$/)
  return match ? Number(match[1]) : undefined
}

function insertStepAtAnchor(
  manifest: WorkflowManifest,
  step: StepNode,
  after?: string,
  before?: string
): { ok: true; steps: WorkflowNode[] } | { ok: false; message: string } {
  const index = buildStepIndex(manifest)
  let insertAt = manifest.steps.length

  if (after !== undefined) {
    const anchorPath = index.pathsById.get(after)
    if (!anchorPath) {
      return { ok: false, message: `Anchor step not found for AFTER: ${after}` }
    }
    const anchorIndex = stepIndexFromPath(anchorPath)
    if (anchorIndex === undefined) {
      return { ok: false, message: `Unsupported anchor path for AFTER: ${anchorPath}` }
    }
    insertAt = anchorIndex + 1
  } else if (before !== undefined) {
    const anchorPath = index.pathsById.get(before)
    if (!anchorPath) {
      return { ok: false, message: `Anchor step not found for BEFORE: ${before}` }
    }
    const anchorIndex = stepIndexFromPath(anchorPath)
    if (anchorIndex === undefined) {
      return { ok: false, message: `Unsupported anchor path for BEFORE: ${anchorPath}` }
    }
    insertAt = anchorIndex
  }

  const nextSteps = [...manifest.steps]
  nextSteps.splice(insertAt, 0, step)
  return { ok: true, steps: nextSteps }
}

function removeStepAtPath(manifest: WorkflowManifest, stepPath: string): WorkflowNode[] | undefined {
  const stepIndex = stepIndexFromPath(stepPath)
  if (stepIndex === undefined) return undefined
  return manifest.steps.filter((_, index) => index !== stepIndex)
}

function applyEqlSpecialEntry(
  manifest: WorkflowManifest,
  entry: EcpPatchEntry
):
  | { handled: true; manifest: WorkflowManifest; mode: "merge" | "replace"; success: true }
  | { handled: true; mode: "merge" | "replace"; success: false; message: string; code: string }
  | { handled: false } {
  const mode = entry.mode ?? "merge"

  if (entry.reason === "eql:add-step") {
    const payload = entry.value as EqlAddStepPayload
    const inserted = insertStepAtAnchor(
      manifest,
      payload.step,
      payload._eqlInsertAfter,
      payload._eqlInsertBefore
    )
    if (!inserted.ok) {
      return {
        handled: true,
        mode,
        success: false,
        message: inserted.message,
        code: ECP_PATCH_ERROR_CODES.PATCH_PATH_NOT_FOUND,
      }
    }
    return { handled: true, manifest: { ...manifest, steps: inserted.steps }, mode, success: true }
  }

  if (entry.reason === "eql:delete") {
    const resolved = resolveEcpPatchPath(manifest, entry.path)
    if (!resolved.ok) {
      return {
        handled: true,
        mode,
        success: false,
        message: resolved.message,
        code: resolved.code,
      }
    }
    const nextSteps = removeStepAtPath(manifest, resolved.lodashPath)
    if (nextSteps === undefined) {
      return {
        handled: true,
        mode,
        success: false,
        message: `Unsupported delete path: ${resolved.lodashPath}`,
        code: ECP_PATCH_ERROR_CODES.PATCH_PATH_UNSUPPORTED,
      }
    }
    return { handled: true, manifest: { ...manifest, steps: nextSteps }, mode, success: true }
  }

  if (entry.reason === "eql:move") {
    const resolved = resolveEcpPatchPath(manifest, entry.path)
    if (!resolved.ok) {
      return {
        handled: true,
        mode,
        success: false,
        message: resolved.message,
        code: resolved.code,
      }
    }
    const stepIndex = stepIndexFromPath(resolved.lodashPath)
    if (stepIndex === undefined) {
      return {
        handled: true,
        mode,
        success: false,
        message: `Unsupported move path: ${resolved.lodashPath}`,
        code: ECP_PATCH_ERROR_CODES.PATCH_PATH_UNSUPPORTED,
      }
    }
    const move = entry.value as { _eqlMoveAfter?: string; _eqlMoveBefore?: string }
    const stepNode = manifest.steps[stepIndex]
    if (!stepNode) {
      return {
        handled: true,
        mode,
        success: false,
        message: `Step missing at move path: ${resolved.lodashPath}`,
        code: ECP_PATCH_ERROR_CODES.PATCH_PATH_NOT_FOUND,
      }
    }
    const without = manifest.steps.filter((_, index) => index !== stepIndex)
    const inserted = insertStepAtAnchor(
      { ...manifest, steps: without },
      stepNode as StepNode,
      move._eqlMoveAfter,
      move._eqlMoveBefore
    )
    if (!inserted.ok) {
      return {
        handled: true,
        mode,
        success: false,
        message: inserted.message,
        code: ECP_PATCH_ERROR_CODES.PATCH_PATH_NOT_FOUND,
      }
    }
    return { handled: true, manifest: { ...manifest, steps: inserted.steps }, mode, success: true }
  }

  return { handled: false }
}

function resolvePatchValue(
  currentValue: unknown,
  patchValue: unknown,
  mode: "merge" | "replace"
): unknown {
  if (mode === "replace") return patchValue
  if (
    patchValue === null ||
    typeof patchValue !== "object" ||
    Array.isArray(patchValue)
  ) {
    return patchValue
  }
  if (
    currentValue === null ||
    currentValue === undefined ||
    typeof currentValue !== "object" ||
    Array.isArray(currentValue)
  ) {
    return patchValue
  }
  return deepMerge(currentValue as object, patchValue as object)
}

/**
 * Apply a patch to a workflow manifest (canonical JSON only).
 * @category Patch
 */
export function applyPatch<T extends WorkflowManifest>(
  document: T,
  input: EcpPatchInput,
  targetSchema: EcpSchema = "@executioncontrolprotocol.workflow"
): PatchResult<T> {
  const diagnostics = emptyDiagnostics()
  const patch = normalizePatchInput(input, targetSchema)

  const patchValidation = validatePatchDocument(patch)
  if (!patchValidation.valid) {
    return {
      schema: "@executioncontrolprotocol.patch.result",
      version: LATEST_ECP_VERSION,
      success: false,
      targetSchema,
      patch,
      applied: [],
      diagnostics: patchValidation.errors.map((message) => ({
        severity: "error",
        message,
        code: ECP_PATCH_ERROR_CODES.PATCH_INVALID_DOCUMENT,
      })),
    }
  }

  const index = buildStepIndex(document)
  if (index.duplicates.length > 0) {
    return {
      schema: "@executioncontrolprotocol.patch.result",
      version: LATEST_ECP_VERSION,
      success: false,
      targetSchema,
      patch,
      applied: [],
      diagnostics: index.duplicates.map((id) => ({
        severity: "error",
        code: ECP_PATCH_ERROR_CODES.DUPLICATE_STEP_ID,
        message: `Duplicate step id: ${id}`,
      })),
    }
  }

  const nextDocument = structuredClone(document) as T
  const applied: AppliedPatchEntry[] = []

  for (const entry of patch.patches) {
    const special = applyEqlSpecialEntry(nextDocument, entry)
    if (special.handled) {
      if (special.success) {
        Object.assign(nextDocument, special.manifest)
        applied.push({ path: entry.path, mode: special.mode, success: true })
      } else {
        applied.push({
          path: entry.path,
          mode: special.mode,
          success: false,
          diagnostics: [
            {
              severity: "error",
              code: special.code,
              message: special.message,
            },
          ],
        })
        diagnostics.push({
          severity: "error",
          code: special.code,
          message: special.message,
          path: entry.path,
        })
      }
      continue
    }

    const resolved = resolveEcpPatchPath(nextDocument, entry.path)
    if (!resolved.ok) {
      applied.push({
        path: entry.path,
        mode: entry.mode ?? "merge",
        success: false,
        diagnostics: [
          {
            severity: "error",
            code: resolved.code,
            message: resolved.message,
          },
        ],
      })
      diagnostics.push({
        severity: "error",
        code: resolved.code,
        message: resolved.message,
        path: entry.path,
      })
      continue
    }

    const mode = entry.mode ?? "merge"
    const currentValue = getAtPath(nextDocument, resolved.lodashPath)
    const nextValue = resolvePatchValue(currentValue, entry.value, mode)

    try {
      setAtPath(nextDocument, resolved.lodashPath, nextValue)
      applied.push({ path: entry.path, mode, success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      applied.push({
        path: entry.path,
        mode,
        success: false,
        diagnostics: [
          {
            severity: "error",
            code: ECP_PATCH_ERROR_CODES.PATCH_APPLY_FAILED,
            message,
          },
        ],
      })
      diagnostics.push({
        severity: "error",
        code: ECP_PATCH_ERROR_CODES.PATCH_APPLY_FAILED,
        message,
        path: entry.path,
      })
    }
  }

  const validation = validateWorkflow(nextDocument)
  const success = diagnostics.length === 0 && validation.valid

  return {
    schema: "@executioncontrolprotocol.patch.result",
    version: LATEST_ECP_VERSION,
    success,
    targetSchema,
    result: nextDocument,
    patch,
    applied,
    validation,
    diagnostics: [...diagnostics, ...validation.errors, ...validation.warnings],
  }
}
