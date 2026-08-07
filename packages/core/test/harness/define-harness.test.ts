import { describe, expect, it, beforeEach } from "vitest"
import { z } from "zod"
import { ECP_MODEL_GENERATE_INTERFACE } from "@executioncontrolprotocol/types"
import {
  defineHarness,
  isHarnessDefinition,
  resolveHarnessRef,
} from "../../src/harness/define-harness.js"
import { catalogHarness, resetHarnessCatalogForTests } from "../../src/harness/harness-catalog.js"
import {
  registerTestMinimalHarness,
  resetTestMinimalHarnessRegistrationForTests,
  TEST_MINIMAL_HARNESS_ID,
} from "../../src/harness/definitions/test-minimal-harness.js"

describe("defineHarness", () => {
  beforeEach(() => {
    resetHarnessCatalogForTests()
    resetTestMinimalHarnessRegistrationForTests()
  })

  it("requires a handler before build()", () => {
    expect(() =>
      defineHarness("@executioncontrolprotocol", "incomplete")
        .withConfig(z.object({}))
        .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
        .build()
    ).toThrow("requires .withHandler()")
  })

  it("builds a harness definition with handler", () => {
    const def = defineHarness("@executioncontrolprotocol", "sample")
      .withInput(z.object({ value: z.string() }))
      .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
      .withHandler(async (input) => input)
      .build()

    expect(def.id).toBe("@executioncontrolprotocol/sample")
    expect(isHarnessDefinition(def)).toBe(true)
    expect(isHarnessDefinition({ id: "@executioncontrolprotocol/x" })).toBe(false)
  })

  it("types handler input from withInput schema", async () => {
    const def = defineHarness("@executioncontrolprotocol", "typed-input")
      .withConfig(z.object({ prefix: z.string().default("p") }))
      .withInput(z.object({ value: z.string() }))
      .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
      .withHandler(async (input, ctx) => ({
        value: input.value,
        prefix: ctx.config.prefix,
      }))
      .build()

    const result = await def.handler({ value: "hello" }, {
      harnessId: def.id,
      uses: "@executioncontrolprotocol/test.generate" as never,
      config: { prefix: "ok" },
      capabilityContext: {} as never,
      environment: {} as never,
      ecp: {} as never,
      call: async () => undefined,
    })

    expect(result).toEqual({ value: "hello", prefix: "ok" })
  })

  it("resolves harness refs from catalog", () => {
    registerTestMinimalHarness()
    expect(resolveHarnessRef(TEST_MINIMAL_HARNESS_ID)?.id).toBe(TEST_MINIMAL_HARNESS_ID)
    expect(resolveHarnessRef("@executioncontrolprotocol/missing")).toBeUndefined()
  })

  it("resolves inline harness definitions", () => {
    const inline = defineHarness("@executioncontrolprotocol", "inline")
      .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
      .withHandler(async () => ({}))
      .build()
    catalogHarness(inline)
    expect(resolveHarnessRef(inline)?.id).toBe("@executioncontrolprotocol/inline")
  })

  it("allows idempotent test minimal harness registration", () => {
    registerTestMinimalHarness()
    registerTestMinimalHarness()
    expect(resolveHarnessRef(TEST_MINIMAL_HARNESS_ID)).toBeDefined()
  })
})
