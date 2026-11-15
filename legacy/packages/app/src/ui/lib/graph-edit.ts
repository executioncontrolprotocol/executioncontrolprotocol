import type { WorkflowManifest } from "@executioncontrolprotocol/core/types"
import {
  WORKFLOW_ACCEPTS_NODE_ID,
  WORKFLOW_RETURNS_NODE_ID,
  type ReactFlowIoKind,
} from "../../graph/index.js"
import type { WorkflowIoField } from "./workflow-io.js"
import {
  applyPortConnection,
  OUTPUT_HANDLE_ID,
  removePortBinding,
  resolveAcceptsConnectionKey,
  resolvePortConnection,
} from "./step-connect.js"
import {
  findStepById,
  replaceStepById,
  rewriteWorkflowAsRefs,
  type StepConfigureSavePayload,
} from "./step-configure.js"
import {
  applyAcceptsConnection,
  applyReturnsConnection,
  removeReturnsProperty,
  renameAcceptsProperty,
  renameReturnsProperty,
  schemaFromIoFields,
  withWorkflowIoSchema,
  workflowContract,
  workflowIoPatchOps,
} from "./workflow-io.js"

/** Result of a graph mutation that may fail without writing. @category App */
export type GraphEditResult =
  | { ok: true; manifest: WorkflowManifest }
  | { ok: false; error: string }

/** Port connection payload from the React Flow canvas. @category App */
export interface ConnectPortsInput {
  /** Source node id (step id or accepts). */
  sourceStepId: string
  /** Target node id (step id or returns). */
  targetStepId: string
  /** Source handle id. */
  sourceHandle: string
  /** Target handle id. */
  targetHandle: string
  /** Optional schema copied onto an accepts/returns field. */
  valueSchema?: Record<string, unknown>
  /** Whether the target input is required. */
  targetRequired?: boolean
}

/**
 * Apply an output→input (or accepts/returns) connection to a workflow manifest.
 * @category App
 */
export function connectPorts(
  manifest: WorkflowManifest,
  connection: ConnectPortsInput
): GraphEditResult {
  if (connection.targetStepId === WORKFLOW_RETURNS_NODE_ID) {
    const sourceAs =
      connection.sourceStepId === WORKFLOW_ACCEPTS_NODE_ID
        ? connection.sourceHandle
        : findStepById(manifest.steps, connection.sourceStepId)?.as
    if (!sourceAs) {
      return { ok: false, error: "Set a store key (as) on the source step before connecting." }
    }
    return {
      ok: true,
      manifest: withWorkflowIoSchema(
        manifest,
        "returns",
        applyReturnsConnection(
          workflowContract(manifest).returns,
          sourceAs,
          connection.targetHandle,
          connection.valueSchema,
          connection.sourceHandle
        )
      ),
    }
  }

  if (connection.sourceStepId === WORKFLOW_ACCEPTS_NODE_ID) {
    const target = findStepById(manifest.steps, connection.targetStepId)
    if (!target) return { ok: false, error: "Step not found in workflow" }

    const acceptsKey = resolveAcceptsConnectionKey(
      connection.sourceHandle,
      connection.targetHandle
    )
    if (!acceptsKey) return { ok: false, error: "Missing accepts parameter name" }

    const resolved = resolvePortConnection({
      sourceAs: acceptsKey,
      sourceHandle: OUTPUT_HANDLE_ID,
      targetHandle: connection.targetHandle,
    })
    if (!resolved.ok) return { ok: false, error: resolved.error }

    const next = withWorkflowIoSchema(
      manifest,
      "accepts",
      applyAcceptsConnection(
        workflowContract(manifest).accepts,
        connection.sourceHandle,
        connection.targetHandle,
        connection.valueSchema,
        connection.targetRequired
      )
    )
    const nextTarget = findStepById(next.steps, connection.targetStepId)
    if (!nextTarget) return { ok: false, error: "Step not found in workflow" }
    return {
      ok: true,
      manifest: {
        ...next,
        steps: replaceStepById(
          next.steps,
          connection.targetStepId,
          applyPortConnection(nextTarget, resolved.paramName, resolved.refPath)
        ),
      },
    }
  }

  const target = findStepById(manifest.steps, connection.targetStepId)
  if (!target) return { ok: false, error: "Step not found in workflow" }

  const resolved = resolvePortConnection({
    sourceAs: findStepById(manifest.steps, connection.sourceStepId)?.as,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
  })
  if (!resolved.ok) return { ok: false, error: resolved.error }

  return {
    ok: true,
    manifest: {
      ...manifest,
      steps: replaceStepById(
        manifest.steps,
        connection.targetStepId,
        applyPortConnection(target, resolved.paramName, resolved.refPath)
      ),
    },
  }
}

