import { describe, expect, it } from "vitest"
import { extension, testExtension } from "../src/index.js"
import { formatToonExtension } from "@executioncontrolprotocol/format-toon"
import { createTestEnvironment, initEncodingTestEcp } from "./helpers.js"

describe("extension bindings", () => {
  it("registers bound extension definitions on encode", async () => {
    const ecp = await initEncodingTestEcp([extension(formatToonExtension)])

    const manifest = {
      schema: "@executioncontrolprotocol.workflow" as const,
      version: "1.0" as const,
      workflow: { id: "w" },
      steps: [],
    }

    const encoded = await ecp.encode(manifest).uses("@executioncontrolprotocol/format-toon").process()
    await ecp.terminate()
    expect(encoded.format).toBe("toon")
  })

  it("registers inline extension definition binding", async () => {
    const env = createTestEnvironment("inline-test").with([extension(testExtension)])

    await env.ensureBoundExtensionsRegistered()
    expect(env.getRegistry().getExtension("@executioncontrolprotocol/test")).toBeDefined()
  })
})
