import { describe, expect, it } from "vitest"
import { environment, extension, registerTestExtension, runtime } from "@executioncontrolprotocol/core"
import { NODE_RUNTIME_ID, registerNodeRuntime } from "@executioncontrolprotocol/node"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"

describe("@executioncontrolprotocol/test generate EQL", () => {
  it("returns workflow EQL with USES (not capabilityId)", async () => {
    await registerNodeRuntime()
    await registerTestExtension()
    await registerFormatEqlExtension()

    const env = environment("test-generate")
      .withRuntime(runtime(NODE_RUNTIME_ID))
      .withExtensions([
        extension("@executioncontrolprotocol/format-eql").with({}),
        extension("@executioncontrolprotocol/test").with({}),
      ])
    const ecp = await env.init()

    const generated = await ecp
      .invoke("@executioncontrolprotocol/test.generate")
      .with({ prompt: "build me a workflow" })
      .process()
    expect(generated.success).toBe(true)

    const text =
      typeof generated.result === "object" &&
      generated.result !== null &&
      "text" in generated.result
        ? String((generated.result as { text: string }).text)
        : String(generated.result)
    expect(text).toContain("USES @executioncontrolprotocol/test.echo")
    expect(text).not.toContain("capabilityId")

    const decoded = await ecp
      .decode(text)
      .uses("@executioncontrolprotocol/format-eql")
      .to("@executioncontrolprotocol.workflow")
      .with({ headers: false })
      .process()
    expect(decoded.success).toBe(true)

    const manifest = decoded.result as { steps: Array<{ uses?: string }> }
    expect(manifest.steps[0]?.uses).toBe("@executioncontrolprotocol/test.echo")

    const validation = await ecp.validate(manifest as never)
    expect(validation.valid).toBe(true)

    await ecp.terminate()
  })
})
