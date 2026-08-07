import { describe, expect, it } from "vitest"
import { extension } from "@executioncontrolprotocol/core"
import { initEncodingTestEcp } from "../../../core/test/helpers.js"
import { registerFormatEqlExtension } from "../src/index.js"
import { loadWorkflowFixture } from "./helpers.js"

describe("ecp.encode/decode with @executioncontrolprotocol/format-eql", () => {
  it("fails when extension is not registered", async () => {
    const ecp = await initEncodingTestEcp()
    const manifest = loadWorkflowFixture("echo-workflow")
    await expect(
      ecp.encode(manifest).uses("@executioncontrolprotocol/format-eql").process()
    ).rejects.toThrow(/not registered/)
    await ecp.terminate()
  })

  it("round-trips workflow via fluent API", async () => {
    await registerFormatEqlExtension()
    const ecp = await initEncodingTestEcp([
      extension("@executioncontrolprotocol/format-eql").with({}),
    ])
    const manifest = loadWorkflowFixture("echo-workflow")

    const encoded = await ecp
      .encode(manifest)
      .uses("@executioncontrolprotocol/format-eql")
      .with({ options: { headers: false } })
      .process()
    expect(encoded.success).toBe(true)
    expect(String(encoded.result)).toContain("WORKFLOW echo-test")

    const decoded = await ecp
      .decode(encoded.result)
      .uses("@executioncontrolprotocol/format-eql")
      .to("@executioncontrolprotocol.workflow")
      .with({ options: { headers: false } })
      .process()
    expect(decoded.success).toBe(true)
    expect(decoded.result).toEqual(manifest)
    await ecp.terminate()
  })
})
