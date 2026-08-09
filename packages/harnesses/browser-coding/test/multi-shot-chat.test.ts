import { describe, expect, it } from "vitest"
import { intentRoutesToAuthoring } from "@executioncontrolprotocol/harnesses-browser-nano"
import { ECP_INTENT_VALUES } from "@executioncontrolprotocol/types"
import { getHarnessCodingConfig, HARNESS_TASKS } from "../src/harness-coding-config.js"
import { chatResultAnswer, chatResultWorkflow } from "../src/multi-shot-chat.js"

describe("coding multi-shot chat helpers", () => {
  it("exposes chat task config", () => {
    const cfg = getHarnessCodingConfig(HARNESS_TASKS.CHAT)
    expect(cfg.repair).toBeDefined()
    expect(cfg.trace).toBeDefined()
  })

  it("routes create/patch intents to authoring", () => {
    expect(intentRoutesToAuthoring(ECP_INTENT_VALUES.WORKFLOW_CREATE)).toBe(true)
    expect(intentRoutesToAuthoring(ECP_INTENT_VALUES.WORKFLOW_PATCH)).toBe(true)
    expect(intentRoutesToAuthoring(ECP_INTENT_VALUES.FAQ)).toBe(false)
  })

  it("extracts answer and workflow from chat results", () => {
    expect(
      chatResultAnswer({
        artifact: { schema: "@executioncontrolprotocol.harness.reply", answer: "hello" },
        raw: "",
        trace: { harness: "@executioncontrolprotocol/harness-browser-coding" },
      })
    ).toBe("hello")
    expect(
      chatResultWorkflow({
        artifact: {
          schema: "@executioncontrolprotocol.workflow",
          version: "1.0",
          workflow: { id: "w", label: "W" },
          steps: [],
        },
        raw: "",
        trace: { harness: "@executioncontrolprotocol/harness-browser-coding" },
      })?.workflow.id
    ).toBe("w")
  })
})
