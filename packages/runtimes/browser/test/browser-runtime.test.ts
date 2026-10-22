import { describe, expect, it } from "vitest"
import { workflow, step, registerTestExtension } from "@executioncontrolprotocol/core"
import { createBrowserTestEnvironment } from "./helpers.js"
import { registerRuntimeConformanceTests } from "../../../core/test/runtime-conformance.js"

registerRuntimeConformanceTests("@executioncontrolprotocol/browser", () => createBrowserTestEnvironment("browser-conformance"))

describe("@executioncontrolprotocol/browser runtime", () => {
  it("runs echo workflow", async () => {
    await registerTestExtension()
    const env = await createBrowserTestEnvironment("browser-test")
    env.addExtensionBinding("@executioncontrolprotocol/test", {})
    const manifest = workflow("Browser Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello browser" }).as("echo")])
      .toManifest()
    const ecp = await env.init()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.state.echo).toEqual({ echo: "hello browser" })
  })

  it("rejects a missing capability before run", async () => {
    await registerTestExtension()
    const env = await createBrowserTestEnvironment("browser-missing")
    env.addExtensionBinding("@executioncontrolprotocol/test", {})
    const manifest = workflow("Missing")
      .run([step("@executioncontrolprotocol/test.does-not-exist", "Gone").with({}).as("gone")])
      .toManifest()
    const ecp = await env.init()
    await expect(ecp.run(manifest)).rejects.toThrow(/not registered/)
  })
})
