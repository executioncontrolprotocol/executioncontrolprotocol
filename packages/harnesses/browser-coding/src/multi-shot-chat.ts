import type { HarnessCapabilityContext } from "@executioncontrolprotocol/core"
import {
  type EcpIntent,
  type HarnessEvaluateOutput,
  type HarnessInvokeResult,
  type HarnessReply,
  type HarnessShotTrace,
  type WorkflowManifest,
} from "@executioncontrolprotocol/types"
import { intentRoutesToAuthoring } from "@executioncontrolprotocol/harnesses-browser-nano"
import {
  HARNESS_TASKS,
  getHarnessCodingConfig,
  HARNESS_CODING_CHAT_REPAIR,
} from "./harness-coding-config.js"
import { BROWSER_CODING_HARNESS_ID } from "./harness-ids.js"
import { invokeIntentClassificationCoding } from "./intent-classification-coding.js"
import { invokeWorkflowAssistantCoding } from "./workflow-assistant-coding.js"
import { invokeWorkflowAuthoringCoding } from "./workflow-authoring-coding.js"

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
 * Multi-shot chat orchestrator for Browser Coding: intent shot, then authoring or assistant.
 * @category Harness
 */
export async function invokeMultiShotChatCoding(
  input: {
    message: string
    manifest?: unknown
    runContext?: unknown
    conversationSummary?: string
    model?: string
  },
  ctx: HarnessCapabilityContext<Record<string, unknown>>
): Promise<HarnessEvaluateOutput> {
  const intentDefaults = getHarnessCodingConfig(HARNESS_TASKS.INTENT_CLASSIFICATION) as Record<
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
        ...HARNESS_CODING_CHAT_REPAIR,
      },
      trace: { ...intentDefaults.trace, ...(ctx.config.trace as Record<string, unknown> | undefined) },
    },
  }

  const intentResult = await invokeIntentClassificationCoding(
    { message: input.message, model: input.model },
    intentCtx
  )
  const classifiedIntent = intentResult.artifact as EcpIntent

  const buildTaskConfig = (
    task: typeof HARNESS_TASKS.WORKFLOW_AUTHORING | typeof HARNESS_TASKS.WORKFLOW_ASSISTANT
  ): Record<string, unknown> => {
    const taskDefaults = getHarnessCodingConfig(task) as Record<string, Record<string, unknown>>
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
        ...HARNESS_CODING_CHAT_REPAIR,
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
    const authoringResult = await invokeWorkflowAuthoringCoding(
      {
        request: input.message,
        manifest: isPatch ? input.manifest : undefined,
        model: input.model,
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
    const assistantResult = await invokeWorkflowAssistantCoding(
      {
        message: input.message,
        runContext: input.runContext,
        model: input.model,
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
    harness: BROWSER_CODING_HARNESS_ID,
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
