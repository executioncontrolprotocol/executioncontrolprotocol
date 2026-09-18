import { compileWorkflowSource } from "@executioncontrolprotocol/core/compile"
import {
  callModelGenerate,
  collectModelOutputFeedback,
  collectValidationFeedback,
  defineHarness,
  DESCRIBE_AUTHORING_CAPABILITIES_QUERY,
  formatEnvironmentSummaryLines,
  formatStructuredRepairForModel,
  HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
  inferResponseFormatFromFormatter,
  isRepairFeedbackEcho,
  renderWorkflowToFluent,
  runModelRepairLoop,
  stripHarnessTypeScriptOutput,
  summarizeEnvironmentDescriptor,
  type EnvironmentSummaryFormat,
  type HarnessCapabilityContext,
  type CompactEnvironmentSummary,
} from "@executioncontrolprotocol/core"
import {
  buildRequestCapabilityHintLines,
  collectCreateCapabilityFeedback,
  collectCreateStepCountFeedback,
} from "@executioncontrolprotocol/harnesses-browser-nano"
import {
  buildFluentPatchHintLines,
  collectFluentCompileErrorFeedback,
  collectCreateWorkflowIoFeedback,
  collectFluentPatchGoalFeedback,
  restoreBaselineIoOnClearKeepRequest,
} from "./fluent-patch-hints.js"
import {
  ECP_MODEL_GENERATE_INTERFACE,
  fileRefSchema,
  harnessEvaluateOutputSchema,
  type HarnessEvaluateOutput,
  type HarnessInvokeResult,
  type HarnessOperationFeedback,
  type WorkflowManifest,
} from "@executioncontrolprotocol/types"
import { z } from "zod"
import { BROWSER_CODING_HARNESS_ID } from "./harness-ids.js"
import {
  buildCodingRepairGenerateMessages,
  codingConversationMessageSchema,
  normalizeCodingConversationMessages,
  type CodingConversationMessage,
} from "./conversation-messages.js"
import {
  buildCodingRepairHint,
  buildCodingSystemPrompt,
  CODING_PROMPT_FIXTURE_IDS,
} from "./prompts/index.js"
import {
  normalizeHarnessCodingProfile,
  resolveEffectiveCodingProfile,
} from "./harness-coding-config.js"

function existingCapabilityUses(manifest: WorkflowManifest | undefined): Set<string> {
  const uses = new Set<string>()
  if (!manifest) return uses
  for (const node of manifest.steps ?? []) {
    if ("uses" in node && typeof node.uses === "string") {
      uses.add(node.uses)
    }
  }
  return uses
}

function resolveEnvironmentSummaryFormat(
  value: unknown,
  profile: "small" | "medium" | "frontier"
): EnvironmentSummaryFormat {
  if (value === "fluent" || value === "plain" || value === "eql-create" || value === "eql-patch") {
    return value
  }
  return profile === "small" ? "plain" : "fluent"
}

const outputConfigSchema = z.object({
  schema: z.string().default("@executioncontrolprotocol.workflow"),
  format: z.string().default(HARNESS_OUTPUT_FORMAT_TYPESCRIPT),
  validate: z.boolean().default(true),
})

const harnessConfigSchema = z.object({
  promptFixture: z.string().optional(),
  system: z.string().optional(),
  harnessProfile: z.enum(["small", "medium", "frontier"]).optional(),
  context: z
    .object({
      includeEnvironmentDescriptor: z.boolean().default(true),
      includeEncodedDescriptor: z.boolean().default(false),
      descriptorFormat: z.string().default("@executioncontrolprotocol/format-json"),
      environmentSummaryFormat: z
        .enum(["plain", "fluent", "eql-create", "eql-patch"])
        .optional(),
    })
    .default({}),
  output: outputConfigSchema.default({}),
  repair: z
    .object({
      enabled: z.boolean().default(true),
      maxAttempts: z.number().default(1),
      includeValidationErrors: z.boolean().default(true),
      includePriorOutput: z.boolean().default(false),
      strictGoalChecks: z.boolean().default(true),
    })
    .default({}),
  trace: z
    .object({
      includePrompt: z.boolean().default(true),
      includeRawOutput: z.boolean().default(true),
      includeValidation: z.boolean().default(true),
      includeRepairAttempts: z.boolean().default(true),
    })
    .default({}),
})

const harnessInputSchema = z.object({
  request: z.string(),
  manifest: z.unknown().optional(),
  model: z.string().optional(),
  files: z.array(fileRefSchema()).optional(),
  conversationMessages: z.array(codingConversationMessageSchema).optional(),
})

