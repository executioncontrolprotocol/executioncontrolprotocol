/**
 * Per-task Browser Nano harness binding defaults (shared repair/trace; task-specific output/context).
 * Single EQL output surface for eval matrix and browser demo — provider is hot-swapped at invoke.
 * @category Harness
 */
export const HARNESS_NANO_TRACE = {
  includePrompt: true,
  includeRawOutput: true,
  includeValidation: true,
} as const

/** Repair loop defaults for Browser Nano (1B model policy: normalize + deterministic recovery + repair). @category Harness */
export const HARNESS_NANO_REPAIR = {
  enabled: true,
  maxAttempts: 3,
  includeValidationErrors: true,
} as const

/** Repair loop experiment for multi-shot chat: reinject prior assistant output on retries. @category Harness */
export const HARNESS_NANO_CHAT_REPAIR = {
  ...HARNESS_NANO_REPAIR,
  includePriorOutput: true,
} as const

const SHARED_CONTEXT = {
  includeEnvironmentDescriptor: true,
  includeEncodedDescriptor: false,
  descriptorFormat: "@executioncontrolprotocol/format-eql",
  promptPhase: "contextualized",
} as const

/** Harness task ids (match {@link EVAL_HARNESS_NAMES} in `@executioncontrolprotocol/evals`). */
export const HARNESS_TASKS = {
  WORKFLOW_AUTHORING: "workflow-authoring",
  INTENT_CLASSIFICATION: "intent-classification",
  WORKFLOW_ASSISTANT: "workflow-assistant",
  CHAT: "chat",
} as const

export type HarnessTask = (typeof HARNESS_TASKS)[keyof typeof HARNESS_TASKS]

const NANO_INTENT = {
  promptFixture: "intent-classification",
  output: { schema: "@executioncontrolprotocol.intent", format: "@executioncontrolprotocol/format-eql", validate: true },
  context: {
    promptPhase: "unfiltered",
    includeEnvironmentDescriptor: false,
    includeEncodedDescriptor: false,
    descriptorFormat: "@executioncontrolprotocol/format-eql",
  },
  repair: HARNESS_NANO_REPAIR,
  trace: HARNESS_NANO_TRACE,
} as const

const NANO_WORKFLOW = {
  output: { schema: "@executioncontrolprotocol.workflow", format: "@executioncontrolprotocol/format-eql", validate: true },
  context: {
    ...SHARED_CONTEXT,
    includeRunContext: true,
    runContextFormat: "@executioncontrolprotocol/format-json",
  },
  repair: HARNESS_NANO_REPAIR,
  trace: HARNESS_NANO_TRACE,
} as const

const NANO_ASSISTANT = {
  promptFixture: "workflow-assistant",
  output: { schema: "@executioncontrolprotocol.harness.reply", format: "@executioncontrolprotocol/format-eql", validate: true },
  context: {
    ...SHARED_CONTEXT,
    includeRunContext: true,
    runContextFormat: "@executioncontrolprotocol/format-json",
  },
  repair: { ...HARNESS_NANO_REPAIR, safeReplyFallback: true },
  trace: HARNESS_NANO_TRACE,
} as const

const NANO_CHAT = {
  repair: HARNESS_NANO_REPAIR,
  trace: HARNESS_NANO_TRACE,
  context: { ...SHARED_CONTEXT },
} as const

/** Full harness binding config for a task (EQL outputs for all nano tasks). */
export function getHarnessNanoConfig(task: HarnessTask): Record<string, unknown> {
  switch (task) {
    case HARNESS_TASKS.INTENT_CLASSIFICATION:
      return { ...NANO_INTENT }
    case HARNESS_TASKS.WORKFLOW_AUTHORING:
      return { ...NANO_WORKFLOW }
    case HARNESS_TASKS.WORKFLOW_ASSISTANT:
      return { ...NANO_ASSISTANT }
    case HARNESS_TASKS.CHAT:
      return { ...NANO_CHAT }
    default:
      return { ...NANO_WORKFLOW }
  }
}

/** Loose env binding for nano eval matrix environments. */
export const HARNESS_NANO_BINDING = {
  repair: HARNESS_NANO_REPAIR,
  trace: HARNESS_NANO_TRACE,
  context: SHARED_CONTEXT,
} as const
