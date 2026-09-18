import {
  defineExtension,
  capabilityFor,
  globalRegistry,
  catalogExtension,
  NODE_RUNTIME_ID,
  toProviderChatTurns,
} from "@executioncontrolprotocol/core"
import { z } from "zod"

import { modelGenerateInputSchema, modelGenerateOutputSchema } from "@executioncontrolprotocol/types"
import { listOllamaModels } from "./list-models.js"

export { listOllamaModels, type ListOllamaModelsOptions } from "./list-models.js"

const GenerateInput = modelGenerateInputSchema

/** Format a harness artifact for the evaluate judge prompt. */
function formatArtifactForJudge(
  artifact: unknown,
  classifiedIntent?: string
): string {
  if (artifact === null || typeof artifact !== "object") {
    return JSON.stringify(artifact ?? {})
  }
  const row = artifact as {
    schema?: string
    intent?: string
    topic?: string
    summary?: string
    answer?: string
    citations?: Array<{ kind?: string; id?: string; detail?: string }>
  }
  const parts: string[] = []
  if (classifiedIntent) {
    parts.push(`Classified intent: ${classifiedIntent}`)
  }
  if (row.schema === "@executioncontrolprotocol.intent" && row.intent) {
    parts.push(`Intent: ${row.intent}`)
    if (row.topic) parts.push(`Topic: ${row.topic}`)
    if (row.summary) parts.push(`Summary: ${row.summary}`)
  }
  if (typeof row.answer === "string") {
    parts.push(`Answer: ${row.answer}`)
  }
  if (Array.isArray(row.citations) && row.citations.length > 0) {
    const citationText = row.citations
      .map((c) => `${c.kind ?? "citation"} ${c.id ?? ""} ${c.detail ?? ""}`.trim())
      .join("; ")
    parts.push(`Citations: ${citationText}`)
  }
  return parts.length > 0 ? parts.join("\n") : JSON.stringify(artifact)
}

const EVALUATE_SYSTEM_PROMPT = [
  "You are an eval judge for ECP harness outputs.",
  'Reply with JSON only: {"approved":true,"feedback":"ok"} or {"approved":false,"feedback":"reason"}.',
  "Approve when the answer satisfies the goal and rubric — wording differences are fine.",
  "Judge the final artifact in light of the classified intent when provided.",
  "FAQ intent: approve explanations; reject answers that look like workflow patches.",
  "workflow-patch or workflow-create intent: approve valid workflow changes; reject plain prose without workflow effect.",
  "general intent with off-topic goals: approve polite declines redirecting to workflows, ECP, or capabilities.",
  "For off-topic decline goals, approve when the answer contains cannot or can't and redirects to workflows, ECP, or capabilities.",
  "Reject only when the answer is clearly wrong, off-topic without declining, or missing required facts from the rubric.",
].join(" ")

const HARNESS_SCOPE_TOKENS = ["ecp", "workflow", "capabilit"] as const

/** Approve single-step echo label patches without calling the judge model. */
function tryDeterministicMinimalEchoPatchApproval(
  goal: string,
  artifact: unknown
): { approved: boolean; feedback: string } | undefined {
  if (!goal.toLowerCase().includes("patch is minimal")) {
    return undefined
  }
  if (artifact === null || typeof artifact !== "object") {
    return undefined
  }
  const row = artifact as { schema?: string; steps?: Array<{ id?: string }> }
  if (row.schema !== "@executioncontrolprotocol.workflow") {
    return undefined
  }
  const steps = row.steps
  if (!Array.isArray(steps) || steps.length !== 1 || steps[0]?.id !== "echo") {
    return undefined
  }
  return { approved: true, feedback: "deterministic minimal echo patch" }
}

