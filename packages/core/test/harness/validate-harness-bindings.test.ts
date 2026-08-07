import { describe, expect, it, beforeAll } from "vitest"
import { ECP_HARNESS_ERROR_CODES, ECP_MODEL_CAPABILITY_NAME } from "@executioncontrolprotocol/types"
import { Registry } from "../../src/registry/registry.js"
import { validateHarnessBindings } from "../../src/validate/harness.js"
import type { ResolvedBindings } from "../../src/environment/bindings.js"
import { registerTestMinimalHarness } from "../../src/harness/definitions/test-minimal-harness.js"
import { TEST_MINIMAL_HARNESS_ID } from "../../src/harness/definitions/test-minimal-harness.js"
import { registerCoreFormats } from "../../src/formats/register-core-formats.js"
import { registerTestExtension } from "../../src/testing/test-extension.js"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"

function harnessBindings(
  harnesses: ResolvedBindings["harnesses"],
  extensions: ResolvedBindings["extensions"] = []
): ResolvedBindings {
  return {
    runtime: { id: "@executioncontrolprotocol/node", config: {} },
    extensions,
    policies: [],
    harnesses,
    extensionHooks: [],
    policyHooks: [],
  }
}

describe("validateHarnessBindings", () => {
  const registry = new Registry()

  beforeAll(async () => {
    registerTestMinimalHarness()
    await registerCoreFormats(registry)
    await registerTestExtension(registry)
    await registerFormatToonExtension(registry)
  })

  it("accepts valid harness bindings with core JSON and bound TOON", () => {
    const bindings = harnessBindings(
      [
        {
          id: TEST_MINIMAL_HARNESS_ID,
          uses: "@executioncontrolprotocol/test.generate",
          config: {
            output: { format: "@executioncontrolprotocol/format-toon" },
            context: { descriptorFormat: "@executioncontrolprotocol/format-json" },
          },
        },
      ],
      [
        { id: "@executioncontrolprotocol/test", order: 0, config: {} },
        { id: "@executioncontrolprotocol/format-toon", order: 1, config: {} },
      ]
    )

    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("reports unknown harness", () => {
    const bindings = harnessBindings([
      { id: "@executioncontrolprotocol/unknown-harness", uses: "@executioncontrolprotocol/test.generate", config: {} },
    ])
    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe(ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS)
  })

  it("reports missing provider uses", () => {
    const bindings = harnessBindings([
      { id: TEST_MINIMAL_HARNESS_ID, uses: "" as "@executioncontrolprotocol/test.generate", config: {} },
    ])
    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe(ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS_PROVIDER)
  })

  it("reports provider contract mismatch when uses is not generate", () => {
    const bindings = harnessBindings(
      [{ id: TEST_MINIMAL_HARNESS_ID, uses: "@executioncontrolprotocol/test.echo", config: {} }],
      [{ id: "@executioncontrolprotocol/test", order: 0, config: {} }]
    )
    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === ECP_HARNESS_ERROR_CODES.HARNESS_PROVIDER_CONTRACT_MISMATCH)).toBe(
      true
    )
    expect(result.errors.some((e) => e.message.includes(ECP_MODEL_CAPABILITY_NAME))).toBe(true)
  })

  it("reports unbound provider extension", () => {
    const bindings = harnessBindings([
      { id: TEST_MINIMAL_HARNESS_ID, uses: "@executioncontrolprotocol/test.generate", config: {} },
    ])
    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS_PROVIDER)).toBe(
      true
    )
  })

  it("reports unregistered provider capability", () => {
    const bindings = harnessBindings(
      [{ id: TEST_MINIMAL_HARNESS_ID, uses: "@executioncontrolprotocol/missing.generate", config: {} }],
      [{ id: "@executioncontrolprotocol/missing", order: 0, config: {} }]
    )
    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("not registered"))).toBe(true)
  })

  it("reports unknown output format", () => {
    const bindings = harnessBindings(
      [
        {
          id: TEST_MINIMAL_HARNESS_ID,
          uses: "@executioncontrolprotocol/test.generate",
          config: { output: { format: "@executioncontrolprotocol/format-unknown" } },
        },
      ],
      [{ id: "@executioncontrolprotocol/test", order: 0, config: {} }]
    )
    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === ECP_HARNESS_ERROR_CODES.UNKNOWN_OUTPUT_FORMAT)).toBe(
      true
    )
  })

  it("reports unbound non-core output format", () => {
    const bindings = harnessBindings(
      [
        {
          id: TEST_MINIMAL_HARNESS_ID,
          uses: "@executioncontrolprotocol/test.generate",
          config: { output: { format: "@executioncontrolprotocol/format-toon" } },
        },
      ],
      [{ id: "@executioncontrolprotocol/test", order: 0, config: {} }]
    )
    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("not bound"))).toBe(true)
  })

  it("reports unknown descriptor format", () => {
    const bindings = harnessBindings(
      [
        {
          id: TEST_MINIMAL_HARNESS_ID,
          uses: "@executioncontrolprotocol/test.generate",
          config: {
            output: { format: "@executioncontrolprotocol/format-json" },
            context: { descriptorFormat: "@executioncontrolprotocol/format-unknown" },
          },
        },
      ],
      [{ id: "@executioncontrolprotocol/test", order: 0, config: {} }]
    )
    const result = validateHarnessBindings(registry, bindings)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("descriptor format"))).toBe(true)
  })
})
