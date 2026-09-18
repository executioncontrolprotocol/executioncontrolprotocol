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

/** Repair loop for small / local coding models. @category Harness */
export const HARNESS_CODING_REPAIR_SMALL = {
  enabled: true,
  maxAttempts: 3,
  includeValidationErrors: true,
  includePriorOutput: true,
  strictGoalChecks: true,
} as const

/** Repair loop for medium cloud coding models (e.g. Sonnet). @category Harness */
export const HARNESS_CODING_REPAIR_MEDIUM = {
  enabled: true,
  maxAttempts: 2,
  includeValidationErrors: true,
  includePriorOutput: true,
  strictGoalChecks: false,
} as const

/** Repair loop for frontier coding models (e.g. Opus). @category Harness */
export const HARNESS_CODING_REPAIR_FRONTIER = {
  enabled: true,
  maxAttempts: 1,
  includeValidationErrors: true,
  includePriorOutput: true,
  strictGoalChecks: false,
} as const

/** Alias for {@link HARNESS_CODING_REPAIR_SMALL}. @category Harness */
export const HARNESS_CODING_REPAIR = HARNESS_CODING_REPAIR_SMALL

/** Chat repair for small models: reinject prior assistant output on retries. @category Harness */
export const HARNESS_CODING_CHAT_REPAIR_SMALL = {
  ...HARNESS_CODING_REPAIR_SMALL,
  includePriorOutput: true,
} as const

/** Chat repair for medium models. @category Harness */
export const HARNESS_CODING_CHAT_REPAIR_MEDIUM = {
  ...HARNESS_CODING_REPAIR_MEDIUM,
  includePriorOutput: true,
} as const

/** Chat repair for frontier models. @category Harness */
export const HARNESS_CODING_CHAT_REPAIR_FRONTIER = {
  ...HARNESS_CODING_REPAIR_FRONTIER,
  includePriorOutput: true,
} as const

/** Alias for {@link HARNESS_CODING_CHAT_REPAIR_SMALL}. @category Harness */
export const HARNESS_CODING_CHAT_REPAIR = HARNESS_CODING_CHAT_REPAIR_SMALL

const SHARED_CONTEXT_SMALL = {
  includeEnvironmentDescriptor: true,
  includeEncodedDescriptor: false,
  descriptorFormat: "@executioncontrolprotocol/format-json",
  environmentSummaryFormat: "plain" as const,
} as const

const SHARED_CONTEXT_CODING = {
  includeEnvironmentDescriptor: true,
  includeEncodedDescriptor: false,
  descriptorFormat: "@executioncontrolprotocol/format-json",
  environmentSummaryFormat: "fluent" as const,
} as const

/** Harness task ids (match {@link EVAL_HARNESS_NAMES} in `@executioncontrolprotocol/evals`). */
export const HARNESS_TASKS = {
  WORKFLOW_AUTHORING: "workflow-authoring",
  INTENT_CLASSIFICATION: "intent-classification",
  WORKFLOW_ASSISTANT: "workflow-assistant",
  CHAT: "chat",
} as const

export type HarnessTask = (typeof HARNESS_TASKS)[keyof typeof HARNESS_TASKS]

/**
 * Model-capability profile for Browser Coding harness scaffolding (prompts / repair).
 * Distinct from provider id — Anthropic Sonnet is medium; Opus is frontier; Ollama qwen is small.
 * @category Harness
 */
export type HarnessCodingProfile = "small" | "medium" | "frontier"

/** All coding harness profiles. @category Harness */
export const HARNESS_CODING_PROFILES = ["small", "medium", "frontier"] as const

const SMALL_PROMPT = {
  intent: "intent-classification-coding",
  assistant: "workflow-assistant-coding",
  create: "workflow-authoring-create-coding",
  patch: "workflow-authoring-patch-coding",
  changeSummary: "workflow-change-summary-coding",
} as const

const MEDIUM_PROMPT = {
  intent: "intent-classification-coding-medium",
  assistant: "workflow-assistant-coding-medium",
  create: "workflow-authoring-create-coding-medium",
  patch: "workflow-authoring-patch-coding-medium",
  changeSummary: "workflow-change-summary-coding-medium",
} as const

const FRONTIER_PROMPT = {
  intent: "intent-classification-coding-frontier",
  assistant: "workflow-assistant-coding-frontier",
  create: "workflow-authoring-create-coding-frontier",
  patch: "workflow-authoring-patch-coding-frontier",
  changeSummary: "workflow-change-summary-coding-frontier",
} as const

/**
 * Prompt fixture id map for a coding profile.
 * @category Harness
 */
export function codingPromptFixturesForProfile(profile: HarnessCodingProfile): {
  intent: string
  assistant: string
  create: string
  patch: string
  changeSummary: string
} {
  switch (profile) {
    case "medium":
      return { ...MEDIUM_PROMPT }
    case "frontier":
      return { ...FRONTIER_PROMPT }
    default:
      return { ...SMALL_PROMPT }
  }
}

/**
 * Repair defaults for a coding profile (task + chat).
 * @category Harness
 */
