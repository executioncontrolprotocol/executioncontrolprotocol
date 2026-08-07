import type { HarnessCapabilityContext } from "@executioncontrolprotocol/core"
import {
  ECP_INTENT_VALUES,
  type EcpIntent,
  type HarnessEvaluateOutput,
  type HarnessInvokeResult,
  type HarnessReply,
  type HarnessShotTrace,
  type WorkflowManifest,
} from "@executioncontrolprotocol/types"
import { HARNESS_TASKS, getHarnessNanoConfig, HARNESS_NANO_CHAT_REPAIR } from "./harness-nano-config.js"
import { BROWSER_NANO_HARNESS_ID } from "./harness-ids.js"
import { invokeIntentClassification } from "./intent-classification.js"
import { invokeWorkflowAssistant } from "./workflow-assistant.js"
import { invokeWorkflowAuthoring } from "./workflow-authoring.js"

/** Route classified intent to workflow authoring vs assistant. @category Harness */
export function intentRoutesToAuthoring(intent: EcpIntent["intent"]): boolean {
  return (
    intent === ECP_INTENT_VALUES.WORKFLOW_CREATE ||
    intent === ECP_INTENT_VALUES.WORKFLOW_PATCH
  )
}

function shotFromTrace(
  task: string,
  promptPhase: "unfiltered" | "contextualized",
  result: HarnessEvaluateOutput,
  outputSchema?: string
): HarnessShotTrace {
  return {
    task,
    promptPhase,
    ...(result.trace.prompt ? { prompt: result.trace.prompt } : {}),
    ...(result.trace.rawOutput ? { rawOutput: result.trace.rawOutput } : {}),
    ...(result.trace.repairAttempts ? { repairAttempts: result.trace.repairAttempts } : {}),
    ...(outputSchema ? { outputSchema } : {}),
  }
}

/**
 * Multi-shot chat orchestrator: unfiltered intent shot, then contextualized execution shot.
 * @category Harness
 */
export async function invokeMultiShotChat(
  input: {
    message: string
    manifest?: unknown
    runContext?: unknown
    conversationSummary?: string
    model?: string
  },
  ctx: HarnessCapabilityContext<Record<string, unknown>>
): Promise<HarnessEvaluateOutput> {
  const intentDefaults = getHarnessNanoConfig(HARNESS_TASKS.INTENT_CLASSIFICATION) as Record<
    string,
    Record<string, unknown>
  >
  const intentCtx: HarnessCapabilityContext<Record<string, unknown>> = {
    ...ctx,
    config: {
      ...intentDefaults,
      ...ctx.config,
      context: {
        ...intentDefaults.context,
        ...(ctx.config.context as Record<string, unknown> | undefined),
        promptPhase: "unfiltered",
        includeEnvironmentDescriptor: false,
        includeEncodedDescriptor: false,
      },
      repair: {
        ...intentDefaults.repair,
        ...(ctx.config.repair as Record<string, unknown> | undefined),
        ...HARNESS_NANO_CHAT_REPAIR,
      },
      trace: { ...intentDefaults.trace, ...(ctx.config.trace as Record<string, unknown> | undefined) },
    },
  }

  const intentResult = await invokeIntentClassification(
    { message: input.message, model: input.model },
    intentCtx
  )
  const classifiedIntent = intentResult.artifact as EcpIntent

  const buildTaskConfig = (
    task: typeof HARNESS_TASKS.WORKFLOW_AUTHORING | typeof HARNESS_TASKS.WORKFLOW_ASSISTANT
  ): Record<string, unknown> => {
    const taskDefaults = getHarnessNanoConfig(task) as Record<string, Record<string, unknown>>
    return {
      ...taskDefaults,
      ...ctx.config,
      context: {
        ...taskDefaults.context,
        ...(ctx.config.context as Record<string, unknown> | undefined),
        promptPhase: "contextualized",
      },
      repair: {
        ...taskDefaults.repair,
        ...(ctx.config.repair as Record<string, unknown> | undefined),
        ...HARNESS_NANO_CHAT_REPAIR,
      },
      trace: { ...taskDefaults.trace, ...(ctx.config.trace as Record<string, unknown> | undefined) },
    }
  }

  const shots: HarnessShotTrace[] = [
    shotFromTrace(
      HARNESS_TASKS.INTENT_CLASSIFICATION,
      "unfiltered",
      intentResult,
      "@executioncontrolprotocol.intent"
    ),
  ]

  let finalResult: HarnessEvaluateOutput

  if (intentRoutesToAuthoring(classifiedIntent.intent)) {
    const isPatch = input.manifest !== undefined
    const authoringResult = await invokeWorkflowAuthoring(
      {
        request: input.message,
        manifest: isPatch ? input.manifest : undefined,
        model: input.model,
        classifiedIntent,
        conversationSummary: input.conversationSummary,
      },
      { ...ctx, config: buildTaskConfig(HARNESS_TASKS.WORKFLOW_AUTHORING) }
    )
    shots.push(
      shotFromTrace(
        HARNESS_TASKS.WORKFLOW_AUTHORING,
        "contextualized",
        authoringResult,
        isPatch ? "@executioncontrolprotocol.patch" : "@executioncontrolprotocol.workflow"
      )
    )
    finalResult = authoringResult
  } else {
    const assistantResult = await invokeWorkflowAssistant(
      {
        message: input.message,
        runContext: input.runContext,
        workflow: input.manifest as Record<string, unknown> | undefined,
        model: input.model,
        classifiedIntent,
        conversationSummary: input.conversationSummary,
      },
      { ...ctx, config: buildTaskConfig(HARNESS_TASKS.WORKFLOW_ASSISTANT) }
    )
    shots.push(
      shotFromTrace(
        HARNESS_TASKS.WORKFLOW_ASSISTANT,
        "contextualized",
        assistantResult,
        "@executioncontrolprotocol.harness.reply"
      )
    )
    finalResult = assistantResult
  }

  const trace: HarnessInvokeResult["trace"] = {
    ...finalResult.trace,
    harness: BROWSER_NANO_HARNESS_ID,
    orchestration: "multi-shot",
    classifiedIntent: {
      intent: classifiedIntent.intent,
      ...(classifiedIntent.topic ? { topic: classifiedIntent.topic } : {}),
      ...(classifiedIntent.summary ? { summary: classifiedIntent.summary } : {}),
    },
    shots,
  }

  return {
    artifact: finalResult.artifact,
    raw: finalResult.raw,
    ...(finalResult.validation ? { validation: finalResult.validation } : {}),
    trace,
  }
}

/** Extract assistant answer text from a chat harness result when applicable. @category Harness */
export function chatResultAnswer(result: HarnessEvaluateOutput): string | undefined {
  const artifact = result.artifact
  if (
    artifact !== null &&
    typeof artifact === "object" &&
    "answer" in artifact &&
    typeof (artifact as HarnessReply).answer === "string"
  ) {
    return (artifact as HarnessReply).answer
  }
  return undefined
}

/** Extract workflow manifest from a chat harness result when applicable. @category Harness */
export function chatResultWorkflow(result: HarnessEvaluateOutput): WorkflowManifest | undefined {
  const artifact = result.artifact
  if (
    artifact !== null &&
    typeof artifact === "object" &&
    "schema" in artifact &&
    (artifact as { schema?: string }).schema === "@executioncontrolprotocol.workflow"
  ) {
    return artifact as WorkflowManifest
  }
  return undefined
}
