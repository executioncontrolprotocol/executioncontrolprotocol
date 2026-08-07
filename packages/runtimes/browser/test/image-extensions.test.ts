import { describe, expect, it } from "vitest"
import { createBrowserDemoEnvironment, registerBrowserDefaults } from "../src/index.js"

describe("createBrowserDemoEnvironment image extensions", () => {
  it("describe includes FAL and image-sharp capabilities with schemas", async () => {
    await registerBrowserDefaults()
    const env = createBrowserDemoEnvironment("image-ext-test")
    const ecp = await env.init()
    const descriptor = await ecp.describe({
      capabilities: { include: ["id", "inputSchema", "outputSchema"] },
    })
    const ids = descriptor.capabilities.map((c) => c.id)
    expect(ids).toContain("@executioncontrolprotocol/fal.generate")
    expect(ids).toContain("@executioncontrolprotocol/image-sharp.inspect")
    expect(ids).toContain("@executioncontrolprotocol/image-sharp.transform")

    const fal = descriptor.capabilities.find((c) => c.id === "@executioncontrolprotocol/fal.generate")
    expect(fal?.inputSchema).toBeDefined()

    const inspect = descriptor.capabilities.find(
      (c) => c.id === "@executioncontrolprotocol/image-sharp.inspect"
    )
    expect(inspect?.inputSchema).toBeDefined()
    await ecp.terminate()
  })
})
