import { describe, expect, it } from "vitest"
import { workflow, step, registerTestExtension } from "@executioncontrolprotocol/core"
import { createBrowserDemoEnvironment, createEcp, registerBrowserDefaults, type BrowserOperationalEcp } from "../src/index.js"

describe("createEcp", () => {
  it("returns operational ecp with encode fluent without fluent extension", async () => {
    await registerBrowserDefaults()
    const env = createBrowserDemoEnvironment("create-ecp-test")
    await registerTestExtension(env.getRegistry())
    env.addExtensionBinding("@executioncontrolprotocol/test", {})
    const ecp = await createEcp(env)
    const manifest = workflow("W")
      .run([step("@executioncontrolprotocol/test.echo", "E").with({ value: "x" }).as("o")])
      .toManifest()
    const fluent = await ecp.encode(manifest).uses("@executioncontrolprotocol/format-fluent").process()
    expect(fluent.success).toBe(true)
    expect(String(fluent.result)).toContain("export default workflow")
    await ecp.terminate()
  })

  it("exposeGlobal provides describe and invoke on globalThis.ecp", async () => {
    await registerBrowserDefaults()
    const env = createBrowserDemoEnvironment("global-ecp-test")
    await registerTestExtension(env.getRegistry())
    const ecp = await createEcp(env, { exposeGlobal: true })
    const globalEcp = (globalThis as { ecp?: BrowserOperationalEcp }).ecp
    expect(globalEcp).toBeDefined()
    expect(typeof globalEcp?.describe).toBe("function")
    expect(typeof globalEcp?.invoke).toBe("function")
    await ecp.terminate()
  })
})
