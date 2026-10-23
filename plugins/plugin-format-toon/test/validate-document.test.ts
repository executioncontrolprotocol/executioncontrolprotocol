import { describe, expect, it } from "vitest"
import { workflow, step } from "@executioncontrolprotocol/core"
import { validateEcpDocument } from "../src/validate-document.js"

describe("validateEcpDocument", () => {
  it("validates workflow manifests", () => {
    const manifest = workflow("W")
      .run([step("@executioncontrolprotocol/test.echo", "S").with({}).as("o")])
      .toManifest()
    const result = validateEcpDocument(manifest, "@executioncontrolprotocol.workflow")
    expect(result.valid).toBe(true)
  })

  it("skips validation for unknown schemas", () => {
    const result = validateEcpDocument(
      { schema: "@executioncontrolprotocol.future", version: "1.0" },
      "@executioncontrolprotocol.future"
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("reports environment manifest errors", () => {
    const result = validateEcpDocument(
      { schema: "@executioncontrolprotocol.environment", version: "1.0", environment: {} },
      "@executioncontrolprotocol.environment"
    )
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