/**
 * Remove a data-edge binding from a step or the returns node.
 * @category App
 */
export function disconnectPorts(
  manifest: WorkflowManifest,
  connection: { targetStepId: string; targetHandle: string }
): GraphEditResult {
  if (connection.targetStepId === WORKFLOW_RETURNS_NODE_ID) {
    return {
      ok: true,
      manifest: withWorkflowIoSchema(
        manifest,
        "returns",
        removeReturnsProperty(workflowContract(manifest).returns, connection.targetHandle)
      ),
    }
  }
  const target = findStepById(manifest.steps, connection.targetStepId)
  if (!target) return { ok: false, error: "Step not found in workflow" }
  return {
    ok: true,
    manifest: {
      ...manifest,
      steps: replaceStepById(
        manifest.steps,
        connection.targetStepId,
        removePortBinding(target, connection.targetHandle)
      ),
    },
  }
}

/**
 * Apply a step configure dialog payload (literals, removals, `as` key).
 * @category App
 */
export function applyStepConfigure(
  manifest: WorkflowManifest,
  stepId: string,
  payload: StepConfigureSavePayload
): GraphEditResult {
  const step = findStepById(manifest.steps, stepId)
  if (!step) return { ok: false, error: "Step not found in workflow" }
  const previousAs = step.as
  const previousInput = (step.input ?? {}) as Record<string, unknown>
  const nextInput: Record<string, unknown> = { ...previousInput }
  for (const key of payload.removedKeys) {
    delete nextInput[key]
  }
  for (const [param, value] of Object.entries(payload.literals)) {
    nextInput[param] = value
  }
  const nextStep = {
    ...step,
    input: nextInput as typeof step.input,
  }
  if (payload.asKey) {
    nextStep.as = payload.asKey
  } else {
    delete nextStep.as
  }
  let next: WorkflowManifest = {
    ...manifest,
    steps: replaceStepById(manifest.steps, stepId, nextStep),
  }
  if (previousAs && payload.asKey && previousAs !== payload.asKey) {
    next = {
      ...next,
      steps: rewriteWorkflowAsRefs(next.steps, previousAs, payload.asKey),
    }
  }
  return { ok: true, manifest: next }
}

/**
 * Apply an Inputs/Outputs configure dialog payload.
 * @category App
 */
/**
 * Inputs/Outputs configure payload (same shape as the dialog save).
 * @category App
 */
export interface IoConfigurePayload {
  /** Which workflow I/O schema is being edited. */
  kind: ReactFlowIoKind
  /** Resulting I/O fields. */
  fields: WorkflowIoField[]
  /** Property renames to rewrite refs / `.as`. */
  renames: Array<{ from: string; to: string }>
}

export function applyIoConfigure(
  manifest: WorkflowManifest,
  payload: IoConfigurePayload
): GraphEditResult {
  let next = withWorkflowIoSchema(manifest, payload.kind, schemaFromIoFields(payload.fields))
  if (payload.kind === "accepts") {
    for (const rename of payload.renames) {
      next = renameAcceptsProperty(next, rename.from, rename.to)
    }
  } else {
    for (const rename of payload.renames) {
      next = renameReturnsProperty(next, rename.from, rename.to)
    }
  }
  return { ok: true, manifest: next }
}

/**
 * Patch ops that turn `previous` into `next` for {@link renderPatchedManifest}.
 * @category App
 */
export function patchOpsForManifest(
  previous: WorkflowManifest,
  next: WorkflowManifest
): ReturnType<typeof workflowIoPatchOps> {
  return workflowIoPatchOps(previous, next)
}
