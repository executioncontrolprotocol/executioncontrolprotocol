import type { RunResult, WorkflowManifest } from "@executioncontrolprotocol/types"
import {
  pickWorkflowReturns,
  validateAgainstJsonSchema,
} from "../schema/json-schema.js"

/**
 * Validate run `input` against `workflow.accepts`.
 * @category Schema
 */
export function validateWorkflowAcceptsInput(
  manifest: WorkflowManifest,
  input: Record<string, unknown> | undefined
): { ok: true } | { ok: false; message: string } {
  const result = validateAgainstJsonSchema(manifest.workflow.accepts, input ?? {})
  if (result.ok) return { ok: true }
  return { ok: false, message: `Workflow accepts validation failed: ${result.errors.join("; ")}` }
}

/**
 * Attach `output` from `workflow.returns` and validate required properties.
 * Invalid returns mark the run failed.
 * @category Schema
 */
export function applyWorkflowReturns(
  manifest: WorkflowManifest,
  result: RunResult,
  state: Record<string, unknown>
): RunResult {
  const output = pickWorkflowReturns(manifest.workflow.returns, state)
  if (output === undefined) return result

  const next: RunResult = { ...result, output }
  if (result.run.status !== "completed") return next

  const check = validateAgainstJsonSchema(manifest.workflow.returns, output)
  if (!check.ok) {
    return {
      ...next,
      run: { ...result.run, status: "failed" },
    }
  }
  return next
}
