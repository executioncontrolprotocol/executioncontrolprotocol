import { describe, expect, it } from "vitest"
import {
  HARNESS_NANO_BINDING,
  HARNESS_NANO_CHAT_REPAIR,
  HARNESS_NANO_REPAIR,
  HARNESS_TASKS,
  getHarnessNanoConfig,
} from "../src/harness-nano-config.js"

describe("HARNESS_TASKS", () => {
  it("exposes harness task ids including chat orchestrator", () => {
    expect(HARNESS_TASKS).toEqual({
      WORKFLOW_AUTHORING: "workflow-authoring",
      INTENT_CLASSIFICATION: "intent-classification",
      WORKFLOW_ASSISTANT: "workflow-assistant",
      CHAT: "chat",
    })
  })
})

describe("getHarnessNanoConfig", () => {
  it("maps workflow authoring to the @executioncontrolprotocol.workflow output schema", () => {
    const config = getHarnessNanoConfig(HARNESS_TASKS.WORKFLOW_AUTHORING)
    expect((config.output as { schema: string }).schema).toBe("@executioncontrolprotocol.workflow")
  })

  it("maps intent classification to the @executioncontrolprotocol.intent output schema", () => {
    const config = getHarnessNanoConfig(HARNESS_TASKS.INTENT_CLASSIFICATION)
    expect((config.output as { schema: string }).schema).toBe("@executioncontrolprotocol.intent")
  })

  it("maps the assistant task to the @executioncontrolprotocol.harness.reply output schema", () => {
    const config = getHarnessNanoConfig(HARNESS_TASKS.WORKFLOW_ASSISTANT)
    expect((config.output as { schema: string }).schema).toBe("@executioncontrolprotocol.harness.reply")
  })

  it("uses EQL output format for model tasks", () => {
    const modelTasks = [
      HARNESS_TASKS.WORKFLOW_AUTHORING,
      HARNESS_TASKS.INTENT_CLASSIFICATION,
      HARNESS_TASKS.WORKFLOW_ASSISTANT,
    ]
    for (const task of modelTasks) {
      const config = getHarnessNanoConfig(task)
      expect((config.output as { format: string }).format).toBe("@executioncontrolprotocol/format-eql")
    }
  })

  it("intent classification uses unfiltered prompt phase", () => {
    const config = getHarnessNanoConfig(HARNESS_TASKS.INTENT_CLASSIFICATION)
    expect((config.context as { promptPhase: string }).promptPhase).toBe("unfiltered")
    expect((config.context as { includeEnvironmentDescriptor: boolean }).includeEnvironmentDescriptor).toBe(
      false
    )
  })

  it("chat task exposes orchestration binding", () => {
    const config = getHarnessNanoConfig(HARNESS_TASKS.CHAT)
    expect(config.repair).toBeDefined()
    expect((config.context as { promptPhase: string }).promptPhase).toBe("contextualized")
  })

  it("enables the repair loop with multiple attempts", () => {
    const config = getHarnessNanoConfig(HARNESS_TASKS.WORKFLOW_AUTHORING)
    expect((config.repair as { enabled: boolean; maxAttempts: number }).enabled).toBe(true)
    expect((config.repair as { maxAttempts: number }).maxAttempts).toBeGreaterThan(1)
  })

  it("nano binding exposes repair and trace config", () => {
    expect(HARNESS_NANO_BINDING.repair).toBeDefined()
    expect(HARNESS_NANO_BINDING.trace).toBeDefined()
  })

  it("chat repair experiment enables prior output reinjection", () => {
    expect(HARNESS_NANO_CHAT_REPAIR.includePriorOutput).toBe(true)
    expect(HARNESS_NANO_CHAT_REPAIR.maxAttempts).toBe(HARNESS_NANO_REPAIR.maxAttempts)
  })
})