const codingWorkflowAuthoringHarness = defineHarness("@executioncontrolprotocol", "browser-coding-workflow-authoring")
  .withConfig(harnessConfigSchema)
  .withInput(harnessInputSchema)
  .withOutput(harnessEvaluateOutputSchema)
  .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
  .withHandler(async (input, ctx) => {
    const config = ctx.config
    const isPatch = input.manifest !== undefined
    const format = config.output.format
    const baselineManifest = isPatch
      ? (input.manifest as WorkflowManifest | undefined)
      : undefined
    const profile = resolveEffectiveCodingProfile(
      normalizeHarnessCodingProfile(config.harnessProfile),
      input.model
    )
    const conversationMessages = normalizeCodingConversationMessages(input.conversationMessages)
    const useRepairTurns = config.repair.includePriorOutput === true
    const strictGoalChecks = config.repair.strictGoalChecks !== false

    const promptFixtureId =
      (typeof config.promptFixture === "string" ? config.promptFixture : undefined) ??
      (isPatch
        ? (typeof config.promptFixturePatch === "string"
            ? config.promptFixturePatch
            : CODING_PROMPT_FIXTURE_IDS.WORKFLOW_AUTHORING_PATCH)
        : (typeof config.promptFixtureCreate === "string"
            ? config.promptFixtureCreate
            : CODING_PROMPT_FIXTURE_IDS.WORKFLOW_AUTHORING_CREATE))

    const system =
      config.system ?? buildCodingSystemPrompt(promptFixtureId)

    let environmentSummaryLines = ""
    let environmentSummary: CompactEnvironmentSummary | undefined
    const envFormat = resolveEnvironmentSummaryFormat(
      config.context.environmentSummaryFormat,
      profile
    )

    if (config.context.includeEnvironmentDescriptor) {
      const descriptor = await ctx.ecp.describe(DESCRIBE_AUTHORING_CAPABILITIES_QUERY)
      environmentSummary = summarizeEnvironmentDescriptor(descriptor)
      environmentSummaryLines = formatEnvironmentSummaryLines(environmentSummary, {
        format: envFormat,
        existingCapabilityUses: isPatch
          ? existingCapabilityUses(baselineManifest)
          : undefined,
      }).join("\n")
    }

    const buildAuthoringPrompt = () => {
      const requestHints =
        environmentSummary !== undefined
          ? buildRequestCapabilityHintLines(input.request, environmentSummary, {
              mode: isPatch ? "patch" : "create",
              surface: "fluent",
            })
          : []
      const patchHints =
        isPatch && baselineManifest
          ? buildFluentPatchHintLines(
              input.request,
              baselineManifest,
              environmentSummary?.capabilities.map((c) => c.id)
            )
          : []
      const envBlock = environmentSummaryLines
        ? ["Environment capabilities:", environmentSummaryLines, ""]
        : []

      const importHint =
        'Required import: import { workflow, step, ref } from "@executioncontrolprotocol/core" (include ref when any step uses ref()).'

      const lines = isPatch
        ? [
            `User request: ${input.request}`,
            importHint,
            ...(patchHints.length > 0 ? ["Fluent edit rules:", ...patchHints, ""] : []),
            "Current workflow:",
            baselineManifest ? renderWorkflowToFluent(baselineManifest) : "",
            ...requestHints,
            ...envBlock,
          ]
        : [
            `User request: ${input.request}`,
            importHint,
            ...requestHints,
            ...envBlock,
          ]

      return lines.filter((l) => l.length > 0).join("\n")
    }

    const buildLegacyRepairPrompt = (repairText: string, priorRaw?: string) => {
      const parts = [
        buildAuthoringPrompt(),
        "Previous attempt failed. Output only corrected TypeScript:",
      ]
      if (priorRaw?.trim()) {
        parts.push("Previous TypeScript module:", priorRaw.trim())
      }
      parts.push(repairText, buildCodingRepairHint(promptFixtureId))
      return parts.filter((l) => l.length > 0).join("\n")
    }

    const buildRepairUserPrompt = (repairText: string) => {
      return [
        "Fix the previous TypeScript module. Do not rewrite from scratch unless required.",
        "Do not echo validation errors. Return corrected TypeScript only.",
        repairText,
        buildCodingRepairHint(promptFixtureId),
      ]
        .filter((l) => l.length > 0)
        .join("\n")
    }

    const responseFormat = inferResponseFormatFromFormatter(format)
    const maxAttempts = config.repair.enabled ? 1 + config.repair.maxAttempts : 1
    const originalUserPrompt = buildAuthoringPrompt()
    let lastPrompt = originalUserPrompt
    let lastMessages: CodingConversationMessage[] | undefined

    const loopResult = await runModelRepairLoop({
      maxAttempts,
      generate: async ({ attempt, priorFeedback, priorRaw }) => {
        const repairText =
          attempt > 0 && config.repair.includeValidationErrors
            ? formatStructuredRepairForModel(priorFeedback, "typescript")
            : undefined

        if (attempt > 0 && repairText && useRepairTurns && priorRaw) {
          lastMessages = buildCodingRepairGenerateMessages({
            conversationMessages,
            originalUserPrompt,
            priorRaw,
          })
          lastPrompt = buildRepairUserPrompt(repairText)
          const generated = await callModelGenerate(
            ctx.uses,
            {
              prompt: lastPrompt,
              system,
              model: input.model,
              responseFormat,
              files: input.files,
              messages: lastMessages,
            },
            ctx.capabilityContext,
            format
          )
          return { raw: stripHarnessTypeScriptOutput(generated.text) }
        }

        if (attempt > 0 && repairText) {
          lastMessages = conversationMessages.length > 0 ? conversationMessages : undefined
          lastPrompt = buildLegacyRepairPrompt(repairText, priorRaw)
        } else {
          lastMessages = conversationMessages.length > 0 ? conversationMessages : undefined
          lastPrompt = originalUserPrompt
        }

        const generated = await callModelGenerate(
          ctx.uses,
          {
            prompt: lastPrompt,
            system,
            model: input.model,
            responseFormat,
            files: input.files,
            ...(lastMessages ? { messages: lastMessages } : {}),
          },
          ctx.capabilityContext,
          format
        )
        return { raw: stripHarnessTypeScriptOutput(generated.text) }
      },
      evaluate: async (raw, { priorFeedback }) => {
        const feedback: HarnessOperationFeedback[] = []
        const structuredPrior = formatStructuredRepairForModel(priorFeedback, "typescript")
        if (
          config.repair.includeValidationErrors &&
          isRepairFeedbackEcho(raw, structuredPrior)
        ) {
          return {
            success: false,
            feedback: [
              collectModelOutputFeedback(
                "Output echoed validation errors. Return only the TypeScript workflow module."
              ),
            ],
          }
        }

        const compiled = await compileWorkflowSource({
          source: raw,
          filename: isPatch ? "workflow-patch.ts" : "workflow-create.ts",
          // Browser blob eval cannot resolve package specifiers; Node compile ignores this.
          resolveImports: "browser-global",
        })

        if (!compiled.ok || !compiled.manifest) {
          const msg =
            compiled.compileErrors?.map((e) => e.message).join("; ") ??
            "TypeScript compile failed"
          feedback.push(collectModelOutputFeedback(msg))
          const fluentCompile = collectFluentCompileErrorFeedback(msg)
          if (fluentCompile) {
            feedback.push(...fluentCompile)
          }
          if (compiled.validation) {
            feedback.push(collectValidationFeedback(compiled.validation))
          }
          return { success: false, feedback }
        }

        const artifact: WorkflowManifest = isPatch
          ? restoreBaselineIoOnClearKeepRequest(
              input.request,
              compiled.manifest,
              baselineManifest
            )
          : compiled.manifest

        if (config.output.validate) {
          const validation = await ctx.ecp.validate(artifact)
          feedback.push(collectValidationFeedback(validation))
          if (!validation.valid) {
            return { success: false, feedback }
          }
        }

        if (!isPatch && environmentSummary) {
          const capFeedback = collectCreateCapabilityFeedback(
            input.request,
            environmentSummary,
            artifact,
            "fluent"
          )
          if (capFeedback && strictGoalChecks) {
            return { success: false, feedback: [...feedback, ...capFeedback] }
          }
          const stepCountFeedback = collectCreateStepCountFeedback(
            input.request,
            artifact,
            undefined,
            "fluent"
          )
          if (stepCountFeedback && strictGoalChecks) {
            return { success: false, feedback: [...feedback, ...stepCountFeedback] }
          }
          const ioFeedback = collectCreateWorkflowIoFeedback(input.request, artifact)
          if (ioFeedback && strictGoalChecks) {
            return { success: false, feedback: [...feedback, ...ioFeedback] }
          }
        }
        if (isPatch && environmentSummary) {
          const patchFeedback = collectFluentPatchGoalFeedback(
            input.request,
            artifact,
            environmentSummary,
            baselineManifest
          )
          if (patchFeedback && strictGoalChecks) {
            return { success: false, feedback: [...feedback, ...patchFeedback] }
          }
        }

        return { success: true, artifact, feedback }
      },
    })

    const validation = await ctx.ecp.validate(loopResult.artifact as WorkflowManifest)

    const trace: HarnessInvokeResult["trace"] & Record<string, unknown> = {
      harness: BROWSER_CODING_HARNESS_ID,
      provider: ctx.uses,
      model: input.model,
      outputSchema: "@executioncontrolprotocol.workflow",
      outputFormat: format,
      decodeSucceeded: true,
      validationSucceeded: validation.valid,
      ...(config.trace.includePrompt ? { prompt: lastPrompt } : {}),
      ...(config.trace.includeRawOutput ? { rawOutput: loopResult.raw } : {}),
      ...(config.trace.includeRepairAttempts ? { repairAttempts: loopResult.attempts } : {}),
    }

    return {
      artifact: loopResult.artifact,
      raw: loopResult.raw,
      ...(config.trace.includeValidation ? { validation } : {}),
      trace,
    }
  })
  .build()

/** Workflow authoring for Browser Coding harness. @category Harness */
export async function invokeWorkflowAuthoringCoding(
  input: {
    request: string
    manifest?: unknown
    model?: string
    probeContext?: unknown
    files?: unknown[]
    conversationMessages?: CodingConversationMessage[]
  },
  ctx: HarnessCapabilityContext<Record<string, unknown>>
): Promise<HarnessEvaluateOutput> {
  return codingWorkflowAuthoringHarness.handler(
    {
      request: input.request,
      manifest: input.manifest,
      model: input.model,
      files: input.files as never,
      conversationMessages: input.conversationMessages,
    },
    ctx
  ) as Promise<HarnessEvaluateOutput>
}