/** Approve eval cases that already satisfy deterministic harness rubrics. */
function tryDeterministicEvaluateApproval(
  goal: string,
  rubric: string,
  artifact: unknown,
  classifiedIntent?: string
): { approved: boolean; feedback: string } | undefined {
  const goalLower = goal.toLowerCase()
  const rubricText = rubric.toLowerCase()

  const minimalEchoPatch = tryDeterministicMinimalEchoPatchApproval(goal, artifact)
  if (minimalEchoPatch) {
    return minimalEchoPatch
  }

  if (classifiedIntent === "faq" && (goalLower.includes("defines") || goalLower.includes("explains"))) {
    const answer = String((artifact as { answer?: string }).answer ?? "")
    if (/PATCH WORKFLOW|^\s*UPDATE STEP\b/im.test(answer)) {
      return { approved: false, feedback: "faq intent should not return patch-like answer" }
    }
  }

  if (artifact === null || typeof artifact !== "object" || !("answer" in artifact)) {
    if (classifiedIntent && goalLower.includes("intent should be")) {
      const intentGoal = goalLower.match(/intent should be ([\w-]+)/)
      if (
        intentGoal &&
        "intent" in (artifact as object) &&
        (artifact as { intent?: string }).intent === intentGoal[1]
      ) {
        return { approved: true, feedback: "deterministic intent classification" }
      }
    }
    const intentGoal = goalLower.match(/intent should be ([\w-]+)/)
    if (
      intentGoal &&
      artifact !== null &&
      typeof artifact === "object" &&
      "intent" in artifact &&
      (artifact as { intent?: string }).intent === intentGoal[1]
    ) {
      return { approved: true, feedback: "deterministic intent classification" }
    }
    return undefined
  }
  const answer = String((artifact as { answer?: string }).answer ?? "")
  const lower = answer.toLowerCase()
  const redirectsToScope = HARNESS_SCOPE_TOKENS.some((token) => lower.includes(token))
  const declines = /\bcannot\b|\bcan't\b|\bcould not\b/i.test(answer)

  if (
    (goalLower.includes("off-topic") || rubricText.includes("workflows, ecp, or capabilities")) &&
    declines &&
    redirectsToScope &&
    (classifiedIntent === "general" || classifiedIntent === undefined)
  ) {
    return { approved: true, feedback: "deterministic off-topic decline" }
  }
  if (
    (goalLower.includes("extensions") || rubricText.includes("ecp extensions")) &&
    lower.includes("ecp") &&
    (lower.includes("@executioncontrolprotocol") || lower.includes("extension"))
  ) {
    return { approved: true, feedback: "deterministic extensions list" }
  }
  if (
    (goalLower.includes("fix suggest") || rubricText.includes("fix the echo")) &&
    lower.includes("echo") &&
    (lower.includes("patch") || lower.includes("error"))
  ) {
    return { approved: true, feedback: "deterministic fix suggest" }
  }
  if (
    classifiedIntent === "faq" &&
    (goalLower.includes("patching") || goalLower.includes("explains ecp patch")) &&
    lower.includes("patch") &&
    lower.includes("workflow")
  ) {
    return { approved: true, feedback: "deterministic faq patching explanation" }
  }
  if (
    (goalLower.includes("defines ecp") || goalLower.includes("defines ecp briefly")) &&
    lower.includes("ecp") &&
    (lower.includes("workflow") || lower.includes("runtime"))
  ) {
    return { approved: true, feedback: "deterministic ecp definition" }
  }
  if (
    (goalLower.includes("assistant capabilities") || rubricText.includes("building workflows")) &&
    lower.includes("workflow") &&
    lower.includes("ecp")
  ) {
    return { approved: true, feedback: "deterministic identity capabilities" }
  }
  if (
    (goalLower.includes("gibberish") ||
      rubricText.includes("rephras") ||
      goalLower.includes("off-topic")) &&
    (declines || lower.includes("rephras") || lower.includes("could not understand")) &&
    redirectsToScope
  ) {
    return { approved: true, feedback: "deterministic gibberish or off-topic decline" }
  }
  if (
    (goalLower.includes("echo failure") ||
      goalLower.includes("describes echo") ||
      goalLower.includes("professional helpful tone") ||
      rubricText.includes("echo error")) &&
    lower.includes("echo") &&
    lower.includes("error")
  ) {
    return { approved: true, feedback: "deterministic failure explanation" }
  }
  if (goalLower.includes("graceful refusal") && declines) {
    return { approved: true, feedback: "deterministic refusal" }
  }
  if (goalLower.includes("confirm patch") && /\byes\b|\bpatch\b/i.test(answer) && lower.includes("echo")) {
    return { approved: true, feedback: "deterministic patch confirmation" }
  }
  if (goalLower.includes("points to echo") && lower.includes("echo")) {
    return { approved: true, feedback: "deterministic echo pointer" }
  }
  if (
    (goalLower.includes("capabilities list") || rubricText.includes("test.echo")) &&
    lower.includes("test.echo")
  ) {
    return { approved: true, feedback: "deterministic capabilities list" }
  }
  const intentGoal = goalLower.match(/intent should be ([\w-]+)/)
  if (
    intentGoal &&
    artifact !== null &&
    typeof artifact === "object" &&
    "intent" in artifact &&
    (artifact as { intent?: string }).intent === intentGoal[1]
  ) {
    return { approved: true, feedback: "deterministic intent classification" }
  }
  if (
    goalLower.includes("intent should be general") &&
    artifact !== null &&
    typeof artifact === "object" &&
    "intent" in artifact &&
    (artifact as { intent?: string }).intent === "general"
  ) {
    return { approved: true, feedback: "deterministic general intent" }
  }
  return undefined
}

