import { describe, expect, it } from "vitest"
import { defineExtension, capabilityFor } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { createBrowserTestEnvironment } from "./helpers.js"

const customerExt = defineExtension("@customer", "image-tools")
  .withCapabilities([
    capabilityFor("@customer/image-tools", "caption")
      .withInput(z.object({}))
      .withOutput(z.object({ ok: z.boolean() }))
      .withHandler(async () => ({ ok: true })),
  ])
  .build()

describe("dynamic browser registry", () => {
  it("describes dynamically registered extension", async () => {
    const env = await createBrowserTestEnvironment("dyn-describe")
    const operational = await env.init()
    const globalEcp = (globalThis as { ecp?: { registerExtension: (d: typeof customerExt) => Promise<void> } })
      .ecp
    await globalEcp!.registerExtension(customerExt)
    const descriptor = await operational.describe()
    expect(descriptor.extensions.some((e) => e.id === "@customer/image-tools")).toBe(true)
    expect(descriptor.capabilities.some((c) => c.id === "@customer/image-tools.caption")).toBe(
      true
    )
  })

  it("search finds dynamically registered capability", async () => {
    const env = await createBrowserTestEnvironment("dyn-search")
    const operational = await env.init()
    const globalEcp = (globalThis as { ecp?: { registerExtension: (d: typeof customerExt) => Promise<void> } })
      .ecp
    await globalEcp!.registerExtension(customerExt)
    const result = await operational.search("caption image")
    expect(result.results.some((r) => r.id === "@customer/image-tools.caption")).toBe(true)
  })
})