export function codingRepairForProfile(profile: HarnessCodingProfile): {
  task: {
    enabled: boolean
    maxAttempts: number
    includeValidationErrors: boolean
    includePriorOutput: boolean
    strictGoalChecks: boolean
  }
  chat: {
    enabled: boolean
    maxAttempts: number
    includeValidationErrors: boolean
    includePriorOutput: boolean
    strictGoalChecks: boolean
  }
} {
  switch (profile) {
    case "medium":
      return {
        task: { ...HARNESS_CODING_REPAIR_MEDIUM },
        chat: { ...HARNESS_CODING_CHAT_REPAIR_MEDIUM },
      }
    case "frontier":
      return {
        task: { ...HARNESS_CODING_REPAIR_FRONTIER },
        chat: { ...HARNESS_CODING_CHAT_REPAIR_FRONTIER },
      }
    default:
      return {
        task: { ...HARNESS_CODING_REPAIR_SMALL },
        chat: { ...HARNESS_CODING_CHAT_REPAIR_SMALL },
      }
  }
}

/**
 * Resolve effective coding profile from binding + optional generate model id.
 * Known Anthropic models override the binding so a shared demo env can stay on `small`
 * while Sonnet/Opus invokes pick medium/frontier scaffolding.
 * @category Harness
 */
export function resolveEffectiveCodingProfile(
  configured: HarnessCodingProfile | undefined,
  model?: string
): HarnessCodingProfile {
  const trimmed = model?.trim().toLowerCase() ?? ""
  if (trimmed.includes("opus")) return "frontier"
  if (trimmed.includes("sonnet") || trimmed.includes("haiku")) return "medium"
  return configured ?? "small"
}

/** Normalize a harnessProfile config value. @category Harness */
export function normalizeHarnessCodingProfile(value: unknown): HarnessCodingProfile {
  if (value === "medium" || value === "frontier" || value === "small") return value
  return "small"
}

function sharedContextForProfile(profile: HarnessCodingProfile) {
  return profile === "small" ? SHARED_CONTEXT_SMALL : SHARED_CONTEXT_CODING
}

function baseTaskConfig(profile: HarnessCodingProfile) {
  const prompts = codingPromptFixturesForProfile(profile)
  const repair = codingRepairForProfile(profile).task
  const sharedContext = sharedContextForProfile(profile)
  return {
    intent: {
      promptFixture: prompts.intent,
      output: {
        schema: "@executioncontrolprotocol.intent",
        format: HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
        validate: true,
      },
      context: { ...sharedContext },
      repair,
      trace: HARNESS_CODING_TRACE,
    },
    workflow: {
      promptFixtureCreate: prompts.create,
      promptFixturePatch: prompts.patch,
      output: {
        schema: "@executioncontrolprotocol.workflow",
        format: HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
        validate: true,
      },
      context: {
        ...sharedContext,
        includeRunContext: true,
        runContextFormat: "@executioncontrolprotocol/format-json",
      },
      repair,
      trace: HARNESS_CODING_TRACE,
    },
    assistant: {
      promptFixture: prompts.assistant,
      output: {
        schema: "@executioncontrolprotocol.harness.reply",
        format: HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
        validate: true,
      },
      context: {
        ...sharedContext,
        includeRunContext: true,
        runContextFormat: "@executioncontrolprotocol/format-json",
      },
      repair: { ...repair, safeReplyFallback: true },
      trace: HARNESS_CODING_TRACE,
    },
    chat: {
      promptFixtureChangeSummary: prompts.changeSummary,
      context: {
        ...sharedContext,
        promptPhase: "contextualized",
      },
      repair: codingRepairForProfile(profile).chat,
      trace: HARNESS_CODING_TRACE,
    },
  } as const
}

/** Full harness binding config for a task + profile. @category Harness */
export function getHarnessCodingConfig(
  task: HarnessTask,
  profile: HarnessCodingProfile = "small"
): Record<string, unknown> {
  const bases = baseTaskConfig(profile)
  switch (task) {
    case HARNESS_TASKS.INTENT_CLASSIFICATION:
      return { ...bases.intent, harnessProfile: profile }
    case HARNESS_TASKS.WORKFLOW_AUTHORING:
      return { ...bases.workflow, harnessProfile: profile }
    case HARNESS_TASKS.WORKFLOW_ASSISTANT:
      return { ...bases.assistant, harnessProfile: profile }
    case HARNESS_TASKS.CHAT:
      return { ...bases.chat, harnessProfile: profile }
    default:
      return { ...bases.workflow, harnessProfile: profile }
  }
}

function bindingFor(profile: HarnessCodingProfile) {
  return {
    harnessProfile: profile,
    trace: HARNESS_CODING_TRACE,
    context: sharedContextForProfile(profile),
  } as const
}

/** Env binding for small / local coding models. @category Harness */
export const HARNESS_CODING_BINDING_SMALL = bindingFor("small")

/** Env binding for medium cloud coding models. @category Harness */
export const HARNESS_CODING_BINDING_MEDIUM = bindingFor("medium")

/** Env binding for frontier coding models. @category Harness */
export const HARNESS_CODING_BINDING_FRONTIER = bindingFor("frontier")

/**
 * Default coding binding (small). Prefer explicit {@link HARNESS_CODING_BINDING_SMALL}.
 * @category Harness
 */
export const HARNESS_CODING_BINDING = HARNESS_CODING_BINDING_SMALL

/** Binding object for a profile. @category Harness */
export function codingHarnessBindingForProfile(profile: HarnessCodingProfile) {
  switch (profile) {
    case "medium":
      return HARNESS_CODING_BINDING_MEDIUM
    case "frontier":
      return HARNESS_CODING_BINDING_FRONTIER
    default:
      return HARNESS_CODING_BINDING_SMALL
  }
}