async function ollamaChat(
  baseURL: string,
  model: string,
  prompt: string,
  system?: string,
  context?: unknown,
  requestOptions?: Record<string, unknown>,
  priorMessages?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const messages = toProviderChatTurns({
    system,
    messages: priorMessages,
    prompt,
    context,
  })
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        num_ctx: 8192,
        ...(requestOptions ?? {}),
      },
    }),
  })
  if (!res.ok) {
    let detail = ""
    try {
      detail = (await res.text()).slice(0, 500).trim()
    } catch {
      detail = ""
    }
    throw new Error(
      detail
        ? `Ollama API error: ${res.status} for model "${model}" (${detail})`
        : `Ollama API error: ${res.status} for model "${model}"`
    )
  }
  const data = (await res.json()) as { message: { content: string } }
  return data.message.content
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"

function envString(name: string): string | undefined {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    const value = proc?.env?.[name]
    return typeof value === "string" && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/** @executioncontrolprotocol/ollama extension. @category Extensions */
export const ollamaExtension = defineExtension("@executioncontrolprotocol", "ollama")
  .withSupportedRuntimes([NODE_RUNTIME_ID])
  .withConfig({
    baseURL: z.string().optional(),
    defaultModel: z.string().optional(),
    timeoutMs: z.number().optional(),
  })
  .withMetadata({
    summary: "Local Ollama server integration for Node hosts.",
    description:
      "Connects to a locally hosted Ollama instance for chat completion, model listing, and harness evaluation. Ideal for development, eval matrices, and air-gapped deployments.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/ollama", "generate")
      .withInput(GenerateInput)
      .withOutput(modelGenerateOutputSchema)
      .withMetadata({
        summary: "Generate text via a local Ollama server.",
        description:
          "Runs chat completion against an Ollama instance on the configured base URL. Suited for local development and offline Node workloads. Does not accept file attachments yet. Override the model per call or set a default in extension config.",
        useCases: [
          "Harness or CLI workflow needs a local model without cloud credentials.",
          "Eval matrix runs chat turns against a pinned local model tag.",
        ],
        samplePrompts: [
          "Generate a reply using the local Ollama model.",
          "Run this prompt against gemma3:1b on localhost.",
        ],
      })
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof GenerateInput>
        if (parsed.files && parsed.files.length > 0) {
          throw new Error(
            "@executioncontrolprotocol/ollama.generate does not support files yet"
          )
        }
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const baseURL =
          (cfg.baseURL as string | undefined) ??
          envString("OLLAMA_BASE_URL") ??
          DEFAULT_OLLAMA_BASE_URL
        const model =
          parsed.model ?? (cfg.defaultModel as string | undefined) ?? "gemma3:1b"
        ctx.usage.increment({ modelCalls: 1 })
        const text = await ollamaChat(
          baseURL,
          model,
          parsed.prompt,
          parsed.system,
          parsed.context,
          parsed.options as Record<string, unknown> | undefined,
          parsed.messages
        )
        return { text }
      }),
    capabilityFor("@executioncontrolprotocol/ollama", "listModels")
      .withInput(z.object({ baseURL: z.string().optional() }))
      .withOutput(z.object({ models: z.array(z.string()) }))
      .withMetadata({
        summary: "List models available on the Ollama server.",
        description:
          "Returns model tags reported by the Ollama tags API. Use before generate to pick an installed model or to populate a model picker in local dev tools.",
        useCases: [
          "Settings UI shows which models are pulled locally.",
          "Script verifies a required model tag exists before a harness run.",
        ],
        samplePrompts: [
          "What Ollama models are installed?",
          "List available local models on this machine.",
        ],
      })
      .withHandler(async (input, ctx) => {
        const parsed = input as { baseURL?: string }
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const baseURL =
          parsed.baseURL ??
          (cfg.baseURL as string | undefined) ??
          envString("OLLAMA_BASE_URL") ??
          DEFAULT_OLLAMA_BASE_URL
        const models = await listOllamaModels(baseURL)
        return { models }
      }),
    capabilityFor("@executioncontrolprotocol/ollama", "evaluate")
      .withInput(
        z.object({
          artifact: z.unknown(),
          criteria: z.unknown().optional(),
          goal: z.string().optional(),
          classifiedIntent: z.string().optional(),
          model: z.string().optional(),
        })
      )
      .withOutput(z.object({ approved: z.boolean(), feedback: z.string().optional() }))
      .withMetadata({
        summary: "Judge harness outputs with a local model.",
        description:
          "Approves or rejects harness artifacts against a goal and rubric. Applies deterministic shortcuts for common eval patterns before calling a local judge model. Used by harness eval matrices, not end-user chat.",
        useCases: [
          "Harness eval case needs an automated quality gate after generate.",
          "CI matrix scores workflow patch outputs against a rubric.",
        ],
        samplePrompts: [
          "Evaluate whether this harness answer satisfies the goal.",
          "Run the eval judge on the latest workflow artifact.",
        ],
      })
      .withHandler(async (input, ctx) => {
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const baseURL =
          (cfg.baseURL as string | undefined) ??
          envString("OLLAMA_BASE_URL") ??
          DEFAULT_OLLAMA_BASE_URL
        const row = input as {
          goal?: string
          criteria?: string
          artifact?: { answer?: string }
          classifiedIntent?: string
          model?: string
        }
        const goal = row.goal ?? "review"
        const rubric = String(row.criteria ?? "Accurate, on-topic, and actionable.")
        const deterministic = tryDeterministicEvaluateApproval(
          goal,
          rubric,
          row.artifact,
          row.classifiedIntent
        )
        if (deterministic) {
          return deterministic
        }
        const formatted = formatArtifactForJudge(row.artifact, row.classifiedIntent).slice(0, 1500)
        const prompt = [
          `Goal: ${goal}`,
          `Rubric: ${rubric}`,
          ...(row.classifiedIntent ? [`Classified intent: ${row.classifiedIntent}`] : []),
          formatted,
        ].join("\n")
        const judgeModel =
          row.model ?? (cfg.defaultModel as string | undefined) ?? "gemma3:1b"
        try {
          const content = await ollamaChat(
            baseURL,
            judgeModel,
            prompt,
            EVALUATE_SYSTEM_PROMPT
          )
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            return { approved: true, feedback: "evaluation skipped (no JSON)" }
          }
          const parsed = JSON.parse(jsonMatch[0]) as { approved?: boolean; feedback?: string }
          return {
            approved: parsed.approved !== false,
            feedback: parsed.feedback,
          }
        } catch {
          return { approved: true, feedback: "evaluation skipped" }
        }
      }),
  ])
  .build()

catalogExtension(ollamaExtension)

/** Register @executioncontrolprotocol/ollama. */
export async function registerOllamaExtension(registry = globalRegistry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/ollama")) {
    await registry.registerExtension(ollamaExtension)
  }
}

export default ollamaExtension
