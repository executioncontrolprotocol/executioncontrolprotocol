import { describe, expect, it } from "vitest"
import {
  getHarnessCodingConfig,
  HARNESS_CODING_BINDING,
  HARNESS_TASKS,
} from "../src/harness-coding-config.js"
import { HARNESS_OUTPUT_FORMAT_TYPESCRIPT } from "@executioncontrolprotocol/core"

describe("getHarnessCodingConfig", () => {
  it("uses typescript output format for all tasks", () => {
    for (const task of Object.values(HARNESS_TASKS)) {
      const config = getHarnessCodingConfig(task) as {
        output: { format: string }
      }
      expect(config.output.format).toBe(HARNESS_OUTPUT_FORMAT_TYPESCRIPT)
    }
  })

  it("binds coding profile on env binding", () => {
    expect(HARNESS_CODING_BINDING.harnessProfile).toBe("coding")
  })
})
