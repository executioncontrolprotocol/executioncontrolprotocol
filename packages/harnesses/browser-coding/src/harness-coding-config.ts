import { HARNESS_OUTPUT_FORMAT_TYPESCRIPT } from "@executioncontrolprotocol/core"

/**
 * Per-task Browser Coding harness binding defaults.
 * @category Harness
 */
export const HARNESS_CODING_TRACE = {
  includePrompt: true,
  includeRawOutput: true,
  includeValidation: true,
} as const

export const HARNESS_CODING_REPAIR = {
  enabled: true,
  maxAttempts: 3,
  includeValidationErrors: true,
} as const

const SHARED_CONTEXT = {
  includeEnvironmentDescriptor: true,
  includeEncodedDescriptor: false,
  descriptorFormat: "@executioncontrolprotocol/format-json",
} as const

/** Harness task ids (match {@link EVAL_HARNESS_NAMES} in `@executioncontrolprotocol/evals`). */
export const HARNESS_TASKS = {
  WORKFLOW_AUTHORING: "workflow-authoring",
  INTENT_CLASSIFICATION: "intent-classification",
  WORKFLOW_ASSISTANT: "workflow-assistant",
} as const

export type HarnessTask = (typeof HARNESS_TASKS)[keyof typeof HARNESS_TASKS]

/** Binding profile for coding eval matrix. */
export type HarnessCodingProfile = "coding"

const CODING_INTENT = {
  promptFixture: "intent-classification-coding",
  output: {
    schema: "@executioncontrolprotocol.intent",
    format: HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
    validate: true,
  },
  context: { ...SHARED_CONTEXT },
  repair: HARNESS_CODING_REPAIR,
  trace: HARNESS_CODING_TRACE,
} as const

const CODING_WORKFLOW = {
  output: {
    schema: "@executioncontrolprotocol.workflow",
    format: HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
    validate: true,
  },
  context: {
    ...SHARED_CONTEXT,
    includeRunContext: true,
    runContextFormat: "@executioncontrolprotocol/format-json",
  },
  repair: HARNESS_CODING_REPAIR,
  trace: HARNESS_CODING_TRACE,
} as const

const CODING_ASSISTANT = {
  promptFixture: "workflow-assistant-coding",
  output: {
    schema: "@executioncontrolprotocol.harness.reply",
    format: HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
    validate: true,
  },
  context: {
    ...SHARED_CONTEXT,
    includeRunContext: true,
    runContextFormat: "@executioncontrolprotocol/format-json",
  },
  repair: { ...HARNESS_CODING_REPAIR, safeReplyFallback: true },
  trace: HARNESS_CODING_TRACE,
} as const

/** Full harness binding config for a task (coding profile). @category Harness */
export function getHarnessCodingConfig(
  task: HarnessTask,
  _profile: HarnessCodingProfile = "coding"
): Record<string, unknown> {
  switch (task) {
    case HARNESS_TASKS.INTENT_CLASSIFICATION:
      return { ...CODING_INTENT }
    case HARNESS_TASKS.WORKFLOW_AUTHORING:
      return { ...CODING_WORKFLOW }
    case HARNESS_TASKS.WORKFLOW_ASSISTANT:
      return { ...CODING_ASSISTANT }
    default:
      return { ...CODING_WORKFLOW }
  }
}

/** Loose env binding for coding eval matrix environments. @category Harness */
export const HARNESS_CODING_BINDING = {
  harnessProfile: "coding" as HarnessCodingProfile,
  repair: HARNESS_CODING_REPAIR,
  trace: HARNESS_CODING_TRACE,
  context: SHARED_CONTEXT,
} as const
