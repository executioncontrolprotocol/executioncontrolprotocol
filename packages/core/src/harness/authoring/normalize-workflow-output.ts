import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"

/**
 * Normalize common model JSON mistakes before workflow validation.
 * @category Harness
 */
export function normalizeWorkflowDocumentCandidate(document: unknown): unknown {
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    return document
  }

  const record = document as Record<string, unknown>
  const workflow =
    record.workflow !== null && typeof record.workflow === "object" && !Array.isArray(record.workflow)
      ? (record.workflow as Record<string, unknown>)
      : undefined

  let steps = record.steps
  let workflowMeta = workflow

  if (workflow && Array.isArray(workflow.steps) && steps === undefined) {
    const { steps: nestedSteps, ...rest } = workflow
    steps = nestedSteps
    workflowMeta = rest
  }

  const normalized: Record<string, unknown> = {
    ...record,
    schema: record.schema ?? "@executioncontrolprotocol.workflow",
    version: record.version ?? LATEST_ECP_VERSION,
  }

  if (workflowMeta !== undefined) {
    normalized.workflow = workflowMeta
  }
  if (steps !== undefined) {
    normalized.steps = Array.isArray(steps)
      ? steps.map((step) => normalizeWorkflowStepCandidate(step))
      : steps
  }

  return normalized
}

function normalizeWorkflowStepCandidate(step: unknown): unknown {
  if (step === null || typeof step !== "object" || Array.isArray(step)) {
    return step
  }
  const record = step as Record<string, unknown>
  let next: Record<string, unknown> = record
  if (record.input === undefined && record.inputs !== undefined) {
    const { inputs, ...rest } = record
    next = { ...rest, input: inputs }
  }
  if (next.uses !== undefined && next.type === undefined) {
    return { type: "step", ...next }
  }
  return next
}
