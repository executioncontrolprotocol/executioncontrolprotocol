import {
  catalogExtension,
  capabilityFor,
  defineExtension,
  ecpEncodeInputSchema,
  ecpEncodeResultSchema,
  encodeFailure,
  hook,
  validateWorkflow,
  type LifecycleContext,
  type UtilityCapabilityContext,
} from "@executioncontrolprotocol/core"
import {
  LATEST_ECP_VERSION,
  type EcpEncodeInput,
  type EncodeResult,
  type WorkflowManifest,
} from "@executioncontrolprotocol/types"
import { reactFlowRunProgress } from "./progress.js"
import type { ReactFlowEncodeOptions } from "./types.js"
import { workflowToReactFlow } from "./workflow-to-reactflow.js"

function encodeToReactFlow(
  input: EcpEncodeInput,
  ctx: UtilityCapabilityContext
): EncodeResult<string> {
  const sourceSchema = input.sourceSchema
  if (sourceSchema !== "@executioncontrolprotocol.workflow") {
    return encodeFailure({
      format: "reactflow",
      sourceSchema,
      diagnostics: [
        {
          severity: "error",
          code: "FORMAT_UNSUPPORTED_SOURCE_SCHEMA",
          message: "React Flow encoder supports @executioncontrolprotocol.workflow only",
        },
      ],
    })
  }

  const validation = validateWorkflow(input.source as WorkflowManifest)
  if (!validation.valid) {
    return encodeFailure({
      format: "reactflow",
      sourceSchema,
      validation,
      diagnostics: [...validation.errors, ...validation.warnings],
    })
  }

  const options = input.options as ReactFlowEncodeOptions | undefined
  const doc = workflowToReactFlow(input.source as WorkflowManifest, ctx.registry, options)

  return {
    schema: "@executioncontrolprotocol.encode.result",
    version: LATEST_ECP_VERSION,
    success: true,
    format: "reactflow",
    mediaType: "application/vnd.reactflow+json",
    sourceSchema,
    sourceVersion: input.sourceVersion,
    result: JSON.stringify(doc),
    diagnostics: [],
  }
}

function progressHook(
  event: Parameters<typeof hook>[0],
  handler: (ctx: LifecycleContext) => void
) {
  return hook(event, async (ctx) => {
    handler(ctx)
  })
}

/** React Flow format extension (encode + run progress hooks). @category Extensions */
export const formatReactflowExtension = defineExtension(
  "@executioncontrolprotocol",
  "format-reactflow"
)
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-reactflow", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withExecution("local")
      .withHandler((input, ctx) => {
        const utilityCtx = ctx as unknown as UtilityCapabilityContext
        return encodeToReactFlow(input as EcpEncodeInput, utilityCtx)
      }),
  ])
  .withHooks([
    progressHook("run:before", (ctx) => {
      reactFlowRunProgress.emitReset({ runId: ctx.run.id })
    }),
    progressHook("run:started", (ctx) => {
      reactFlowRunProgress.emitReset({ runId: ctx.run.id })
    }),
    progressHook("step:started", (ctx) => {
      if (ctx.step?.id) reactFlowRunProgress.emitStepStatus(ctx.step.id, "running")
    }),
    progressHook("step:before", (ctx) => {
      if (ctx.step?.id) reactFlowRunProgress.emitStepStatus(ctx.step.id, "pending")
    }),
    progressHook("step:completed", (ctx) => {
      if (ctx.step?.id) reactFlowRunProgress.emitStepStatus(ctx.step.id, "completed")
    }),
    progressHook("step:failed", (ctx) => {
      if (ctx.step?.id) reactFlowRunProgress.emitStepStatus(ctx.step.id, "failed")
    }),
    progressHook("run:completed", (ctx) => {
      reactFlowRunProgress.emitDone({ runId: ctx.run.id, outcome: "completed" })
    }),
    progressHook("run:failed", (ctx) => {
      reactFlowRunProgress.emitDone({ runId: ctx.run.id, outcome: "failed" })
    }),
    progressHook("run:cancelled", (ctx) => {
      reactFlowRunProgress.emitDone({ runId: ctx.run.id, outcome: "cancelled" })
    }),
  ])
  .build()

catalogExtension(formatReactflowExtension)
