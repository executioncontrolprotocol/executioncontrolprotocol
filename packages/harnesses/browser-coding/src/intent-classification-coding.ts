import { compileHarnessArtifactSource } from "@executioncontrolprotocol/core/compile"
import {
  callModelGenerate,
  collectModelOutputFeedback,
  collectValidationFeedback,
  defineHarness,
  formatEnvironmentSummaryLines,
  formatFeedbackForModel,
  HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
  inferResponseFormatFromFormatter,
  isRepairFeedbackEcho,
  runModelRepairLoop,
  stripHarnessTypeScriptOutput,
  summarizeEnvironmentDescriptor,
  type HarnessCapabilityContext,
} from "@executioncontrolprotocol/core"
import {
  ECP_INTENT_SCHEMA,
  ECP_MODEL_GENERATE_INTERFACE,
  harnessEvaluateOutputSchema,
  LATEST_ECP_VERSION,
  type HarnessEvaluateOutput,
  type HarnessInvokeResult,
  type HarnessOperationFeedback,
  type ValidationResult,
} from "@executioncontrolprotocol/types"
import { z } from "zod"
import { BROWSER_CODING_HARNESS_ID } from "./harness-ids.js"
import {
  buildCodingRepairHint,
  buildCodingSystemPrompt,
  CODING_PROMPT_FIXTURE_IDS,
} from "./prompts/index.js"

const harnessConfigSchema = z.object({
  promptFixture: z
    .string()
    .default(CODING_PROMPT_FIXTURE_IDS.INTENT_CLASSIFICATION),
  system: z.string().optional(),
  context: z
    .object({
      includeEnvironmentDescriptor: z.boolean().default(false),
      includeEncodedDescriptor: z.boolean().default(false),
      descriptorFormat: z.string().default("@executioncontrolprotocol/format-json"),
    })
    .default({}),
  output: z
    .object({
      schema: z.string().default(ECP_INTENT_SCHEMA),
      format: z.string().default(HARNESS_OUTPUT_FORMAT_TYPESCRIPT),
      validate: z.boolean().default(true),
    })
    .default({}),
  repair: z
    .object({
      enabled: z.boolean().default(true),
      maxAttempts: z.number().default(1),
      includeValidationErrors: z.boolean().default(true),
    })
    .default({}),
  trace: z
    .object({
      includePrompt: z.boolean().default(false),
      includeRawOutput: z.boolean().default(true),
      includeValidation: z.boolean().default(true),
      includeRepairAttempts: z.boolean().default(true),
    })
    .default({}),
})

const harnessInputSchema = z.object({
  message: z.string(),
  model: z.string().optional(),
})

const codingIntentHarness = defineHarness("@executioncontrolprotocol", "browser-coding-intent-classification")
  .withConfig(harnessConfigSchema)
  .withInput(harnessInputSchema)
  .withOutput(harnessEvaluateOutputSchema)
  .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
  .withHandler(async (input, ctx) => {
    const config = ctx.config
    const format = config.output.format
    const system = config.system ?? buildCodingSystemPrompt(config.promptFixture)

    let environmentSummaryLines = ""
    if (config.context.includeEnvironmentDescriptor) {
      const descriptor = await ctx.ecp.describe()
      const summary = summarizeEnvironmentDescriptor(descriptor)
      environmentSummaryLines = formatEnvironmentSummaryLines(summary, {
        format: "plain",
      }).join("\n")
    }

    const buildPrompt = (repairText?: string) => {
      const lines = [`User message: ${input.message}`]
      if (
        /^how\s+(?:does|do)\b/i.test(input.message.trim()) &&
        /\bwork\b/i.test(input.message)
      ) {
        lines.push(
          "Routing hint: how-does questions about ECP features -> intent faq (not workflow-patch)."
        )
      }
      if (/^what is ecp\b/i.test(input.message.trim())) {
        lines.push("Routing hint: definitional questions about ECP -> intent faq.")
      }
      if (environmentSummaryLines) {
        lines.unshift("Environment capabilities:", environmentSummaryLines, "")
      }
      if (repairText) {
        lines.push(
          "Previous attempt failed. Fix and return corrected TypeScript only:",
          repairText,
          buildCodingRepairHint(config.promptFixture)
        )
      }
      return lines.join("\n")
    }

    const maxAttempts = config.repair.enabled ? 1 + config.repair.maxAttempts : 1
    let lastPrompt = buildPrompt()
    let validation = decodedValidationStub()

    const loopResult = await runModelRepairLoop({
      maxAttempts,
      generate: async ({ attempt, priorFeedback }) => {
        const repairText =
          attempt > 0 && config.repair.includeValidationErrors
            ? formatFeedbackForModel(priorFeedback)
            : undefined
        lastPrompt = buildPrompt(repairText)
        const generated = await callModelGenerate(
          ctx.uses,
          {
            prompt: lastPrompt,
            system,
            model: input.model,
            responseFormat: inferResponseFormatFromFormatter(format),
          },
          ctx.capabilityContext,
          format
        )
        return { raw: stripHarnessTypeScriptOutput(generated.text) }
      },
      evaluate: async (raw, { attempt, priorFeedback }) => {
        const feedback: HarnessOperationFeedback[] = []

        if (
          attempt > 0 &&
          config.repair.includeValidationErrors &&
          isRepairFeedbackEcho(raw, formatFeedbackForModel(priorFeedback))
        ) {
          return {
            success: false,
            feedback: [
              collectModelOutputFeedback(
                "Output echoed validation errors. Return only the intent TypeScript module."
              ),
            ],
          }
        }

        const compiled = await compileHarnessArtifactSource({
          source: raw,
          filename: "intent.ts",
          expectedSchema: ECP_INTENT_SCHEMA,
        })

        validation = compiled.validation ?? decodedValidationStub(!compiled.ok)
        if (!compiled.ok || !compiled.artifact) {
          const msg =
            compiled.compileErrors?.map((e) => e.message).join("; ") ?? "Compile failed"
          feedback.push(collectModelOutputFeedback(msg))
          if (validation.valid === false) {
            feedback.push(collectValidationFeedback(validation))
          }
          return { success: false, feedback }
        }

        if (config.output.validate && validation.valid === false) {
          feedback.push(collectValidationFeedback(validation))
          return { success: false, feedback }
        }

        const intent = (compiled.artifact as { intent?: string }).intent
        const msg = input.message.trim()
        if (
          intent === "workflow-patch" &&
          ((/^how\s+(?:does|do)\b/i.test(msg) && /\bwork\b/i.test(msg)) ||
            /^what is ecp\b/i.test(msg))
        ) {
          feedback.push(
            collectModelOutputFeedback(
              "Use intent faq for how-does or what-is questions about ECP."
            )
          )
          return { success: false, feedback }
        }

        return { success: true, artifact: compiled.artifact, feedback }
      },
    })

    const trace: HarnessInvokeResult["trace"] = {
      harness: BROWSER_CODING_HARNESS_ID,
      provider: ctx.uses,
      model: input.model,
      outputSchema: config.output.schema,
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

function decodedValidationStub(valid = true): ValidationResult {
  return {
    schema: "@executioncontrolprotocol.validation.result",
    version: LATEST_ECP_VERSION,
    valid,
    errors: [],
    warnings: [],
  }
}

/** Intent classification for Browser Coding harness. @category Harness */
export async function invokeIntentClassificationCoding(
  input: { message: string; model?: string },
  ctx: HarnessCapabilityContext<Record<string, unknown>>
): Promise<HarnessEvaluateOutput> {
  return codingIntentHarness.handler(input, ctx) as Promise<HarnessEvaluateOutput>
}
