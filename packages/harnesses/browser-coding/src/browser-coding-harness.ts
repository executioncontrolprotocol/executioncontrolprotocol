import {
  catalogHarness,
  defineHarness,
  type HarnessCapabilityContext,
} from "@executioncontrolprotocol/core"
import {
  ECP_MODEL_GENERATE_INTERFACE,
  harnessEvaluateOutputSchema,
  probeContextSchema,
  type HarnessEvaluateOutput,
} from "@executioncontrolprotocol/types"
import { z } from "zod"
import {
  getHarnessCodingConfig,
  HARNESS_TASKS,
  normalizeHarnessCodingProfile,
  resolveEffectiveCodingProfile,
  type HarnessTask,
} from "./harness-coding-config.js"
import { invokeIntentClassificationCoding } from "./intent-classification-coding.js"
import { invokeMultiShotChatCoding } from "./multi-shot-chat.js"
import { invokeWorkflowAssistantCoding } from "./workflow-assistant-coding.js"
import { invokeWorkflowAuthoringCoding } from "./workflow-authoring-coding.js"

const harnessInputSchema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal(HARNESS_TASKS.INTENT_CLASSIFICATION),
    message: z.string(),
    model: z.string().optional(),
    hasBaselineWorkflow: z.boolean().optional(),
    hasProbeContext: z.boolean().optional(),
    probeContext: z.unknown().optional(),
    previousUserMessage: z.string().optional(),
  }),
  z.object({
    task: z.literal(HARNESS_TASKS.WORKFLOW_AUTHORING),
    request: z.string(),
    manifest: z.unknown().optional(),
    model: z.string().optional(),
  }),
  z.object({
    task: z.literal(HARNESS_TASKS.WORKFLOW_ASSISTANT),
    message: z.string(),
    runContext: z.unknown().optional(),
    model: z.string().optional(),
  }),
  z.object({
    task: z.literal(HARNESS_TASKS.CHAT),
    message: z.string(),
    manifest: z.unknown().optional(),
    runContext: z.unknown().optional(),
    probeContext: z.unknown().optional(),
    conversationSummary: z.string().optional(),
    conversationMessages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })
      )
      .optional(),
    model: z.string().optional(),
    files: z.array(z.unknown()).optional(),
  }),
])

/** Input for {@link BROWSER_CODING_HARNESS_ID} evaluate. @category Harness */
export type BrowserCodingHarnessInput = z.infer<typeof harnessInputSchema>

const harnessBindingSchema = z
  .object({
    harnessProfile: z.enum(["small", "medium", "frontier"]).optional(),
    repair: z.record(z.string(), z.unknown()).optional(),
    trace: z.record(z.string(), z.unknown()).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

function handlerContextForTask(
  task: HarnessTask,
  ctx: HarnessCapabilityContext<Record<string, unknown>>,
  model?: string
): HarnessCapabilityContext<Record<string, unknown>> {
  const configured = normalizeHarnessCodingProfile(ctx.config.harnessProfile)
  const profile = resolveEffectiveCodingProfile(configured, model)
  const taskConfig = getHarnessCodingConfig(task, profile) as Record<string, Record<string, unknown>>
  const envConfig = ctx.config as Record<string, Record<string, unknown> | undefined>
  return {
    ...ctx,
    config: {
      ...taskConfig,
      ...ctx.config,
      harnessProfile: profile,
      repair: { ...envConfig.repair, ...taskConfig.repair },
      trace: { ...taskConfig.trace, ...envConfig.trace },
      context: { ...taskConfig.context, ...envConfig.context },
    },
  }
}

const browserCodingHarnessDefinition = defineHarness("@executioncontrolprotocol", "harness-browser-coding")
  .withConfig(harnessBindingSchema)
  .withInput(harnessInputSchema)
  .withOutput(harnessEvaluateOutputSchema)
  .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
  .withHandler(async (input, ctx): Promise<HarnessEvaluateOutput> => {
    const taskCtx = handlerContextForTask(input.task, ctx, input.model)
    switch (input.task) {
      case HARNESS_TASKS.INTENT_CLASSIFICATION: {
        const probeParsed = probeContextSchema.safeParse(input.probeContext)
        const hasProbeFromContext =
          probeParsed.success && probeParsed.data.options.length > 0
        return invokeIntentClassificationCoding(
          {
            message: input.message,
            model: input.model,
            hasBaselineWorkflow: input.hasBaselineWorkflow,
            hasProbeContext: input.hasProbeContext === true || hasProbeFromContext,
            previousUserMessage: input.previousUserMessage,
          },
          taskCtx
        )
      }
      case HARNESS_TASKS.WORKFLOW_AUTHORING:
        return invokeWorkflowAuthoringCoding(
          { request: input.request, manifest: input.manifest, model: input.model },
          taskCtx
        )
      case HARNESS_TASKS.WORKFLOW_ASSISTANT:
        return invokeWorkflowAssistantCoding(
          { message: input.message, runContext: input.runContext, model: input.model },
          taskCtx
        )
      case HARNESS_TASKS.CHAT:
        return invokeMultiShotChatCoding(
          {
            message: input.message,
            manifest: input.manifest,
            runContext: input.runContext,
            probeContext: input.probeContext,
            conversationSummary: input.conversationSummary,
            conversationMessages: input.conversationMessages,
            model: input.model,
            files: input.files,
          },
          taskCtx
        )
      default: {
        const _exhaustive: never = input
        throw new Error(`Unknown harness task: ${String(_exhaustive)}`)
      }
    }
  })
  .build()

/** Register Browser Coding harness (`@executioncontrolprotocol/harness-browser-coding`). @category Harness */
export function registerBrowserCodingHarness(): void {
  catalogHarness(browserCodingHarnessDefinition)
}
