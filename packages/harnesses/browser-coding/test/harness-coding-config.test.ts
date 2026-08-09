import { describe, expect, it } from "vitest"
import {
  getHarnessCodingConfig,
  HARNESS_CODING_BINDING,
  HARNESS_TASKS,
} from "../src/harness-coding-config.js"
import { HARNESS_OUTPUT_FORMAT_TYPESCRIPT } from "@executioncontrolprotocol/core"

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
  it("binds coding profile on env binding", () => {
    expect(HARNESS_CODING_BINDING.harnessProfile).toBe("coding")
  })
})
