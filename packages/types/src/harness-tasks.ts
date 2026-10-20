import { z } from "zod"
import { fileRefSchema } from "./file-ref.js"
import { harnessRunContextSchema } from "./harness-run-context.js"
import { probeContextSchema } from "./probe-context.js"

/** Shared harness task ids for browser and third-party harnesses. @category Harness */
export const HARNESS_TASK_IDS = {
  WORKFLOW_AUTHORING: "workflow-authoring",
  INTENT_CLASSIFICATION: "intent-classification",
  WORKFLOW_ASSISTANT: "workflow-assistant",
  CHAT: "chat",
} as const

/** Harness task id union. @category Harness */
export type HarnessTaskId = (typeof HARNESS_TASK_IDS)[keyof typeof HARNESS_TASK_IDS]

/** Pending host offer kind for intent classification. @category Harness */
export const pendingOfferKindSchema = z.enum(["run", "probe"])

/** Pending host offer kind. @category Harness */
export type PendingOfferKind = z.infer<typeof pendingOfferKindSchema>

/** Intent classification harness input. @category Harness */
export const harnessIntentClassificationInputSchema = z.object({
  /** User message to classify. */
  message: z.string(),
  /**
   * When the host has offered run or probe, the classifier should prefer
   * {@code offer-confirm} / {@code offer-decline} for accept/reject language.
   */
  pendingOffer: pendingOfferKindSchema.optional(),
  /** Optional model override. */
  model: z.string().optional(),
})

/** Workflow authoring harness input. @category Harness */
export const harnessWorkflowAuthoringInputSchema = z.object({
  /** Authoring request text. */
  request: z.string(),
  /** Baseline manifest for patch mode. */
  manifest: z.unknown().optional(),
  /** Optional live probe context when completing after clarify. */
  probeContext: probeContextSchema.optional(),
  /** Optional model override. */
  model: z.string().optional(),
})

/** Multi-shot chat harness input (intent shot + contextualized execution). @category Harness */
export const harnessChatInputSchema = z.object({
  /** User message. */
  message: z.string(),
  /** Baseline manifest for patch routing. */
  manifest: z.unknown().optional(),
  /** Optional run context for assistant routing. */
  runContext: harnessRunContextSchema.optional(),
  /** Optional live probe context for clarify / complete turns. */
  probeContext: probeContextSchema.optional(),
  /** Rolling conversation summary supplied by the caller between turns. */
  conversationSummary: z.string().optional(),
  /**
   * Prior chat turns (user/assistant) for providers that accept generate `messages`.
   * Does not include the current {@link harnessChatInputSchema} message.
   */
  conversationMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  /** Optional model override. */
  model: z.string().optional(),
  /** Optional multimodal file refs forwarded to the provider generate shot. */
  files: z.array(fileRefSchema()).optional(),
  /**
   * When the host has offered run or probe, intent classification should prefer
   * {@code offer-confirm} / {@code offer-decline}.
   */
  pendingOffer: pendingOfferKindSchema.optional(),
})

/** Multi-shot chat input type. @category Harness */
export type HarnessChatInput = z.infer<typeof harnessChatInputSchema>

/** Unified workflow assistant harness input. @category Harness */
export const harnessWorkflowAssistantInputSchema = z.object({
  /** User message. */
  message: z.string(),
  /** Optional model override. */
  model: z.string().optional(),
  /** Optional run context for run-aware Q&A. */
  runContext: harnessRunContextSchema.optional(),
  /** Optional live probe context for clarify turns. */
  probeContext: probeContextSchema.optional(),
  /** Optional workflow manifest summary context. */
  workflow: z.record(z.string(), z.unknown()).optional(),
})

/** Intent classification input type. @category Harness */
export type HarnessIntentClassificationInput = z.infer<
  typeof harnessIntentClassificationInputSchema
>

/** Workflow authoring input type. @category Harness */
export type HarnessWorkflowAuthoringInput = z.infer<typeof harnessWorkflowAuthoringInputSchema>

/** Workflow assistant input type. @category Harness */
export type HarnessWorkflowAssistantInput = z.infer<typeof harnessWorkflowAssistantInputSchema>
