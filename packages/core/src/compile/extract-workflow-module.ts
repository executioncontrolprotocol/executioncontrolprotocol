import { ECP_WORKFLOW_LOAD, EcpError } from "../types/index.js"
import type { RequirementsDocument, WorkflowManifest } from "../types/index.js"
import type { WorkflowBuilder } from "../workflow/builder.js"
import { inferRequirementsFromManifest } from "../workflow/requirements.js"

const WORKFLOW_EXPORT_NAMES = ["default", "workflow", "defaultWorkflow", "manifest"]

/** Loaded workflow file: portable manifest plus requirements. @category Compile */
export interface LoadedWorkflow {
  /** Portable workflow manifest (no secrets, no host config). */
  manifest: WorkflowManifest
  /** Declared and inferred requirements. */
  requirements: RequirementsDocument
  /** Present when the module default-exported a {@link WorkflowBuilder}. */
  builder?: WorkflowBuilder
}

function isWorkflowBuilder(value: unknown): value is WorkflowBuilder {
  return (
    typeof value === "object" &&
    value !== null &&
    "toManifest" in value &&
    typeof (value as WorkflowBuilder).toManifest === "function" &&
    "requirements" in value &&
    typeof (value as WorkflowBuilder).requirements === "function"
  )
}

function isWorkflowManifest(value: unknown): value is WorkflowManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    (value as WorkflowManifest).schema === "@executioncontrolprotocol.workflow"
  )
}

/**
 * Extract a {@link WorkflowBuilder} or manifest from evaluated module exports.
 * Workflow files must default-export a builder; JSON manifests have no builder.
 * @category Compile
 */
export function extractLoadedWorkflowFromModule(mod: Record<string, unknown>): LoadedWorkflow {
  for (const name of WORKFLOW_EXPORT_NAMES) {
    const exp = mod[name]
    if (!exp) continue
    const value = typeof exp === "function" ? (exp as () => unknown)() : exp
    if (isWorkflowBuilder(value)) {
      return {
        builder: value,
        manifest: value.toManifest(),
        requirements: value.requirements(),
      }
    }
    if (isWorkflowManifest(value)) {
      return {
        manifest: value,
        requirements: inferRequirementsFromManifest(value.steps),
      }
    }
  }
  throw new EcpError(
    ECP_WORKFLOW_LOAD,
    "Module must export a workflow builder or @executioncontrolprotocol.workflow manifest (default, workflow, or defaultWorkflow)"
  )
}

/** Extract a workflow manifest from evaluated module exports. @category Compile */
export function extractWorkflowFromModule(mod: Record<string, unknown>): WorkflowManifest {
  return extractLoadedWorkflowFromModule(mod).manifest
}
