import type { EnvironmentDescriptor, ValidationResult, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/types"
import { ECP_PATCH_ERROR_CODES } from "@executioncontrolprotocol/types"
import { buildStepIndex } from "../patch/step-index.js"
import { emptyValidationResult, workflowManifestSchema } from "./workflow-schema.js"
import { zodIssuesToValidationIssues } from "./zod-mapper.js"

function collectStepCommits(
  nodes: WorkflowNode[],
  commits: Map<string, string>
): void {
  for (const node of nodes) {
    if (!node.type || node.type === "step") {
      const step = node as import("@executioncontrolprotocol/types").StepNode
      if (step.as) {
        if (commits.has(step.as)) {
          commits.set(step.as, "duplicate")
        } else {
          commits.set(step.as, step.id)
        }
      }
    } else if (node.type === "parallel") {
      for (const branch of node.branches) collectStepCommits(branch, commits)
    } else if (node.type === "branch") {
      for (const b of node.branches) collectStepCommits(b.steps, commits)
    } else if (node.type === "loop") {
      collectStepCommits(node.steps, commits)
    }
  }
}

/**
 * Validate workflow manifest structure.
 * @category Validation
 */
export function validateWorkflow(
  manifest: WorkflowManifest,
  descriptor?: EnvironmentDescriptor
): ValidationResult {
  const result = emptyValidationResult(true)

  const parsed = workflowManifestSchema.safeParse(manifest)
  if (!parsed.success) {
    result.valid = false
    result.errors.push(...zodIssuesToValidationIssues(parsed.error.issues))
    return result
  }

  const stepIndex = buildStepIndex(manifest)
  for (const id of stepIndex.duplicates) {
    result.valid = false
    result.errors.push({
      code: ECP_PATCH_ERROR_CODES.DUPLICATE_STEP_ID,
      message: `Duplicate step id: ${id}`,
      path: `workflow.steps.${id}`,
    })
  }

  const commits = new Map<string, string>()
  collectStepCommits(manifest.steps, commits)
  for (const [key, val] of commits) {
    if (val === "duplicate") {
      result.valid = false
      result.errors.push({
        code: "DUPLICATE_COMMIT_AS",
        message: `Duplicate as key '${key}'`,
        path: `workflow.as.${key}`,
      })
    }
  }

  if (descriptor) {
    for (const node of manifest.steps) {
      validateNodeAgainstDescriptor(node, descriptor, result)
    }
  }

  let usesState = false
  function scanState(v: unknown): void {
    if (v && typeof v === "object" && "$state" in v) usesState = true
    if (v && typeof v === "object") {
      for (const c of Object.values(v)) scanState(c)
    }
  }
  for (const node of manifest.steps) {
    if ("input" in node && node.input) scanState(node.input)
  }
  if (usesState) {
    const hasStateControl = descriptor?.policies.some((p) =>
      p.id.includes("state-control")
    )
    if (!hasStateControl) {
      result.warnings.push({
        code: "MISSING_STATE_CONTROL_POLICY",
        message:
          "Workflow uses state() handles but environment has no @executioncontrolprotocol/state-control policy.",
        severity: "warning",
      })
    }
  }

  result.valid = result.errors.length === 0
  return result
}

function validateNodeAgainstDescriptor(
  node: WorkflowNode,
  descriptor: EnvironmentDescriptor,
  result: ValidationResult
): void {
  if (!node.type || node.type === "step") {
    const step = node as import("@executioncontrolprotocol/types").StepNode
    const found = descriptor.capabilities.some((c) => c.id === step.uses)
    if (!found) {
      result.valid = false
      result.errors.push({
        code: "UNKNOWN_CAPABILITY",
        message: `Capability ${step.uses} is not registered.`,
        path: `steps.${step.id}.uses`,
        suggestions: descriptor.capabilities
          .filter((c) => c.id.includes(String(step.uses).split(".")[1] ?? ""))
          .map((c) => c.id)
          .slice(0, 3),
      })
    }
    return
  }
  if (node.type === "parallel") {
    for (const b of node.branches) {
      for (const n of b) validateNodeAgainstDescriptor(n, descriptor, result)
    }
  } else if (node.type === "branch") {
    for (const b of node.branches) {
      for (const n of b.steps) validateNodeAgainstDescriptor(n, descriptor, result)
    }
  } else if (node.type === "loop") {
    for (const n of node.steps) validateNodeAgainstDescriptor(n, descriptor, result)
  }
}
