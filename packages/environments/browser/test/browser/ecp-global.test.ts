import { describe, expect, it } from "vitest"
import { defineExtension, capabilityFor } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { BROWSER_ENVIRONMENT_ID, createBrowserEnvironment } from "../../src/index.js"

const customerExt = defineExtension("@customer", "browser-only")
  .withCapabilities([
    capabilityFor("@customer/browser-only", "ping")
      .withInput(z.object({}))
      .withOutput(z.object({ ok: z.boolean() }))
      .withHandler(async () => ({ ok: true })),
  ])
  .build()

describe("globalThis.ecp in real browser", () => {
  it("registers extension via window.ecp", async () => {
    const env = createBrowserEnvironment(BROWSER_ENVIRONMENT_ID, "real-browser-global")
    const operational = await env.init()
    const globalEcp = (globalThis as {
      ecp?: { registerExtension: (d: typeof customerExt) => Promise<void> }
    }).ecp
    expect(globalEcp).toBeDefined()
    await globalEcp!.registerExtension(customerExt)
    const desc = await operational.describe()
    expect(desc.capabilities.some((c) => c.id === "@customer/browser-only.ping")).toBe(true)
  })
})
