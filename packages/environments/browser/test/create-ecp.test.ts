import { describe, expect, it } from "vitest"
import { workflow, step, extension, testExtension } from "@executioncontrolprotocol/core"
import {
  BROWSER_ENVIRONMENT_ID,
  createBrowserEnvironment,
  createEcp,
  type BrowserOperationalEcp,
} from "../src/index.js"

describe("createEcp", () => {
  it("returns operational ecp with encode fluent without fluent extension", async () => {
    const env = createBrowserEnvironment(BROWSER_ENVIRONMENT_ID, "create-ecp-test").with([
      extension(testExtension),
    ])
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
    const env = createBrowserEnvironment(BROWSER_ENVIRONMENT_ID, "global-ecp-test")
    const ecp = await createEcp(env, { exposeGlobal: true })
    const globalEcp = (globalThis as { ecp?: BrowserOperationalEcp }).ecp
    expect(globalEcp).toBeDefined()
    expect(typeof globalEcp?.describe).toBe("function")
    expect(typeof globalEcp?.invoke).toBe("function")
    await ecp.terminate()
  })
})
