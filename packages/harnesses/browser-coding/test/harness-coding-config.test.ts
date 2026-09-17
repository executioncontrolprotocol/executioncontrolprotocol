import { describe, expect, it } from "vitest"
import {
  getHarnessCodingConfig,
  HARNESS_CODING_BINDING,
  HARNESS_CODING_BINDING_MEDIUM,
  HARNESS_CODING_BINDING_SMALL,
  HARNESS_TASKS,
  codingPromptFixturesForProfile,
  codingRepairForProfile,
  resolveEffectiveCodingProfile,
} from "../src/harness-coding-config.js"
import { HARNESS_OUTPUT_FORMAT_TYPESCRIPT } from "@executioncontrolprotocol/core"
import { loadCodingHarnessPromptFixture } from "../src/prompts/index.js"
import {
  substituteCodingEvalGenerateCapability,
  CODING_EVAL_FIXTURE_GENERATE_CAPABILITY,
} from "./eval/helpers/coding-eval-fixtures.js"
import type { EvalCase } from "@executioncontrolprotocol/evals"

describe("getHarnessCodingConfig", () => {
  it("uses typescript output format for artifact tasks", () => {
    for (const task of [
      HARNESS_TASKS.INTENT_CLASSIFICATION,
      HARNESS_TASKS.WORKFLOW_AUTHORING,
      HARNESS_TASKS.WORKFLOW_ASSISTANT,
    ]) {
      const config = getHarnessCodingConfig(task) as {
        output: { format: string }
      }
      expect(config.output.format).toBe(HARNESS_OUTPUT_FORMAT_TYPESCRIPT)
    }
  })

  it("exposes chat task without typescript artifact output schema", () => {
    const config = getHarnessCodingConfig(HARNESS_TASKS.CHAT)
    expect(config.repair).toBeDefined()
    expect((config as { output?: unknown }).output).toBeUndefined()
  })

  it("binds small profile by default", () => {
    expect(HARNESS_CODING_BINDING.harnessProfile).toBe("small")
    expect(HARNESS_CODING_BINDING_SMALL.harnessProfile).toBe("small")
  })

  it("uses lighter repair and medium prompt fixtures for medium profile", () => {
    const repair = codingRepairForProfile("medium")
    expect(repair.task.maxAttempts).toBe(2)
    expect(repair.task.includePriorOutput).toBe(true)
    expect(repair.task.strictGoalChecks).toBe(false)
    const prompts = codingPromptFixturesForProfile("medium")
    expect(prompts.intent).toBe("intent-classification-coding-medium")
    const intent = getHarnessCodingConfig(HARNESS_TASKS.INTENT_CLASSIFICATION, "medium") as {
      promptFixture: string
      repair: { maxAttempts: number }
    }
    expect(intent.promptFixture).toBe(prompts.intent)
    expect(intent.repair.maxAttempts).toBe(2)
    const authoring = getHarnessCodingConfig(HARNESS_TASKS.WORKFLOW_AUTHORING, "medium") as {
      context: { environmentSummaryFormat?: string }
    }
    expect(authoring.context.environmentSummaryFormat).toBe("fluent")
  })

  it("keeps small profile on plain inventory and strict goal checks", () => {
    const repair = codingRepairForProfile("small")
    expect(repair.task.includePriorOutput).toBe(true)
    expect(repair.task.strictGoalChecks).toBe(true)
    const authoring = getHarnessCodingConfig(HARNESS_TASKS.WORKFLOW_AUTHORING, "small") as {
      context: { environmentSummaryFormat?: string }
    }
    expect(authoring.context.environmentSummaryFormat).toBe("plain")
  })

  it("thins medium create fixtures to grammar few-shots", () => {
    const fixture = loadCodingHarnessPromptFixture("workflow-authoring-create-coding-medium")
    expect(fixture.fewShots?.length).toBeLessThanOrEqual(3)
  })

  it("uses frontier repair and prompt fixtures", () => {
    expect(codingRepairForProfile("frontier").task.maxAttempts).toBe(1)
    expect(codingPromptFixturesForProfile("frontier").assistant).toBe(
      "workflow-assistant-coding-frontier"
    )
    expect(HARNESS_CODING_BINDING_MEDIUM.harnessProfile).toBe("medium")
  })

  it("resolves effective profile from Anthropic model ids", () => {
    expect(resolveEffectiveCodingProfile("small", "claude-sonnet-4-5")).toBe("medium")
    expect(resolveEffectiveCodingProfile("small", "claude-opus-4-5")).toBe("frontier")
    expect(resolveEffectiveCodingProfile("medium", "qwen2.5-coder:1.5b")).toBe("medium")
  })

  it("loads medium and frontier prompt fixtures", () => {
    expect(loadCodingHarnessPromptFixture("intent-classification-coding-medium").id).toBe(
      "intent-classification-coding-medium"
    )
    expect(loadCodingHarnessPromptFixture("workflow-authoring-create-coding-frontier").id).toBe(
      "workflow-authoring-create-coding-frontier"
    )
  })
})

describe("substituteCodingEvalGenerateCapability", () => {
  it("leaves ollama cases unchanged", () => {
    const cases = [
      {
        id: "x",
        title: "t",
        suite: "workflow-create",
        harness: "workflow-authoring",
        input: { request: `use ${CODING_EVAL_FIXTURE_GENERATE_CAPABILITY}` },
        assertions: { deterministic: [] },
      },
    ] as unknown as EvalCase[]
    expect(substituteCodingEvalGenerateCapability(cases, CODING_EVAL_FIXTURE_GENERATE_CAPABILITY)).toBe(
      cases
    )
  })

  it("rewrites full and short ollama generate ids", () => {
    const cases = [
      {
        id: "x",
        title: "t",
        suite: "assistant",
        harness: "workflow-assistant",
        input: {
          message: `use ${CODING_EVAL_FIXTURE_GENERATE_CAPABILITY} and ollama.generate`,
        },
        assertions: {
          deterministic: [{ type: "reply-contains", text: "ollama.generate" }],
        },
      },
    ] as unknown as EvalCase[]
    const out = substituteCodingEvalGenerateCapability(
      cases,
      "@executioncontrolprotocol/anthropic.generate"
    )
    const json = JSON.stringify(out)
    expect(json).toContain("@executioncontrolprotocol/anthropic.generate")
    expect(json).toContain("anthropic.generate")
    expect(json).not.toContain("ollama.generate")
  })
})
