import { describe, expect, it } from "vitest"
import { workflow, step, testExtension } from "@executioncontrolprotocol/core"
import { createBrowserTestEnvironment } from "./helpers.js"
import { registerEnvironmentConformanceTests } from "../../../core/test/runtime-conformance.js"

registerEnvironmentConformanceTests("@executioncontrolprotocol/browser", () => createBrowserTestEnvironment("browser-conformance"))

describe("@executioncontrolprotocol/browser runtime", () => {
  it("runs echo workflow", async () => {
    const env = createBrowserTestEnvironment("browser-test")
    env.addExtensionBinding(testExtension)
    const manifest = workflow("Browser Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello browser" }).as("echo")])
      .toManifest()
    const ecp = await env.init()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.state.echo).toEqual({ echo: "hello browser" })
  })

  it("rejects a missing capability before run", async () => {
    const env = createBrowserTestEnvironment("browser-missing")
    env.addExtensionBinding(testExtension)
    const manifest = workflow("Missing")
      .run([step("@executioncontrolprotocol/test.does-not-exist", "Gone").with({}).as("gone")])
      .toManifest()
    const ecp = await env.init()
    await expect(ecp.run(manifest)).rejects.toThrow(/not registered/)
  })
})
