import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { CapabilityContext } from "../../src/runtime/context.js"
import { createHarnessCapabilityContext } from "../../src/harness/context.js"

function stubCapabilityContext(): CapabilityContext {
  return {
    store: {} as never,
    state: {},
    run: { id: "run-1", input: {} },
    step: { id: "step-1" },
    logger: {} as never,
    usage: { modelCalls: 0, costUsd: 0, tokens: 0 },
    capabilities: {
      call: async () => undefined,
    },
  }
}

describe("createHarnessCapabilityContext", () => {
  it("parses config with configSchema when provided", () => {
    const configSchema = z.object({
      prefix: z.string().default("default-prefix"),
    })

    const ctx = createHarnessCapabilityContext(
      "@executioncontrolprotocol/test" as never,
      "@executioncontrolprotocol/test.generate" as never,
      {},
      {} as never,
      {} as never,
      stubCapabilityContext(),
      configSchema
    )

    expect(ctx.config.prefix).toBe("default-prefix")
  })

  it("passes raw config when configSchema is omitted", () => {
    const ctx = createHarnessCapabilityContext(
      "@executioncontrolprotocol/test" as never,
      "@executioncontrolprotocol/test.generate" as never,
      { custom: true },
      {} as never,
      {} as never,
      stubCapabilityContext()
    )

    expect(ctx.config).toEqual({ custom: true })
  })
})
